import os
import sys
import json
from datetime import datetime
from dotenv import load_dotenv

# Ensure backend can be imported
sys.path.insert(0, os.path.abspath("."))
load_dotenv("backend/.env")

from backend.database import get_db

TABLES = [
    "admin_users",
    "admin_sessions",
    "products",
    "inventory",
    "inventory_transactions",
    "customers",
    "enquiries",
    "orders",
    "order_items",
    "order_status_history",
]

def backup_neon():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = f"backend/neon_backup_precleanup_{timestamp}.json"
    data = {}

    print(f"Connecting to database to create backup: {backup_file}...")
    with get_db() as conn:
        with conn.cursor() as cur:
            for table in TABLES:
                cur.execute(f"SELECT * FROM {table} ORDER BY 1 ASC;")
                rows = cur.fetchall()
                # Convert rows (dicts) to json-serializable format
                serializable_rows = []
                for row in rows:
                    row_dict = dict(row)
                    for k, v in row_dict.items():
                        if isinstance(v, (datetime,)):
                            row_dict[k] = v.isoformat()
                    serializable_rows.append(row_dict)
                data[table] = serializable_rows
                print(f"Backed up {len(serializable_rows)} records from {table}")

    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"\nSuccessfully created pre-cleanup backup at: {backup_file}")
    return backup_file

if __name__ == "__main__":
    backup_neon()
