-- Migration: create_templates_table
-- Created at: 1761409026


-- 模板表
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  is_malicious BOOLEAN DEFAULT false,
  format_type VARCHAR(20) DEFAULT 'html',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_is_malicious ON templates(is_malicious);

-- RLS策略
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON templates
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert via edge function" ON templates
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'service_role'));
;