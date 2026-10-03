CREATE TABLE field_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 field_id uuid REFERENCES fields ON DELETE CASCADE, title text NOT NULL CHECK(length(title) BETWEEN 2 AND 240),
 due_date date NOT NULL DEFAULT current_date, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX field_tasks_owner ON field_tasks(user_id,due_date);
CREATE TABLE field_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users, body text NOT NULL CHECK(length(body) BETWEEN 2 AND 6000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX field_notes_field ON field_notes(field_id,created_at DESC);
ALTER TABLE assistant_history ADD COLUMN provider text;
ALTER TABLE assistant_history ADD COLUMN model text;
ALTER TABLE assistant_history ADD COLUMN status text NOT NULL DEFAULT 'completed';
ALTER TABLE listings ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
