export const featureKeys=['chat.video_notes','trade.enabled','trade.crop_listings','trade.buyer_offers','trade.profit_comparison','trade.deal_management','trade.logistics','farm.cost_accounting','farm.profit_analytics','billing.buyer_subscriptions','billing.farmer_pro','billing.qualified_leads','trade.partner_services'];

export async function migratePlatform(pool){
  const c=await pool.connect();
  try{
    await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('egin-platform-migrations'))");
    await c.query(`CREATE TABLE IF NOT EXISTS platform_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());`);
    if(!(await c.query('SELECT 1 FROM platform_migrations WHERE version=1')).rowCount){
      await c.query(`
      CREATE TABLE business_organizations(
        id uuid PRIMARY KEY,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),kind text NOT NULL CHECK(kind IN('farmer','buyer','partner','mixed')),
        owner_id text NOT NULL,public_profile jsonb NOT NULL DEFAULT '{}',private_profile jsonb NOT NULL DEFAULT '{}',
        verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status IN('unverified','pending','verified','rejected')),
        verification_note text NOT NULL DEFAULT '',verification_at timestamptz,version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE business_members(organization_id uuid REFERENCES business_organizations(id),user_id text NOT NULL,role text NOT NULL CHECK(role IN('owner','admin','trader','viewer')),joined_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,user_id));
      CREATE UNIQUE INDEX business_one_owner ON business_members(organization_id) WHERE role='owner';
      CREATE INDEX business_member_user ON business_members(user_id,organization_id);
      CREATE TABLE business_invitations(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),user_id text NOT NULL,inviter_id text NOT NULL,role text NOT NULL CHECK(role IN('admin','trader','viewer')),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','revoked')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days');
      CREATE UNIQUE INDEX business_pending_invite ON business_invitations(organization_id,user_id) WHERE status='pending';
      CREATE TABLE platform_admins(user_id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),granted_by text NOT NULL);
      CREATE TABLE platform_features(key text PRIMARY KEY,enabled boolean NOT NULL DEFAULT true,mode text NOT NULL DEFAULT 'all' CHECK(mode IN('all','users','roles','organizations')),targets jsonb NOT NULL DEFAULT '[]',version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE platform_config(key text PRIMARY KEY,value jsonb NOT NULL);
      INSERT INTO platform_config VALUES('videoNoteMaxSeconds','60');
      CREATE TABLE platform_audit(id bigserial PRIMARY KEY,actor_id text NOT NULL,action text NOT NULL,entity_type text NOT NULL,entity_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX platform_audit_entity ON platform_audit(entity_type,entity_id,id DESC);
      CREATE TABLE platform_notifications(id uuid PRIMARY KEY,sequence bigserial UNIQUE,user_id text NOT NULL,type text NOT NULL,entity_type text NOT NULL,entity_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',read_at timestamptz,delivered_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX platform_notifications_user ON platform_notifications(user_id,sequence DESC);
      CREATE TABLE platform_notification_preferences(user_id text PRIMARY KEY,enabled boolean NOT NULL DEFAULT true);
      CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text UNIQUE NOT NULL,name text NOT NULL,audience text NOT NULL CHECK(audience IN('buyer','farmer')),price numeric(14,2) NOT NULL CHECK(price>=0),currency text NOT NULL DEFAULT 'KZT' CHECK(currency='KZT'),period_days integer NOT NULL CHECK(period_days BETWEEN 1 AND 366),limits jsonb NOT NULL DEFAULT '{}',features jsonb NOT NULL DEFAULT '[]',active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE billing_invoices(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),client_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('subscription','lead')),target_id uuid NOT NULL,snapshot jsonb NOT NULL,amount numeric(14,2) NOT NULL CHECK(amount>0),currency text NOT NULL DEFAULT 'KZT' CHECK(currency='KZT'),status text NOT NULL DEFAULT 'issued' CHECK(status IN('issued','partially_paid','paid','cancelled','refunded')),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),paid_at timestamptz,UNIQUE(organization_id,client_id));
      CREATE INDEX billing_invoices_org ON billing_invoices(organization_id,created_at DESC);
      CREATE TABLE billing_proofs(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),uploader_id text NOT NULL,storage_key text NOT NULL,mime_type text NOT NULL,name text NOT NULL,file_size bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE billing_payments(id uuid PRIMARY KEY,invoice_id uuid NOT NULL REFERENCES billing_invoices(id),organization_id uuid NOT NULL REFERENCES business_organizations(id),client_id uuid NOT NULL,amount numeric(14,2) NOT NULL CHECK(amount>0),reference text NOT NULL,proof_id uuid NOT NULL REFERENCES billing_proofs(id),status text NOT NULL DEFAULT 'claimed' CHECK(status IN('claimed','confirmed','rejected','refunded')),claimed_by text NOT NULL,reviewed_by text,review_note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,UNIQUE(organization_id,client_id),UNIQUE(organization_id,reference));
      CREATE TABLE organization_subscriptions(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),plan_id uuid NOT NULL REFERENCES billing_plans(id),invoice_id uuid UNIQUE REFERENCES billing_invoices(id),snapshot jsonb NOT NULL,status text NOT NULL CHECK(status IN('active','trial','cancelled')),starts_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX organization_subscription_active ON organization_subscriptions(organization_id,expires_at DESC);
      CREATE TABLE business_leads(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),title text NOT NULL,summary text NOT NULL,contact_details jsonb NOT NULL,criteria text NOT NULL,consent_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','qualified','rejected','withdrawn')),price numeric(14,2) CHECK(price>0),review_note text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE lead_charges(id uuid PRIMARY KEY,lead_id uuid NOT NULL REFERENCES business_leads(id),organization_id uuid NOT NULL REFERENCES business_organizations(id),invoice_id uuid UNIQUE NOT NULL REFERENCES billing_invoices(id),consent_at timestamptz NOT NULL,refunded_at timestamptz,refund_note text NOT NULL DEFAULT '',UNIQUE(lead_id,organization_id));
      CREATE TABLE business_partner_services(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),kind text NOT NULL,title text NOT NULL,description text NOT NULL,region text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO platform_migrations(version) VALUES(1);`);
      for(const key of featureKeys)await c.query('INSERT INTO platform_features(key) VALUES($1)',[key]);
    }
    if(!(await c.query('SELECT 1 FROM platform_migrations WHERE version=2')).rowCount){
      await c.query(`
        CREATE TABLE billing_adjustments(id uuid PRIMARY KEY,invoice_id uuid UNIQUE NOT NULL REFERENCES billing_invoices(id),reference text NOT NULL,note text NOT NULL,actor_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE business_service_invitations(id uuid PRIMARY KEY,deal_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES business_organizations(id),partner_id uuid NOT NULL REFERENCES business_organizations(id),description text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(deal_id,organization_id,partner_id));
        CREATE TABLE business_service_offers(id uuid PRIMARY KEY,invitation_id uuid NOT NULL REFERENCES business_service_invitations(id),service_id uuid NOT NULL REFERENCES business_partner_services(id),client_id uuid NOT NULL,price numeric(14,2) NOT NULL CHECK(price>0),currency text NOT NULL CHECK(currency='KZT'),terms text NOT NULL,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'sent' CHECK(status IN('sent','accepted','rejected','withdrawn')),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(invitation_id,client_id));
        INSERT INTO platform_migrations(version) VALUES(2);
      `);
    }
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
