-- Migration: create_emails_table
-- Created at: 1761409028


-- 邮件表
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  subject VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  is_malicious BOOLEAN DEFAULT false,
  is_clicked BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  is_suspicious_marked BOOLEAN DEFAULT false,
  marked_by_id UUID,
  template_id UUID,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  clicked_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  read_duration INTEGER DEFAULT 0
);

-- 创建索引
CREATE INDEX idx_emails_sender ON emails(sender_id);
CREATE INDEX idx_emails_recipient ON emails(recipient_id);
CREATE INDEX idx_emails_sent_at ON emails(sent_at);
CREATE INDEX idx_emails_is_malicious ON emails(is_malicious);

-- RLS策略
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON emails
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert via edge function" ON emails
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow update via edge function" ON emails
  FOR UPDATE
  USING (auth.role() IN ('anon', 'service_role'));
;