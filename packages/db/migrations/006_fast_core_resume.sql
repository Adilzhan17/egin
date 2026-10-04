ALTER TABLE assistant_jobs ADD COLUMN tools jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Forwarded messages reference the same immutable bytes through a new ACL-bound row.
ALTER TABLE chat_attachments DROP CONSTRAINT chat_attachments_storage_name_key;
CREATE INDEX chat_attachments_storage ON chat_attachments(storage_name);
CREATE INDEX realtime_events_entity ON realtime_events(type,entity_id,id DESC);
