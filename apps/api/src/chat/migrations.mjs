// Chat owns only chat_* objects; users and Market remain in their existing stores.
export async function migrateChat(pool) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('egin-chat-migrations'))");
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
    `);
    await c.query('COMMIT');
  } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
}
