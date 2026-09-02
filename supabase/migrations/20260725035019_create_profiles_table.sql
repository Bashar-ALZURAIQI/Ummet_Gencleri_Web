/*
# Create profiles table for student account data

1. Purpose
   - Stores student profile data (name, university, major, year, phone) linked to Supabase Auth users.
   - Replaces the in-memory mock student records with persisted data for real authentication.

2. New Tables
   - `profiles`
     - `id` (uuid, primary key, references auth.users)
     - `email` (text, not null)
     - `name` (text, not null)
     - `university` (text, default 'غير محدد')
     - `major` (text, default 'غير محدد')
     - `year` (text, default 'السنة الأولى')
     - `phone` (text, nullable)
     - `status` (text, default 'inactive' — 'active' | 'inactive')
     - `joined_at` (date, default current date)
     - `created_at` (timestamptz, default now())

3. Security
   - Enable RLS on `profiles`.
   - Owner-scoped CRUD: each authenticated user can only read/update their own profile row.
   - INSERT allowed for authenticated users on their own row (created at signup).
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  university text DEFAULT 'غير محدد',
  major text DEFAULT 'غير محدد',
  year text DEFAULT 'السنة الأولى',
  phone text,
  status text NOT NULL DEFAULT 'inactive',
  joined_at date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);
