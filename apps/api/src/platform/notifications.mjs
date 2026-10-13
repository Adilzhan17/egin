import {fail,identifier,uuid} from './validation.mjs';

// Resolve links at click time: membership can change after an event was recorded.
export function installNotificationDestinations({router,service,wrap}) {
  const {pool}=service;
  router.get('/notifications/:id/destination',wrap(async(req,res)=>{
    const n=(await pool.query('SELECT * FROM platform_notifications WHERE id=$1 AND user_id=$2',[identifier(req.params.id),req.user.id])).rows[0];
    if(!n||!uuid(n.entity_id))throw fail(404,'Событие недоступно');
    const memberships=(await pool.query('SELECT organization_id,role FROM business_members WHERE user_id=$1 ORDER BY joined_at,organization_id',[req.user.id])).rows;
    const choose=(ids,roles)=>memberships.find(m=>ids.includes(m.organization_id)&&(!roles||roles.includes(m.role)))?.organization_id;
    let organizationId,view='business',screen,tab='profile',id,invoiceId;
    const invitationId=n.entity_type==='service_invitation'?n.entity_id:n.type.startsWith('service.')&&uuid(n.payload.invitationId)?n.payload.invitationId:null;
    if(invitationId){
      const i=(await pool.query('SELECT organization_id,partner_id FROM business_service_invitations WHERE id=$1',[invitationId])).rows[0];
      if(i)organizationId=choose([i.organization_id,i.partner_id]);tab='services';id=invitationId;
    }else if(n.entity_type==='organization'){
      organizationId=choose([n.entity_id]);
      if(!organizationId&&n.type==='organization.invitation'){
        const i=(await pool.query("SELECT organization_id FROM business_invitations WHERE organization_id=$1 AND user_id=$2 AND status='pending' AND expires_at>now()",[n.entity_id,req.user.id])).rows[0];
        organizationId=i?.organization_id;
      }
      if(n.type==='members.changed')tab='team';
    }else if(n.entity_type==='invoice'){
      const i=(await pool.query('SELECT organization_id FROM billing_invoices WHERE id=$1',[n.entity_id])).rows[0];
      if(i)organizationId=choose([i.organization_id],['owner','admin']);tab='billing';invoiceId=n.entity_id;
    }else if(n.entity_type==='lead'){
      const ids=(await pool.query('SELECT organization_id FROM business_leads WHERE id=$1 UNION SELECT organization_id FROM lead_charges WHERE lead_id=$1',[n.entity_id])).rows.map(r=>r.organization_id);
      organizationId=choose(ids);tab='leads';id=n.entity_id;
    }else if(['offer','deal'].includes(n.entity_type)){
      const table=n.entity_type==='offer'?'trade_offers':'trade_deals';
      if((await pool.query('SELECT to_regclass($1) t',[table])).rows[0].t){
        const entity=(await pool.query(`SELECT seller_id,buyer_id FROM ${table} WHERE id=$1`,[n.entity_id])).rows[0];
        if(entity)organizationId=choose([entity.seller_id,entity.buyer_id]);
      }
      view='trade';screen=n.entity_type;id=n.entity_id;
    }else if(n.entity_type==='expense'){
      if((await pool.query("SELECT to_regclass('farm_expenses') t")).rows[0].t){
        const expense=(await pool.query('SELECT organization_id FROM farm_expenses WHERE id=$1',[n.entity_id])).rows[0];
        const org=expense?.organization_id||n.payload.previous?.organizationId;
        if(uuid(org))organizationId=choose([org]);
      }
      view='trade';screen='finance';id=n.entity_id;
    }else if(['lot','listing','request','purchase_request'].includes(n.entity_type)){
      const table={lot:'crop_lots',listing:'trade_listings',request:'purchase_requests',purchase_request:'purchase_requests'}[n.entity_type];
      if((await pool.query('SELECT to_regclass($1) t',[table])).rows[0].t){
        const entity=(await pool.query(`SELECT * FROM ${table} WHERE id=$1`,[n.entity_id])).rows[0];
        if(entity)organizationId=choose([entity.organization_id]);
        if(!organizationId&&n.type==='listing.search_match'&&['active','offers_received','partially_reserved','partially_sold'].includes(entity?.status)&&uuid(n.payload.searchId)){
          const search=(await pool.query('SELECT organization_id FROM trade_saved_searches WHERE id=$1 AND user_id=$2',[n.payload.searchId,req.user.id])).rows[0];
          organizationId=choose([search?.organization_id,n.payload.organizationId].filter(uuid));
        }
      }
      view='trade';screen=['request','purchase_request'].includes(n.entity_type)?'requests':n.entity_type;id=n.entity_id;
    }
    if(!organizationId)throw fail(404,'Объект недоступен или ваши права изменились');
    res.json({destination:{organizationId,view,...(view==='trade'?{screen,id}:{tab,...(id?{id}:{}),...(invoiceId?{invoiceId}:{})})}});
  }));
}
