-- Preserve existing phone-only Egin accounts without inventing email addresses.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN phone text UNIQUE;
ALTER TABLE profiles ADD COLUMN legacy_role text;
ALTER TABLE profiles ADD COLUMN district text;
ALTER TABLE users ADD CONSTRAINT user_login_present CHECK(email IS NOT NULL OR phone IS NOT NULL);
