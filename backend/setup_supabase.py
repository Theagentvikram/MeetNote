#!/usr/bin/env python3
"""
Setup Supabase database tables for MeetNote
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def setup_database():
    # Initialize Supabase client
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    
    if not supabase_url or not supabase_key:
        print("❌ Missing Supabase credentials!")
        return False
    
    supabase: Client = create_client(supabase_url, supabase_key)
    print("✅ Supabase client initialized")
    
    # Create meetings table using RPC (SQL function)
    try:
        # First, let's try to create the table using a simple insert to test
        test_meeting = {
            "title": "Test Meeting Setup",
            "transcript": "This is a test to create the meetings table",
            "summary": "Database setup test",
            "duration": 10,
            "confidence": 0.95,
            "language": "en",
            "audio_format": "webm"
        }
        
        result = supabase.table("meetings").insert(test_meeting).execute()
        print("✅ Meetings table exists and working!")
        print(f"📝 Test meeting created: {result.data[0]['id']}")
        
        # Clean up test meeting
        supabase.table("meetings").delete().eq("title", "Test Meeting Setup").execute()
        print("🧹 Test meeting cleaned up")
        
        return True
        
    except Exception as e:
        print(f"❌ Database setup failed: {e}")
        print("\n📋 Manual Setup Required:")
        print("1. Go to https://supabase.com/dashboard")
        print("2. Select your project")
        print("3. Go to SQL Editor")
        print("4. Run the following SQL:")
        print("\n" + "="*50)
        
        with open("supabase_schema.sql", "r") as f:
            print(f.read())
        
        print("="*50)
        return False

if __name__ == "__main__":
    print("🚀 Setting up MeetNote Supabase database...")
    success = setup_database()
    
    if success:
        print("\n✅ Database setup complete!")
    else:
        print("\n⚠️ Manual setup required - see instructions above")
