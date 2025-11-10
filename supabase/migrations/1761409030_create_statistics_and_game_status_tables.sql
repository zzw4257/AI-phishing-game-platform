-- Migration: create_statistics_and_game_status_tables
-- Created at: 1761409030


-- 统计表
CREATE TABLE statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  emails_sent INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  emails_received INTEGER DEFAULT 0,
  emails_read INTEGER DEFAULT 0,
  suspicious_marked INTEGER DEFAULT 0,
  score DECIMAL(10, 2) DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 游戏状态表
CREATE TABLE game_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'finished')),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  winner_group VARCHAR(10),
  a_group_score DECIMAL(10, 2) DEFAULT 0,
  b_group_score DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_statistics_user_id ON statistics(user_id);

-- RLS策略
ALTER TABLE statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON statistics
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert via edge function" ON statistics
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow update via edge function" ON statistics
  FOR UPDATE
  USING (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow public read access" ON game_status
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert via edge function" ON game_status
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow update via edge function" ON game_status
  FOR UPDATE
  USING (auth.role() IN ('anon', 'service_role'));
;