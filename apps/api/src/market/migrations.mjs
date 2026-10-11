import { categorySeed } from './categories.mjs';

// Additive, namespaced migrations. No existing authentication or workspace table is changed.
export async function migrateMarket(pool) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('egin-market-migrations'))");
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE TABLE IF NOT EXISTS market_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS market_categories(
        id text PRIMARY KEY, parent_id text REFERENCES market_categories(id), slug text NOT NULL,
        name_ru text NOT NULL,name_kk text NOT NULL DEFAULT '',sort_order integer NOT NULL DEFAULT 0,is_active boolean NOT NULL DEFAULT true,
        attribute_schema_version integer NOT NULL DEFAULT 1, config jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(parent_id,slug));
      CREATE UNIQUE INDEX IF NOT EXISTS market_categories_root_slug ON market_categories(slug) WHERE parent_id IS NULL;
      CREATE TABLE IF NOT EXISTS market_attribute_schemas(category_id text NOT NULL REFERENCES market_categories(id),version integer NOT NULL,schema jsonb NOT NULL,PRIMARY KEY(category_id,version));
      CREATE TABLE IF NOT EXISTS market_listings(
        id uuid PRIMARY KEY, owner_id text NOT NULL, client_id uuid,
        category_id text REFERENCES market_categories(id),deal_type text CHECK(deal_type IN('sell','buy','rent_out','rent_in','service_offer','service_request','vacancy','job_seeking')),
        status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','archived')),
        title varchar(120) NOT NULL DEFAULT '',description varchar(5000) NOT NULL DEFAULT '',attributes jsonb NOT NULL DEFAULT '{}',attributes_schema_version integer NOT NULL DEFAULT 1,
        price_mode text NOT NULL DEFAULT 'negotiable' CHECK(price_mode IN('fixed','from','negotiable')),price_amount numeric(16,2) CHECK(price_amount>=0),currency_code text NOT NULL DEFAULT 'KZT' CHECK(currency_code='KZT'),price_unit text NOT NULL DEFAULT 'all',
        quantity numeric(16,3) CHECK(quantity>=0),quantity_unit text NOT NULL DEFAULT '',country_code text NOT NULL DEFAULT 'KZ' CHECK(country_code='KZ'),
        region_code text NOT NULL DEFAULT '',district_code text NOT NULL DEFAULT '',locality_code text NOT NULL DEFAULT '',region_name text NOT NULL DEFAULT '',district_name text NOT NULL DEFAULT '',locality_name varchar(120) NOT NULL DEFAULT '',
        current_step integer NOT NULL DEFAULT 1 CHECK(current_step BETWEEN 1 AND 5),version integer NOT NULL DEFAULT 1 CHECK(version>0),
        contact_phone text NOT NULL DEFAULT '',allow_phone boolean NOT NULL DEFAULT false,delivery varchar(1000) NOT NULL DEFAULT '',
        search_text text NOT NULL DEFAULT '', search_vector tsvector,
        published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
        UNIQUE(owner_id,client_id), CHECK(price_mode<>'negotiable' OR price_amount IS NULL));
      CREATE INDEX IF NOT EXISTS market_public_latest ON market_listings(published_at DESC,id) WHERE status='published';
      CREATE INDEX IF NOT EXISTS market_owner_status ON market_listings(owner_id,status,updated_at DESC);
      CREATE INDEX IF NOT EXISTS market_category ON market_listings(category_id) WHERE status='published';
      CREATE INDEX IF NOT EXISTS market_deal ON market_listings(deal_type) WHERE status='published';
      CREATE INDEX IF NOT EXISTS market_region ON market_listings(region_code) WHERE status='published';
      CREATE INDEX IF NOT EXISTS market_price ON market_listings(price_unit,price_amount) WHERE status='published';
      CREATE INDEX IF NOT EXISTS market_search_vector ON market_listings USING gin(search_vector);
      CREATE INDEX IF NOT EXISTS market_search_trgm ON market_listings USING gin(search_text gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS market_attributes ON market_listings USING gin(attributes);
      CREATE TABLE IF NOT EXISTS market_listing_images(id uuid PRIMARY KEY,listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
        storage_key text NOT NULL UNIQUE,mime_type text NOT NULL,file_size integer NOT NULL,width integer NOT NULL,height integer NOT NULL,
        sort_order integer NOT NULL CHECK(sort_order BETWEEN 0 AND 7),is_cover boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(listing_id,sort_order) DEFERRABLE INITIALLY DEFERRED);
      CREATE TABLE IF NOT EXISTS market_favorites(id uuid PRIMARY KEY,listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,listing_id));
      CREATE TABLE IF NOT EXISTS market_listing_reports(id uuid PRIMARY KEY,listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,reporter_id text NOT NULL,reason text NOT NULL,description varchar(2000) NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewed','dismissed')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(listing_id,reporter_id));
      CREATE TABLE IF NOT EXISTS market_listing_events(id uuid PRIMARY KEY,listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,actor_id text NOT NULL,event_type text NOT NULL,event_payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS market_events_listing ON market_listing_events(listing_id,created_at);
      CREATE TABLE IF NOT EXISTS market_geography(code text PRIMARY KEY,parent_code text REFERENCES market_geography(code),name text NOT NULL,level text NOT NULL CHECK(level IN('region','district','locality')),updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO market_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;`);
    for(const category of categorySeed) {
      await client.query(`INSERT INTO market_categories(id,parent_id,slug,name_ru,name_kk,sort_order,attribute_schema_version,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,[category.id,category.parentId,category.slug,category.nameRu,category.nameKk,category.sortOrder,category.attributeSchema.version,category]);
      await client.query(`INSERT INTO market_attribute_schemas(category_id,version,schema) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[category.id,category.attributeSchema.version,category.attributeSchema]);
    }
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
