import os
import sys
sys.path.insert(0, os.path.abspath("."))
from dotenv import load_dotenv
load_dotenv("backend/.env")

from backend.database import get_db

def apply_customer_auth_migration():
    print("Running customer authentication migration on Neon PostgreSQL...")
    conn = get_db()
    with conn.cursor() as cur:
        # 1. Add password_hash to customers table if not present
        if conn.is_postgres:
            cur.execute("""
                ALTER TABLE customers 
                ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
            """)
            
            # 2. Create customer_sessions table if not present
            cur.execute("""
                CREATE TABLE IF NOT EXISTS customer_sessions (
                    token VARCHAR(100) PRIMARY KEY,
                    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                    created_at VARCHAR(100) NOT NULL,
                    expires_at VARCHAR(100) NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(token);
                CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_id ON customer_sessions(customer_id);
            """)
        else:
            # SQLite fallback
            cur.execute("PRAGMA table_info(customers);")
            cols = [r["name"] for r in cur.fetchall()]
            if "password_hash" not in cols:
                cur.execute("ALTER TABLE customers ADD COLUMN password_hash TEXT;")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS customer_sessions (
                    token TEXT PRIMARY KEY,
                    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
            """)
        conn.commit()
    print("Migration applied successfully!")

if __name__ == "__main__":
    apply_customer_auth_migration()
