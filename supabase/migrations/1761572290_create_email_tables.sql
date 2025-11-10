-- Migration: create_email_tables
-- Created at: 1761572290

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_malicious BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER,
    recipient_id INTEGER,
    subject VARCHAR(255),
    content TEXT,
    email_type VARCHAR(20) DEFAULT 'normal',
    is_clicked BOOLEAN DEFAULT false,
    is_read BOOLEAN DEFAULT false,
    is_suspicious BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    clicked_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE
);

-- Create statistics table
CREATE TABLE IF NOT EXISTS statistics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE,
    emails_sent INTEGER DEFAULT 0,
    emails_clicked INTEGER DEFAULT 0,
    emails_received INTEGER DEFAULT 0,
    emails_read INTEGER DEFAULT 0,
    suspicious_marked INTEGER DEFAULT 0,
    score FLOAT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_status table
CREATE TABLE IF NOT EXISTS game_status (
    id SERIAL PRIMARY KEY,
    game_active BOOLEAN DEFAULT false,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);;