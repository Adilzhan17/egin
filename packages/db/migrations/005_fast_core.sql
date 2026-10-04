-- Durable application deltas. The transaction lock makes ids follow commit order;
-- allocating an ordinary sequence alone can skip a late-committing transaction.
CREATE TABLE realtime_events (
 id bigserial PRIMARY KEY,
 type text NOT NULL,
 entity_id text NOT NULL,
 scope_kind text NOT NULL CHECK(scope_kind IN ('user','organization','conversation','public')),
 scope_id uuid,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX realtime_events_scope ON realtime_events(scope_kind,scope_id,id);
CREATE TABLE realtime_retention (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),floor_id bigint NOT NULL DEFAULT 0);
INSERT INTO realtime_retention VALUES(true,0);
CREATE FUNCTION egin_event(event_type text,entity text,scope text,scope_uuid uuid,data jsonb) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE event_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(614882029154);
 INSERT INTO realtime_events(type,entity_id,scope_kind,scope_id,payload) VALUES(event_type,entity,scope,scope_uuid,data) RETURNING id INTO event_id;
 PERFORM pg_notify('egin_events',event_id::text);
 RETURN event_id;
END $$;

CREATE FUNCTION egin_mutation_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb;kind text;scope text;owner uuid;entity text;data jsonb;
BEGIN
 item:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 entity:=item->>'id';data:=item;
 IF TG_TABLE_NAME='fields' THEN
  SELECT organization_id INTO owner FROM farms WHERE id=(item->>'farm_id')::uuid;
  scope:='organization';kind:=CASE WHEN TG_OP='DELETE' THEN 'field.deleted' ELSE 'field.updated' END;
  data:=jsonb_build_object('id',entity,'farm_id',item->>'farm_id','name',item->>'name','area_ha',item->'area_ha','revision',item->'revision','crop_id',item->'crop_id');
 ELSIF TG_TABLE_NAME='farms' THEN
  owner:=(item->>'organization_id')::uuid;scope:='organization';kind:='farm.updated';
 ELSIF TG_TABLE_NAME='ml_runs' THEN
  SELECT fa.organization_id INTO owner FROM fields f JOIN farms fa ON fa.id=f.farm_id WHERE f.id=(item->>'field_id')::uuid;
  scope:='organization';entity:=item->>'field_id';kind:='field.analysis.updated';
  data:=jsonb_build_object('id',item->>'id','field_id',entity,'created_at',item->>'created_at','model_version',item->>'model_version','field_revision',item->'field_revision','recommendation',item->'result'->'recommendation','risk',item->'result'->'risk');
 ELSIF TG_TABLE_NAME='listings' THEN
  scope:='public';kind:=CASE WHEN TG_OP='DELETE' OR item->>'status'='archived' THEN 'market.deleted' WHEN TG_OP='INSERT' THEN 'market.created' ELSE 'market.updated' END;
  data:=item-'location'-'description';
 ELSIF TG_TABLE_NAME='notifications' THEN
  scope:='user';owner:=(item->>'user_id')::uuid;kind:=CASE WHEN TG_OP='INSERT' THEN 'notification.created' ELSE 'notification.updated' END;
 ELSIF TG_TABLE_NAME='field_tasks' THEN
  scope:='user';owner:=(item->>'user_id')::uuid;kind:='task.updated';
 ELSIF TG_TABLE_NAME='field_notes' THEN
  SELECT fa.organization_id INTO owner FROM fields f JOIN farms fa ON fa.id=f.farm_id WHERE f.id=(item->>'field_id')::uuid;
  scope:='organization';kind:='note.created';
 ELSE RETURN COALESCE(NEW,OLD);
 END IF;
 IF scope='public' OR owner IS NOT NULL THEN
  PERFORM egin_event(kind,entity,scope,owner,data);
  IF TG_TABLE_NAME='ml_runs' THEN PERFORM egin_event('ml.completed',entity,scope,owner,data);END IF;
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER fast_fields AFTER INSERT OR UPDATE OR DELETE ON fields FOR EACH ROW EXECUTE FUNCTION egin_mutation_event();
CREATE TRIGGER fast_farms AFTER INSERT OR UPDATE ON farms FOR EACH ROW EXECUTE FUNCTION egin_mutation_event();
CREATE TRIGGER fast_ml AFTER INSERT ON ml_runs FOR EACH ROW EXECUTE FUNCTION egin_mutation_event();
CREATE TRIGGER fast_market AFTER INSERT OR UPDATE OR DELETE ON listings FOR EACH ROW EXECUTE FUNCTION egin_mutation_event();
CREATE TRIGGER fast_notifications AFTER INSERT OR UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION egin_mutation_event();
CREATE TRIGGER fast_tasks AFTER INSERT OR UPDATE ON field_tasks FOR EACH ROW EXECUTE FUNCTION egin_mutation_event();
CREATE TRIGGER fast_notes AFTER INSERT ON field_notes FOR EACH ROW EXECUTE FUNCTION egin_mutation_event();

CREATE TABLE assistant_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 client_id uuid NOT NULL,field_id uuid REFERENCES fields ON DELETE SET NULL,question text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
 answer text NOT NULL DEFAULT '',provider text,model text,error text,cancel_requested boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,client_id)
);
CREATE INDEX assistant_jobs_owner ON assistant_jobs(user_id,created_at DESC);
CREATE INDEX assistant_jobs_pending ON assistant_jobs(created_at) WHERE status='queued';

ALTER TABLE messages ADD COLUMN reply_to_id bigint REFERENCES messages ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN forwarded_from bigint REFERENCES messages ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN field_card jsonb;
ALTER TABLE messages ADD COLUMN edited_at timestamptz;
ALTER TABLE messages ADD COLUMN deleted_at timestamptz;
ALTER TABLE messages ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE message_reactions (
 message_id bigint REFERENCES messages ON DELETE CASCADE,user_id uuid REFERENCES users ON DELETE CASCADE,
 emoji text NOT NULL CHECK(length(emoji) BETWEEN 1 AND 20),PRIMARY KEY(message_id,user_id,emoji)
);
CREATE TABLE chat_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL REFERENCES conversations ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users,message_id bigint REFERENCES messages ON DELETE CASCADE,
 filename text NOT NULL,mime_type text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 1 AND 5242880),
 storage_name text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_presence (user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,last_seen timestamptz NOT NULL DEFAULT now());
CREATE TABLE conversation_typing (
 conversation_id uuid REFERENCES conversations ON DELETE CASCADE,user_id uuid REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,PRIMARY KEY(conversation_id,user_id)
);
ALTER TABLE field_notes ADD COLUMN client_id uuid;
CREATE UNIQUE INDEX field_notes_idempotent ON field_notes(user_id,client_id) WHERE client_id IS NOT NULL;
