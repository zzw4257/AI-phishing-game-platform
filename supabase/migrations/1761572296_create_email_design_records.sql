-- Migration: create_email_design_records
-- Created at: 1761572296

-- Create email_design_records table for A and C group design process tracking
CREATE TABLE IF NOT EXISTS email_design_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    email_id INTEGER,
    question_answer JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);;