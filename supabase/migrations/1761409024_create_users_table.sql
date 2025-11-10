-- Migration: create_users_table
-- Created at: 1761409024


-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('A', 'B', 'C', 'admin')),
  virtual_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_users_role ON users(role);

-- RLS策略
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON users
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert via edge function" ON users
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow update via edge function" ON users
  FOR UPDATE
  USING (auth.role() IN ('anon', 'service_role'));
;