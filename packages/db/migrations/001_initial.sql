CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profiles (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE, name text NOT NULL,
 language text NOT NULL DEFAULT 'ru' CHECK(language IN ('ru','kk')),
 region text, onboarded boolean NOT NULL DEFAULT false
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE organization_members (
 organization_id uuid REFERENCES organizations ON DELETE CASCADE, user_id uuid REFERENCES users ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('owner','admin','agronomist','worker','viewer')), PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE farms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, name text NOT NULL, region text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE admin_boundaries (
 id text PRIMARY KEY, level smallint NOT NULL CHECK(level BETWEEN 0 AND 3),
 name_ru text, name_kk text, name_en text, parent_id text REFERENCES admin_boundaries,
 source text NOT NULL, source_version text NOT NULL, geometry geometry(MultiPolygon,4326) NOT NULL
);
CREATE INDEX admin_boundaries_geom ON admin_boundaries USING gist(geometry);
CREATE INDEX admin_boundaries_level ON admin_boundaries(level);
CREATE TABLE crop_catalog (id text PRIMARY KEY, name_ru text NOT NULL, name_kk text NOT NULL);
CREATE TABLE fields (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES farms ON DELETE CASCADE,
 name text NOT NULL, crop_id text REFERENCES crop_catalog, geometry geometry(MultiPolygon,4326) NOT NULL,
 area_ha double precision NOT NULL, centroid geometry(Point,4326) NOT NULL,
 region_id text REFERENCES admin_boundaries, district_id text REFERENCES admin_boundaries,
 revision integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT valid_field CHECK(ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry) AND area_ha > 0)
);
CREATE INDEX fields_geom ON fields USING gist(geometry);
CREATE INDEX fields_geography ON fields USING gist((geometry::geography));
CREATE INDEX fields_farm ON fields(farm_id);
CREATE TABLE field_geometry_versions (
 id bigserial PRIMARY KEY, field_id uuid NOT NULL REFERENCES fields ON DELETE CASCADE,
 revision integer NOT NULL, geometry geometry(MultiPolygon,4326) NOT NULL, area_ha double precision NOT NULL,
 changed_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(field_id,revision)
);
CREATE FUNCTION field_derived_values() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.area_ha := ST_Area(NEW.geometry::geography)/10000;
 NEW.centroid := ST_Centroid(NEW.geometry);
 NEW.region_id := (SELECT id FROM admin_boundaries WHERE level=1 AND ST_Intersects(geometry,NEW.geometry) ORDER BY ST_Area(ST_Intersection(geometry,NEW.geometry)::geography) DESC LIMIT 1);
 NEW.district_id := (SELECT id FROM admin_boundaries WHERE level=2 AND ST_Intersects(geometry,NEW.geometry) ORDER BY ST_Area(ST_Intersection(geometry,NEW.geometry)::geography) DESC LIMIT 1);
 NEW.updated_at := now();
 RETURN NEW;
END $$;
CREATE TRIGGER derive_field BEFORE INSERT OR UPDATE OF geometry ON fields FOR EACH ROW EXECUTE FUNCTION field_derived_values();
CREATE FUNCTION field_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO field_geometry_versions(field_id,revision,geometry,area_ha,changed_by) VALUES(NEW.id,NEW.revision,NEW.geometry,NEW.area_ha,NEW.created_by);
 RETURN NEW;
END $$;
CREATE TRIGGER snapshot_field AFTER INSERT OR UPDATE OF geometry ON fields FOR EACH ROW EXECUTE FUNCTION field_snapshot();
CREATE TABLE field_crop_cycles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields ON DELETE CASCADE, crop_id text NOT NULL REFERENCES crop_catalog, season integer NOT NULL, UNIQUE(field_id,season));
CREATE TABLE weather_cache (cache_key text PRIMARY KEY, payload jsonb NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL);
CREATE TABLE soil_cache (LIKE weather_cache INCLUDING ALL);
CREATE TABLE climate_cache (LIKE weather_cache INCLUDING ALL);
CREATE TABLE geocode_cache (LIKE weather_cache INCLUDING ALL);
CREATE TABLE ml_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid REFERENCES fields ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users, field_revision integer NOT NULL, model_version text NOT NULL,
 features jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ml_runs_field_date ON ml_runs(field_id,created_at DESC);
CREATE TABLE conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, kind text NOT NULL CHECK(kind IN ('direct','group','assistant')), created_by uuid REFERENCES users, direct_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE conversation_members (conversation_id uuid REFERENCES conversations ON DELETE CASCADE, user_id uuid REFERENCES users ON DELETE CASCADE, joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,user_id));
CREATE TABLE messages (id bigserial PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 6000), client_id uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,client_id));
CREATE INDEX messages_conversation_history ON messages(conversation_id,id DESC);
CREATE TABLE message_reads (conversation_id uuid REFERENCES conversations ON DELETE CASCADE, user_id uuid REFERENCES users ON DELETE CASCADE, last_read_id bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,user_id));
CREATE TABLE listings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users,
 type text NOT NULL CHECK(type IN ('product','machinery_rental','service','job')), title text NOT NULL,
 description text NOT NULL, price numeric(14,2) NOT NULL DEFAULT 0 CHECK(price>=0), unit text NOT NULL DEFAULT '₸',
 region text NOT NULL, location geometry(Point,4326), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 is_demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_location ON listings USING gist((location::geography));
CREATE INDEX listings_active ON listings(type,created_at DESC) WHERE status='active';
CREATE TABLE listing_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES listings ON DELETE CASCADE, path text NOT NULL, position smallint NOT NULL DEFAULT 0);
CREATE TABLE favorites (user_id uuid REFERENCES users ON DELETE CASCADE, listing_id uuid REFERENCES listings ON DELETE CASCADE, PRIMARY KEY(user_id,listing_id));
CREATE TABLE news_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, summary text NOT NULL, source text NOT NULL, external_url text UNIQUE, published_at timestamptz, tags text[] NOT NULL DEFAULT '{}', regions text[] NOT NULL DEFAULT '{}', crop_tags text[] NOT NULL DEFAULT '{}', is_demo boolean NOT NULL DEFAULT false);
CREATE TABLE user_interests (user_id uuid REFERENCES users ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('region','crop','topic')), value text NOT NULL, PRIMARY KEY(user_id,kind,value));
CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, title text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE assistant_history (id bigserial PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,field_id uuid REFERENCES fields ON DELETE CASCADE,question text NOT NULL,answer jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
