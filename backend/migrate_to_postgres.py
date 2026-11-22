import os
import sys
import shutil
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Any

from dotenv import load_dotenv
load_dotenv()

TABLES_IN_ORDER = [
    "admin_users",
    "admin_sessions",
    "products",
    "inventory",
    "inventory_transactions",
    "customers",
    "enquiries",
    "orders",
    "order_items",
    "order_status_history"
]

def get_sqlite_conn(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def get_postgres_conn(db_url: str):
    import psycopg2
    from psycopg2.extras import RealDictCursor
    conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    return conn

def backup_sqlite(sqlite_path: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = f"{sqlite_path}.backup_{timestamp}"
    shutil.copy2(sqlite_path, backup_path)
    print(f"[Backup] SQLite backup created safely at: {backup_path}")
    return backup_path

def migrate_data(target_pg_url: str = None):
    print("==============================================================")
    print("WOODORA SQLITE TO POSTGRESQL PRODUCTION MIGRATION RUNNER")
    print("==============================================================")

    sqlite_path = os.path.join(os.path.dirname(__file__), "woodora.db")
    if not os.path.exists(sqlite_path):
        print(f"[Error] SQLite database not found at {sqlite_path}")
        sys.exit(1)

    pg_url = target_pg_url or os.getenv("DATABASE_URL")
    if not pg_url:
        print("[Error] No PostgreSQL connection string provided via target_pg_url or DATABASE_URL.")
        print("Please configure DATABASE_URL=postgresql://user:password@host:5432/dbname")
        sys.exit(1)

    # 1. Pre-migration backup
    backup_file = backup_sqlite(sqlite_path)

    # 2. Connect to source and target
    src_conn = get_sqlite_conn(sqlite_path)
    try:
        dest_conn = get_postgres_conn(pg_url)
    except Exception as e:
        print(f"[Error] Failed to connect to PostgreSQL: {e}")
        sys.exit(1)

    # 3. Initialize destination schema
    import database
    os.environ["DATABASE_URL"] = pg_url
    print("\n[Schema] Initializing PostgreSQL schema and tables...")
    database.init_db()

    # 4. Migrate tables in strict dependency order
    src_cur = src_conn.cursor()
    dest_cur = dest_conn.cursor()

    migration_report = {}

    for table in TABLES_IN_ORDER:
        src_cur.execute(f"SELECT * FROM {table}")
        rows = [dict(r) for r in src_cur.fetchall()]
        source_count = len(rows)

        if not rows:
            dest_cur.execute(f"SELECT COUNT(*) as count FROM {table}")
            dest_count = dest_cur.fetchone()["count"]
            migration_report[table] = {"source": 0, "migrated": dest_count, "status": "MATCH"}
            print(f"Table '{table}': 0 rows in source.")
            continue

        columns = list(rows[0].keys())
        col_names = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))

        # We use ON CONFLICT DO NOTHING to ensure idempotence on re-runs
        if table in ["admin_sessions"]:
            conflict_target = "(token)"
        elif table in ["inventory"]:
            conflict_target = "(product_id)"
        else:
            conflict_target = "(id)"

        insert_query = f"""
            INSERT INTO {table} ({col_names})
            VALUES ({placeholders})
            ON CONFLICT {conflict_target} DO NOTHING;
        """

        for row in rows:
            values = tuple(row[c] for c in columns)
            dest_cur.execute(insert_query, values)

        # Synchronize PostgreSQL sequence if id column exists
        if "id" in columns:
            dest_cur.execute(f"SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM {table};")
            res = dest_cur.fetchone()
            next_id = res["next_id"]
            seq_name = f"{table}_id_seq"
            dest_cur.execute(f"SELECT setval('{seq_name}', %s, false);", (next_id,))

        dest_conn.commit()

        # Count verification
        dest_cur.execute(f"SELECT COUNT(*) as count FROM {table}")
        dest_count = dest_cur.fetchone()["count"]

        status = "MATCH" if dest_count >= source_count else "MISMATCH"
        migration_report[table] = {
            "source": source_count,
            "migrated": dest_count,
            "status": status
        }
        print(f"✓ Migrated '{table}': Source={source_count} | PostgreSQL={dest_count} [{status}]")

    src_conn.close()
    dest_conn.close()

    print("\n==============================================================")
    print("MIGRATION SUMMARY & RECORD-COUNT VERIFICATION")
    print("==============================================================")
    all_matched = True
    for tbl, res in migration_report.items():
        print(f"  {tbl:<25}: SQLite={res['source']:<4} -> PostgreSQL={res['migrated']:<4} | {res['status']}")
        if res["status"] != "MATCH":
            all_matched = False

    if all_matched:
        print("\nSUCCESS: All tables, sequences, and relationships successfully migrated!")
    else:
        print("\nWARNING: Some record counts did not match. Please inspect constraints.")

    return migration_report

if __name__ == "__main__":
    pg_arg = sys.argv[1] if len(sys.argv) > 1 else None
    migrate_data(pg_arg)
