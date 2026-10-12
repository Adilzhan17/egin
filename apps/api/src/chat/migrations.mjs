// Chat owns only chat_* objects; users and Market remain in their existing stores.
export async function migrateChat(pool) {
  for(let attempt=0;;attempt++){
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('egin-chat-migrations'))");
    if((await c.query("SELECT to_regclass('chat_migrations') existing")).rows[0].existing){
      const version=(await c.query('SELECT coalesce(max(version),0)::int version FROM chat_migrations')).rows[0].version;
      if(version>=3){await c.query('COMMIT');return;}
      // Yield to the active deployment before holding any DDL table lock.
      // NOWAIT + rollback prevents upgrades from deadlocking ongoing sends/reads.
      await c.query('LOCK TABLE chat_conversations,chat_conversation_members,chat_attachments,chat_message_receipts IN ACCESS EXCLUSIVE MODE NOWAIT');
    }
    await c.query(`
      CREATE TABLE IF NOT EXISTS chat_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS chat_conversations(id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('direct','market','group')),pair_key text UNIQUE,listing_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS chat_conversation_members(conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,user_id text NOT NULL,role text NOT NULL DEFAULT 'member' CHECK(role IN('owner','admin','member')),can_write boolean NOT NULL DEFAULT true,muted boolean NOT NULL DEFAULT false,pinned boolean NOT NULL DEFAULT false,last_read_sequence bigint NOT NULL DEFAULT 0 CHECK(last_read_sequence>=0),joined_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(conversation_id,user_id));
      CREATE INDEX IF NOT EXISTS chat_members_user ON chat_conversation_members(user_id,conversation_id);
      CREATE TABLE IF NOT EXISTS chat_groups(conversation_id uuid PRIMARY KEY REFERENCES chat_conversations(id) ON DELETE CASCADE,name varchar(100) NOT NULL CHECK(length(trim(name))>0),description varchar(1000) NOT NULL DEFAULT '',category text NOT NULL,region varchar(120) NOT NULL DEFAULT '',access text NOT NULL CHECK(access IN('public','private')),avatar_id uuid);
      CREATE TABLE IF NOT EXISTS chat_group_bans(conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(conversation_id,user_id));
      CREATE TABLE IF NOT EXISTS chat_messages(id uuid PRIMARY KEY,conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,sender_id text NOT NULL,client_id uuid NOT NULL,sequence bigserial UNIQUE NOT NULL,kind text NOT NULL CHECK(kind IN('text','image','document','audio','listing_reference','location')),text varchar(4000) NOT NULL DEFAULT '',reply_to_message_id uuid REFERENCES chat_messages(id),listing_id uuid,location jsonb,created_at timestamptz NOT NULL DEFAULT now(),edited_at timestamptz,deleted_at timestamptz,UNIQUE(sender_id,client_id));
      CREATE INDEX IF NOT EXISTS chat_messages_history ON chat_messages(conversation_id,sequence DESC);
      CREATE INDEX IF NOT EXISTS chat_messages_search ON chat_messages USING gin(to_tsvector('simple',text)) WHERE deleted_at IS NULL;
      CREATE TABLE IF NOT EXISTS chat_attachments(id uuid PRIMARY KEY,conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,uploader_id text NOT NULL,message_id uuid REFERENCES chat_messages(id),kind text NOT NULL CHECK(kind IN('image','document','audio')),name varchar(200) NOT NULL,mime_type text NOT NULL,file_size integer NOT NULL CHECK(file_size>0),storage_key text NOT NULL UNIQUE,width integer,height integer,duration real,sort_order integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS chat_attachment_message ON chat_attachments(message_id);
      CREATE INDEX IF NOT EXISTS chat_attachment_pending ON chat_attachments(uploader_id,created_at) WHERE message_id IS NULL;
      CREATE TABLE IF NOT EXISTS chat_message_receipts(conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,user_id text NOT NULL,sequence bigint NOT NULL CHECK(sequence>=0),read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(conversation_id,user_id));
      CREATE TABLE IF NOT EXISTS chat_user_preferences(user_id text PRIMARY KEY,region varchar(120) NOT NULL DEFAULT '',interests jsonb NOT NULL DEFAULT '[]',excluded_categories jsonb NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS chat_hidden_recommendations(user_id text NOT NULL,conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,PRIMARY KEY(user_id,conversation_id));
      CREATE TABLE IF NOT EXISTS chat_user_blocks(user_id text NOT NULL,blocked_user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,blocked_user_id),CHECK(user_id<>blocked_user_id));
      CREATE TABLE IF NOT EXISTS chat_reports(id uuid PRIMARY KEY,reporter_id text NOT NULL,target_type text NOT NULL CHECK(target_type IN('message','user','group')),target_id text NOT NULL,reason varchar(80) NOT NULL,description varchar(2000) NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'open',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(reporter_id,target_type,target_id));
      INSERT INTO chat_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
      ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS waveform jsonb;
      INSERT INTO chat_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
      ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS receipt_version bigint NOT NULL DEFAULT 0;
      ALTER TABLE chat_conversation_members ADD COLUMN IF NOT EXISTS last_delivered_sequence bigint NOT NULL DEFAULT 0 CHECK(last_delivered_sequence>=0);
      -- A real historical read also proves the message reached the application.
      -- Do not infer delivery from sends, pushes, membership or GET requests.
      UPDATE chat_conversation_members SET last_delivered_sequence=last_read_sequence WHERE last_delivered_sequence<last_read_sequence;
      CREATE OR REPLACE FUNCTION chat_monotonic_receipt_cursor() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='UPDATE' THEN
          NEW.last_read_sequence=greatest(NEW.last_read_sequence,OLD.last_read_sequence);
          NEW.last_delivered_sequence=greatest(NEW.last_delivered_sequence,OLD.last_delivered_sequence);
        END IF;
        NEW.last_delivered_sequence=greatest(NEW.last_delivered_sequence,NEW.last_read_sequence);
        RETURN NEW;
      END $$;
      CREATE OR REPLACE FUNCTION chat_advance_receipt_version() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' THEN
          DELETE FROM chat_message_receipts WHERE conversation_id=OLD.conversation_id AND user_id=OLD.user_id;
        END IF;
        IF TG_OP='UPDATE' AND NEW.last_read_sequence=OLD.last_read_sequence AND NEW.last_delivered_sequence=OLD.last_delivered_sequence THEN RETURN NULL; END IF;
        UPDATE chat_conversations SET receipt_version=receipt_version+1 WHERE id=coalesce(NEW.conversation_id,OLD.conversation_id);
        RETURN NULL;
      END $$;
      DROP TRIGGER IF EXISTS chat_monotonic_receipt_cursor ON chat_conversation_members;
      CREATE TRIGGER chat_monotonic_receipt_cursor BEFORE INSERT OR UPDATE OF last_read_sequence,last_delivered_sequence ON chat_conversation_members FOR EACH ROW EXECUTE FUNCTION chat_monotonic_receipt_cursor();
      DROP TRIGGER IF EXISTS chat_advance_receipt_version ON chat_conversation_members;
      CREATE TRIGGER chat_advance_receipt_version AFTER INSERT OR DELETE OR UPDATE OF last_read_sequence,last_delivered_sequence ON chat_conversation_members FOR EACH ROW EXECUTE FUNCTION chat_advance_receipt_version();
      INSERT INTO chat_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
    `);
    await c.query('COMMIT');return;
  } catch(e) {await c.query('ROLLBACK');if(e.code!=='55P03'||attempt>=99)throw e;} finally {c.release();}
  await new Promise(resolve=>setTimeout(resolve,50));
  }
}
