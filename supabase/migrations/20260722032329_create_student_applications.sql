/*
# Create student_applications table (single-tenant, no auth)

1. Purpose
   - Stores student applications for joining the union, including interview scheduling and acceptance/rejection decisions.
   - This is a single-tenant demo app with mock-based login (no Supabase auth), so policies allow anon+authenticated CRUD.

2. New Tables
   - `student_applications`
     - `id` (text, primary key — set by frontend)
     - `student_id` (text, not null)
     - `name` (text, not null)
     - `email` (text, not null)
     - `university` (text)
     - `major` (text)
     - `year` (text)
     - `motivation` (text)
     - `applied_at` (date, not null)
     - `status` (text, not null, default 'pending' — one of: pending, interview, accepted, rejected)
     - `interview_date` (date, nullable)
     - `interview_time` (text, nullable)
     - `interview_meeting_url` (text, nullable)
     - `decided_at` (date, nullable)
     - `rejection_reason` (text, nullable)
     - `created_at` (timestamptz, default now())

3. Security
   - Enable RLS on `student_applications`.
   - Allow anon + authenticated full CRUD because the app has no real sign-in (mock login only).
*/

CREATE TABLE IF NOT EXISTS student_applications (
  id text PRIMARY KEY,
  student_id text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  university text DEFAULT 'غير محدد',
  major text DEFAULT 'غير محدد',
  year text DEFAULT 'السنة الأولى',
  motivation text DEFAULT '',
  applied_at date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending',
  interview_date date,
  interview_time text,
  interview_meeting_url text,
  decided_at date,
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE student_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_applications" ON student_applications;
CREATE POLICY "anon_select_applications" ON student_applications FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_applications" ON student_applications;
CREATE POLICY "anon_insert_applications" ON student_applications FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_applications" ON student_applications;
CREATE POLICY "anon_update_applications" ON student_applications FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_applications" ON student_applications;
CREATE POLICY "anon_delete_applications" ON student_applications FOR DELETE
  TO anon, authenticated USING (true);
