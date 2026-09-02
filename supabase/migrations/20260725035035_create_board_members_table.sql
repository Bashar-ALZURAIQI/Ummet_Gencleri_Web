/*
# Create board_members table for role mapping

1. Purpose
   - Maps board member emails to their role (president / committee-head) and committee.
   - Used by the frontend after Supabase Auth login to determine which view to route to.

2. New Tables
   - `board_members`
     - `id` (serial, primary key)
     - `email` (text, unique, not null)
     - `name` (text, not null)
     - `role` (text, not null — 'president' | 'committee-head')
     - `committee` (text, nullable — committee id for committee-head role)
     - `created_at` (timestamptz, default now())

3. Security
   - Enable RLS on `board_members`.
   - Public read access (TO anon, authenticated) so the login flow can look up the role before session is established.
   - No insert/update/delete from the client — managed via SQL/migration only.
*/

CREATE TABLE IF NOT EXISTS board_members (
  id serial PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  committee text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_board_members" ON board_members;
CREATE POLICY "public_read_board_members" ON board_members FOR SELECT
  TO anon, authenticated USING (true);

-- Seed the board members
INSERT INTO board_members (email, name, role, committee) VALUES
  ('president@ummet.org', 'د. عبد الله قوني', 'president', NULL),
  ('vice.president@ummet.org', 'أ. خليل جوربوز', 'committee-head', 'vice-presidency'),
  ('media@ummet.org', 'مريم شاهين', 'committee-head', 'media'),
  ('academic@ummet.org', 'د. عبد الله قوني', 'committee-head', 'academic'),
  ('supervisory@ummet.org', 'أ. خالد أرسلان', 'committee-head', 'supervisory'),
  ('activities@ummet.org', 'م. سلمى أردوغان', 'committee-head', 'activities'),
  ('finance@ummet.org', 'أ. عمر ديمير', 'committee-head', 'finance')
ON CONFLICT (email) DO NOTHING;
