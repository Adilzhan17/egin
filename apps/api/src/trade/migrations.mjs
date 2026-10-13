export async function migrateTrade(pool) {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query("SELECT pg_advisory_xact_lock(hashtext('egin-trade-migrations'))");
        await c.query(`
CREATE TABLE IF NOT EXISTS trade_migrations(version integer PRIMARY KEY,applied_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS crop_lots(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),client_id uuid NOT NULL,name text NOT NULL,crop text NOT NULL,product_type text NOT NULL DEFAULT '',grade text NOT NULL DEFAULT '',harvest_year integer NOT NULL CHECK(harvest_year BETWEEN 1900 AND 2200),quantity_ton numeric(20,3) NOT NULL CHECK(quantity_ton>0),reserved_ton numeric(20,3) NOT NULL DEFAULT 0 CHECK(reserved_ton>=0),shipped_ton numeric(20,3) NOT NULL DEFAULT 0 CHECK(shipped_ton>=0),quality jsonb NOT NULL DEFAULT '{}',storage jsonb NOT NULL,field_id text,ready_at timestamptz,notes text NOT NULL DEFAULT '',file_ids uuid[] NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_id),CHECK(reserved_ton+shipped_ton<=quantity_ton));
CREATE TABLE IF NOT EXISTS trade_listings(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),lot_id uuid NOT NULL REFERENCES crop_lots(id),client_id uuid NOT NULL,title text NOT NULL DEFAULT '',quantity_ton numeric(20,3),price_per_ton numeric(20,2),currency text NOT NULL DEFAULT 'KZT',region text NOT NULL DEFAULT '',delivery_terms text NOT NULL DEFAULT 'negotiable',handover jsonb,payment_terms text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',wizard_step integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'draft',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_id),CHECK(quantity_ton IS NULL OR quantity_ton>0),CHECK(price_per_ton IS NULL OR price_per_ton>0));
CREATE UNIQUE INDEX IF NOT EXISTS trade_listing_active_lot ON trade_listings(lot_id) WHERE status IN ('active','offers_received','partially_reserved','partially_sold');
CREATE INDEX IF NOT EXISTS trade_listing_search ON trade_listings(status,region,price_per_ton,id);
CREATE INDEX IF NOT EXISTS crop_lots_org ON crop_lots(organization_id,id);
CREATE TABLE IF NOT EXISTS trade_saved_listings(user_id text NOT NULL,listing_id uuid NOT NULL REFERENCES trade_listings(id) ON DELETE CASCADE,PRIMARY KEY(user_id,listing_id));
CREATE TABLE IF NOT EXISTS purchase_requests(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),client_id uuid NOT NULL,title text NOT NULL,crop text NOT NULL,quantity_ton numeric(20,3) NOT NULL,max_price numeric(20,2),currency text NOT NULL,region text NOT NULL DEFAULT '',quality jsonb NOT NULL DEFAULT '{}',notes text NOT NULL DEFAULT '',expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'draft',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_id));
CREATE TABLE IF NOT EXISTS trade_offers(id uuid PRIMARY KEY,listing_id uuid NOT NULL REFERENCES trade_listings(id),lot_id uuid NOT NULL REFERENCES crop_lots(id),buyer_id uuid NOT NULL REFERENCES business_organizations(id),seller_id uuid NOT NULL REFERENCES business_organizations(id),created_by text NOT NULL,client_id uuid NOT NULL,status text NOT NULL,version integer NOT NULL DEFAULT 1,last_proposer_id uuid NOT NULL REFERENCES business_organizations(id),terms jsonb NOT NULL,costs jsonb NOT NULL,file_ids uuid[] NOT NULL DEFAULT '{}',conversation_id uuid,deal_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(buyer_id,client_id),CHECK(buyer_id<>seller_id));
CREATE INDEX IF NOT EXISTS trade_offers_buyer ON trade_offers(buyer_id,id);CREATE INDEX IF NOT EXISTS trade_offers_seller ON trade_offers(seller_id,id);CREATE INDEX IF NOT EXISTS trade_offers_listing ON trade_offers(listing_id,status);
CREATE TABLE IF NOT EXISTS trade_offer_versions(offer_id uuid NOT NULL REFERENCES trade_offers(id),version integer NOT NULL,proposer_id uuid NOT NULL REFERENCES business_organizations(id),terms jsonb NOT NULL,costs jsonb NOT NULL,file_ids uuid[] NOT NULL DEFAULT '{}',created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(offer_id,version));
CREATE TABLE IF NOT EXISTS trade_deals(id uuid PRIMARY KEY,offer_id uuid NOT NULL UNIQUE REFERENCES trade_offers(id),offer_version integer NOT NULL,lot_id uuid NOT NULL REFERENCES crop_lots(id),listing_id uuid NOT NULL REFERENCES trade_listings(id),seller_id uuid NOT NULL REFERENCES business_organizations(id),buyer_id uuid NOT NULL REFERENCES business_organizations(id),terms jsonb NOT NULL,costs jsonb NOT NULL,quantity_ton numeric(20,3) NOT NULL CHECK(quantity_ton>0),price_per_ton numeric(20,2) NOT NULL CHECK(price_per_ton>0),currency text NOT NULL,gross numeric(24,2) NOT NULL,status text NOT NULL DEFAULT 'created',seller_terms boolean NOT NULL DEFAULT false,buyer_terms boolean NOT NULL DEFAULT false,seller_contract boolean NOT NULL DEFAULT false,buyer_contract boolean NOT NULL DEFAULT false,seller_complete boolean NOT NULL DEFAULT false,buyer_complete boolean NOT NULL DEFAULT false,cancel_requested_by uuid,dispute_resolved_by uuid,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS trade_deals_seller ON trade_deals(seller_id,id);CREATE INDEX IF NOT EXISTS trade_deals_buyer ON trade_deals(buyer_id,id);
CREATE TABLE IF NOT EXISTS trade_deal_events(id bigserial PRIMARY KEY,deal_id uuid NOT NULL REFERENCES trade_deals(id),actor_id text NOT NULL,event text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS deal_shipments(id uuid PRIMARY KEY,deal_id uuid NOT NULL REFERENCES trade_deals(id),client_id uuid NOT NULL,quantity_ton numeric(20,3) NOT NULL CHECK(quantity_ton>0),accepted_ton numeric(20,3),planned_at timestamptz,shipped_at timestamptz NOT NULL,delivered_at timestamptz,carrier text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',document_ids uuid[] NOT NULL DEFAULT '{}',quality jsonb,status text NOT NULL DEFAULT 'shipped',discrepancy text,resolve_seller boolean NOT NULL DEFAULT false,resolve_buyer boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(deal_id,client_id),CHECK(accepted_ton IS NULL OR(accepted_ton>=0 AND accepted_ton<=quantity_ton)));
CREATE TABLE IF NOT EXISTS deal_payments(id uuid PRIMARY KEY,deal_id uuid NOT NULL REFERENCES trade_deals(id),client_id uuid NOT NULL,amount numeric(24,2) NOT NULL CHECK(amount>0),currency text NOT NULL,paid_at timestamptz NOT NULL,reference text NOT NULL,document_ids uuid[] NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'reported',reported_by text NOT NULL,confirmed_by text,confirmed_at timestamptz,version integer NOT NULL DEFAULT 1,UNIQUE(deal_id,client_id));
CREATE TABLE IF NOT EXISTS trade_files(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),deal_id uuid REFERENCES trade_deals(id),uploaded_by text NOT NULL,kind text NOT NULL,name text NOT NULL,mime_type text NOT NULL,file_size bigint NOT NULL,path text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS deal_documents(id uuid PRIMARY KEY,deal_id uuid NOT NULL REFERENCES trade_deals(id),client_id uuid NOT NULL,file_id uuid NOT NULL REFERENCES trade_files(id),kind text NOT NULL,title text NOT NULL,replaces_id uuid REFERENCES deal_documents(id),uploaded_by text NOT NULL,organization_id uuid NOT NULL REFERENCES business_organizations(id),confirmed_by text,confirmed_at timestamptz,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(deal_id,client_id));
CREATE TABLE IF NOT EXISTS farm_expenses(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),client_id uuid NOT NULL,field_id text,lot_id uuid REFERENCES crop_lots(id),crop text,harvest_year integer NOT NULL,category text NOT NULL,amount numeric(24,2) NOT NULL CHECK(amount>=0),currency text NOT NULL,expense_date date NOT NULL,planned boolean NOT NULL DEFAULT false,notes text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,client_id));
CREATE INDEX IF NOT EXISTS farm_expense_scope ON farm_expenses(organization_id,harvest_year,currency);
CREATE TABLE IF NOT EXISTS farm_imports(organization_id uuid NOT NULL REFERENCES business_organizations(id),client_id uuid NOT NULL,expense_ids uuid[] NOT NULL,PRIMARY KEY(organization_id,client_id));
ALTER TABLE trade_deals ADD COLUMN IF NOT EXISTS lot_snapshot jsonb NOT NULL DEFAULT '{}';
ALTER TABLE trade_deals ADD COLUMN IF NOT EXISTS overdue_notified boolean NOT NULL DEFAULT false;
INSERT INTO trade_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
INSERT INTO trade_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS trade_saved_searches(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES business_organizations(id),user_id text NOT NULL,name text NOT NULL,filters jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,organization_id,filters));
CREATE TABLE IF NOT EXISTS trade_search_matches(search_id uuid NOT NULL REFERENCES trade_saved_searches(id) ON DELETE CASCADE,listing_id uuid NOT NULL REFERENCES trade_listings(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(search_id,listing_id));
CREATE TABLE IF NOT EXISTS trade_search_jobs(listing_id uuid PRIMARY KEY REFERENCES trade_listings(id) ON DELETE CASCADE,cursor_id uuid,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO trade_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
`);
        const checks = {
            crop_lots: { quality_object: "jsonb_typeof(quality)='object'", storage_object: "jsonb_typeof(storage)='object'" },
            trade_listings: { valid_status: "status IN ('draft','pending','active','offers_received','partially_reserved','partially_sold','sold','withdrawn','rejected','archived')", valid_currency: "currency IN ('KZT','USD','EUR')", valid_step: 'wizard_step BETWEEN 1 AND 6' },
            trade_offers: { valid_status: "status IN ('draft','sent','received','reviewing','countered','accepted','rejected','withdrawn','expired','converted')", terms_object: "jsonb_typeof(terms)='object' AND jsonb_typeof(costs)='array'" },
            trade_deals: { valid_status: "status IN ('created','negotiating','terms_agreed','awaiting_documents','contract_pending','contract_confirmed','awaiting_shipment','partially_shipped','fully_shipped','at_acceptance','discrepancy','accepted','awaiting_payment','partially_paid','paid','completed','cancelled','dispute')", valid_currency: "currency IN ('KZT','USD','EUR')", positive_gross: 'gross>0' },
            deal_shipments: { valid_status: "status IN ('shipped','accepted','discrepancy')" },
            deal_payments: { valid_status: "status IN ('reported','confirmed','rejected')", valid_currency: "currency IN ('KZT','USD','EUR')", bilateral_confirmation: "(status='confirmed')=(confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)" },
            purchase_requests: { valid_status: "status IN ('draft','active','withdrawn','completed')", positive_quantity: 'quantity_ton>0', positive_price: 'max_price IS NULL OR max_price>0', valid_currency: "currency IN ('KZT','USD','EUR')" },
            farm_expenses: { valid_currency: "currency IN ('KZT','USD','EUR')", valid_category: "category IN ('seeds','fertilizer','protection','fuel','equipment','labor','maintenance','storage','other')" },
            trade_files: { valid_kind: "kind IN ('image','document')", positive_size: 'file_size>0 AND file_size<=15728640' }
        };
        for (const [table, entries] of Object.entries(checks))
            for (const [name, condition] of Object.entries(entries)) {
                const constraint = table + '_' + name;
                if (!(await c.query('SELECT 1 FROM pg_constraint WHERE conname=$1', [constraint])).rowCount)
                    await c.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK(${condition})`);
            }
        await c.query('INSERT INTO trade_migrations(version) VALUES(3) ON CONFLICT DO NOTHING');
        await c.query('COMMIT');
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}
