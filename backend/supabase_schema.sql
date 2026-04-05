-- MeetNote Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    transcript TEXT,
    summary TEXT,
    duration INTEGER DEFAULT 0,
    language VARCHAR(10) DEFAULT 'en',
    confidence DECIMAL(3,2) DEFAULT 0.0,
    audio_format VARCHAR(20) DEFAULT 'webm',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users table (optional, for future auth)
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_title ON meetings(title);

-- Enable Row Level Security (RLS)
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed)
CREATE POLICY "Allow public read access on meetings" ON meetings
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert on meetings" ON meetings
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on meetings" ON meetings
    FOR UPDATE USING (true);

-- Insert sample data
INSERT INTO meetings (title, transcript, summary, duration, confidence) VALUES
('Sample Meeting 1', 'This is a sample meeting transcript for testing purposes.', 'Sample meeting for testing the MeetNote application', 120, 0.95),
('Sample Meeting 2', 'Another sample transcript to demonstrate the functionality.', 'Second sample meeting with transcript', 180, 0.88)
ON CONFLICT DO NOTHING;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
