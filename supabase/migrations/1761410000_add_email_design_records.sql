-- Migration: add_email_design_records
-- Created at: 1761410000

-- 邮件设计记录表（支持A组钓鱼设计和C组监管记录）
CREATE TABLE email_design_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('phishing_design', 'supervision')),
  
  -- A组钓鱼设计字段
  phishing_type VARCHAR(50), -- 福利补贴类、外贸订单类、木马病毒类、账号异常类
  design_thoughts TEXT,
  target_audience TEXT,
  expected_result TEXT,
  actual_reflection TEXT,
  
  -- C组监管记录字段
  identification_basis TEXT, -- 识别依据
  decision_process TEXT, -- 决策过程
  warning_content TEXT, -- 警告内容
  effect_evaluation TEXT, -- 效果评估
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_design_records_user ON email_design_records(user_id);
CREATE INDEX idx_design_records_email ON email_design_records(email_id);
CREATE INDEX idx_design_records_type ON email_design_records(record_type);

-- RLS策略
ALTER TABLE email_design_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON email_design_records
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert via edge function" ON email_design_records
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow update via edge function" ON email_design_records
  FOR UPDATE
  USING (auth.role() IN ('anon', 'service_role'));
