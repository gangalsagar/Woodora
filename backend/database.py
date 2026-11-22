import os
import json
import sqlite3
import bcrypt
import secrets
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Database abstraction layer
class DatabaseConnection:
    """Wrapper that normalizes parameter placeholders and row access across SQLite and PostgreSQL."""
    def __init__(self, raw_conn, is_postgres=False):
        self.raw_conn = raw_conn
        self.is_postgres = is_postgres

    def cursor(self):
        return DatabaseCursor(self.raw_conn.cursor(), self.is_postgres)

    def execute(self, query: str, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self.raw_conn.commit()

    def executescript(self, script: str):
        if self.is_postgres:
            cur = self.cursor()
            cur.execute(script)
        else:
            self.raw_conn.executescript(script)
        return self
        self.raw_conn.commit()

    def rollback(self):
        self.raw_conn.rollback()

    def close(self):
        self.raw_conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        self.close()

class DatabaseCursor:
    def __init__(self, raw_cursor, is_postgres=False):
        self.raw_cursor = raw_cursor
        self.is_postgres = is_postgres
        self._last_inserted_id = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.raw_cursor.close()

    def execute(self, query: str, params=None):
        if self.is_postgres:
            clean_q = query.strip()
            is_insert = clean_q.upper().startswith("INSERT INTO")
            has_returning = "RETURNING" in clean_q.upper()
            
            # Check which table is being inserted into
            # Tables without an 'id' column: 'inventory' (primary key is product_id), 'admin_sessions' (token), 'customer_sessions' (token)
            parts = clean_q.split()
            target_table = parts[2].lower().strip("()") if len(parts) > 2 else ""
            table_has_id = target_table not in ["inventory", "admin_sessions", "customer_sessions"]

            if is_insert and not has_returning and table_has_id:
                formatted_query = query.replace("?", "%s") + " RETURNING id"
            else:
                formatted_query = query.replace("?", "%s")

            if params is None:
                self.raw_cursor.execute(formatted_query)
            else:
                self.raw_cursor.execute(formatted_query, tuple(params))

            if is_insert and not has_returning and table_has_id:
                try:
                    res = self.raw_cursor.fetchone()
                    if res and "id" in res:
                        self._last_inserted_id = res["id"]
                except Exception:
                    self._last_inserted_id = None
            else:
                self._last_inserted_id = None
        else:
            if params is None:
                self.raw_cursor.execute(query)
            else:
                self.raw_cursor.execute(query, tuple(params))
        return self

    def fetchone(self):
        row = self.raw_cursor.fetchone()
        if row is None:
            return None
        if self.is_postgres:
            return dict(row)
        return dict(row)

    def fetchall(self):
        rows = self.raw_cursor.fetchall()
        if not rows:
            return []
        if self.is_postgres:
            return [dict(r) for r in rows]
        return [dict(r) for r in rows]

    @property
    def lastrowid(self):
        if self.is_postgres:
            return self._last_inserted_id
        return self.raw_cursor.lastrowid

DB_PATH = os.path.join(os.path.dirname(__file__), "woodora.db")

_pg_pool = None

def get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        import psycopg2.pool
        db_url = os.getenv("DATABASE_URL", "").strip()
        # neon pooling with sslmode
        _pg_pool = psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=10, dsn=db_url)
    return _pg_pool

def get_db() -> DatabaseConnection:
    """Returns an active database connection. Automatically detects PostgreSQL or SQLite."""
    db_url = os.getenv("DATABASE_URL", "").strip()
    if db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
        import psycopg2
        from psycopg2.extras import RealDictCursor
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor, connect_timeout=10)
        return DatabaseConnection(conn, is_postgres=True)

    # In production, disallow fallback to SQLite
    env_mode = os.getenv("ENVIRONMENT", "development").lower()
    if env_mode == "production":
        raise RuntimeError("Production mode requires a valid PostgreSQL DATABASE_URL. SQLite fallback is disabled.")

    # Local SQLite
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return DatabaseConnection(conn, is_postgres=False)

def hash_password(password: str) -> str:
    """Hashes password with bcrypt (12 rounds)."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(password: str, stored: str) -> bool:
    """Verifies password using bcrypt with fallback for legacy hashes."""
    try:
        if stored.startswith("$2a$") or stored.startswith("$2b$") or stored.startswith("$2y$"):
            return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
        if ":" in stored:
            import hashlib, hmac
            salt, hashed = stored.split(":")
            check = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
            return hmac.compare_digest(hashed, check)
    except Exception:
        return False
    return False

def init_db():
    """Initializes tables and seeds initial data if missing."""
    conn = get_db()
    cur = conn.cursor()

    if conn.is_postgres:
        # PostgreSQL Schema Creation
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'admin',
            created_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token VARCHAR(100) PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            created_at VARCHAR(100) NOT NULL,
            expires_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            sku VARCHAR(100) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(100) NOT NULL,
            wood_type VARCHAR(100) NOT NULL,
            dimensions VARCHAR(100),
            price DOUBLE PRECISION NOT NULL,
            price_display VARCHAR(50),
            images TEXT NOT NULL,
            product_type VARCHAR(50) NOT NULL DEFAULT 'Ready-made',
            availability_status VARCHAR(50) NOT NULL DEFAULT 'In Stock',
            is_featured INTEGER NOT NULL DEFAULT 0,
            tag VARCHAR(100),
            created_at VARCHAR(100) NOT NULL,
            updated_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inventory (
            product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
            stock_quantity INTEGER NOT NULL DEFAULT 0,
            low_stock_threshold INTEGER NOT NULL DEFAULT 5,
            updated_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inventory_transactions (
            id SERIAL PRIMARY KEY,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            change_amount INTEGER NOT NULL,
            previous_quantity INTEGER NOT NULL,
            new_quantity INTEGER NOT NULL,
            reason VARCHAR(255) NOT NULL,
            reference_id VARCHAR(100),
            created_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(100),
            password_hash VARCHAR(255),
            city VARCHAR(100),
            address TEXT,
            notes TEXT,
            created_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customer_sessions (
            token VARCHAR(100) PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            created_at VARCHAR(100) NOT NULL,
            expires_at VARCHAR(100) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(token);
        CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_id ON customer_sessions(customer_id);
        CREATE TABLE IF NOT EXISTS enquiries (
            id SERIAL PRIMARY KEY,
            enquiry_code VARCHAR(100) UNIQUE NOT NULL,
            customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
            customer_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(100),
            furniture_category VARCHAR(100) NOT NULL,
            requirements TEXT NOT NULL,
            dimensions VARCHAR(100),
            preferred_wood VARCHAR(100),
            budget VARCHAR(100),
            status VARCHAR(50) NOT NULL DEFAULT 'New',
            internal_notes TEXT,
            created_at VARCHAR(100) NOT NULL,
            updated_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            order_code VARCHAR(100) UNIQUE NOT NULL,
            order_type VARCHAR(50) NOT NULL,
            customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
            customer_name VARCHAR(255) NOT NULL,
            customer_email VARCHAR(255) NOT NULL,
            customer_phone VARCHAR(100),
            delivery_address TEXT,
            total_amount DOUBLE PRECISION NOT NULL,
            payment_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
            order_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
            custom_specifications TEXT,
            production_stage VARCHAR(100),
            enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
            created_at VARCHAR(100) NOT NULL,
            updated_at VARCHAR(100) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS order_items (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            product_name VARCHAR(255) NOT NULL,
            wood_type VARCHAR(100),
            unit_price DOUBLE PRECISION NOT NULL,
            quantity INTEGER NOT NULL,
            total_price DOUBLE PRECISION NOT NULL
        );
        CREATE TABLE IF NOT EXISTS order_status_history (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            status VARCHAR(50) NOT NULL,
            note TEXT,
            created_at VARCHAR(100) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
        CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
        CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
        """)
        conn.commit()
    else:
        # SQLite Schema Creation
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            wood_type TEXT NOT NULL,
            dimensions TEXT,
            price REAL NOT NULL,
            price_display TEXT,
            images TEXT NOT NULL,
            product_type TEXT NOT NULL DEFAULT 'Ready-made',
            availability_status TEXT NOT NULL DEFAULT 'In Stock',
            is_featured INTEGER NOT NULL DEFAULT 0,
            tag TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inventory (
            product_id INTEGER PRIMARY KEY,
            stock_quantity INTEGER NOT NULL DEFAULT 0,
            low_stock_threshold INTEGER NOT NULL DEFAULT 5,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS inventory_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            change_amount INTEGER NOT NULL,
            previous_quantity INTEGER NOT NULL,
            new_quantity INTEGER NOT NULL,
            reason TEXT NOT NULL,
            reference_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password_hash TEXT,
            city TEXT,
            address TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customer_sessions (
            token TEXT PRIMARY KEY,
            customer_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS enquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enquiry_code TEXT UNIQUE NOT NULL,
            customer_id INTEGER,
            customer_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            furniture_category TEXT NOT NULL,
            requirements TEXT NOT NULL,
            dimensions TEXT,
            preferred_wood TEXT,
            budget TEXT,
            status TEXT NOT NULL DEFAULT 'New',
            internal_notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_code TEXT UNIQUE NOT NULL,
            order_type TEXT NOT NULL,
            customer_id INTEGER,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_phone TEXT,
            delivery_address TEXT,
            total_amount REAL NOT NULL,
            payment_status TEXT NOT NULL DEFAULT 'Pending',
            order_status TEXT NOT NULL DEFAULT 'Pending',
            custom_specifications TEXT,
            production_stage TEXT,
            enquiry_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
            FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            wood_type TEXT,
            unit_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            total_price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS order_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
        CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
        CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
        """)
        conn.commit()

    # Seed Default Admin if none exists
    admin_email = os.getenv("ADMIN_EMAIL", "admin@woodora.com").lower().strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "WoodoraAdmin2026!")
    admin_name = os.getenv("ADMIN_NAME", "Woodora Administrator")

    cur.execute("SELECT id FROM admin_users WHERE email = ?", (admin_email,))
    if not cur.fetchone():
        hashed = hash_password(admin_password)
        now_str = datetime.now(timezone.utc).isoformat()
        cur.execute(
            "INSERT INTO admin_users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (admin_name, admin_email, hashed, "superadmin", now_str)
        )
        conn.commit()
        print(f"[DB] Initialized default admin: {admin_email}")

    # Seed initial products if catalog is empty
    cur.execute("SELECT COUNT(*) as count FROM products")
    count_row = cur.fetchone()
    count_val = count_row["count"] if count_row else 0
    if count_val == 0:
        seed_initial_catalog(conn)

    conn.close()

def seed_initial_catalog(conn):
    now = datetime.now(timezone.utc).isoformat()
    initial_products = [
        {
            "sku": "WOD-OAK-001",
            "name": "The Alder Dining Table",
            "description": "Crafted from hand-selected solid French white oak with traditional mortise-and-tenon joinery and organic oil finish.",
            "category": "Dining",
            "wood_type": "Solid oak",
            "dimensions": "220cm L x 95cm W x 76cm H",
            "price": 68000.0,
            "price_display": "₹68,000",
            "images": json.dumps(["https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85"]),
            "product_type": "Ready-made",
            "availability_status": "In Stock",
            "is_featured": 1,
            "tag": "Bestseller",
            "stock": 8,
            "threshold": 3
        },
        {
            "sku": "WOD-TK-002",
            "name": "Marlow Lounge Chair",
            "description": "Mid-century architectural silhouette in Grade-A reclaimed teak with hand-woven natural rattan cane backrest.",
            "category": "Seating",
            "wood_type": "Teak & cane",
            "dimensions": "78cm W x 82cm D x 74cm H",
            "price": 32500.0,
            "price_display": "₹32,500",
            "images": json.dumps(["https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1000&q=85"]),
            "product_type": "Made-to-order",
            "availability_status": "Made to Order",
            "is_featured": 1,
            "tag": "Made to order",
            "stock": 0,
            "threshold": 0
        },
        {
            "sku": "WOD-WN-003",
            "name": "Forma Platform Bed",
            "description": "Low-slung minimalist platform bed in American black walnut with subtle bevelled headboard details.",
            "category": "Bedroom",
            "wood_type": "American walnut",
            "dimensions": "King: 200cm x 210cm",
            "price": 94000.0,
            "price_display": "₹94,000",
            "images": json.dumps(["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=85"]),
            "product_type": "Ready-made",
            "availability_status": "Low Stock",
            "is_featured": 1,
            "tag": "Signature",
            "stock": 2,
            "threshold": 4
        },
        {
            "sku": "WOD-OAK-004",
            "name": "Sora Sideboard",
            "description": "Clean-lined six-drawer credenza in quarter-sawn white oak with brass finger pulls.",
            "category": "Storage",
            "wood_type": "White oak",
            "dimensions": "180cm W x 45cm D x 78cm H",
            "price": 57000.0,
            "price_display": "₹57,000",
            "images": json.dumps(["https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1000&q=85"]),
            "product_type": "Ready-made",
            "availability_status": "In Stock",
            "is_featured": 0,
            "tag": "New",
            "stock": 6,
            "threshold": 3
        },
        {
            "sku": "WOD-ASH-005",
            "name": "Arc Dining Chair",
            "description": "Sculptural dining chair steam-bent from northern ash, featuring ergonomic curvature.",
            "category": "Seating",
            "wood_type": "Solid ash",
            "dimensions": "52cm W x 54cm D x 80cm H",
            "price": 18500.0,
            "price_display": "₹18,500",
            "images": json.dumps(["https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?auto=format&fit=crop&w=1000&q=85"]),
            "product_type": "Made-to-order",
            "availability_status": "Made to Order",
            "is_featured": 0,
            "tag": "Made to order",
            "stock": 0,
            "threshold": 0
        },
        {
            "sku": "WOD-SMK-006",
            "name": "Noma Coffee Table",
            "description": "Circular monolithic low table in fumed smoked oak, highlighting bold radial woodgrain.",
            "category": "Living",
            "wood_type": "Smoked oak",
            "dimensions": "90cm Dia x 38cm H",
            "price": 26000.0,
            "price_display": "₹26,000",
            "images": json.dumps(["https://images.unsplash.com/photo-1499933374294-4584851497cc?auto=format&fit=crop&w=1000&q=85"]),
            "product_type": "Ready-made",
            "availability_status": "In Stock",
            "is_featured": 1,
            "tag": "Bestseller",
            "stock": 11,
            "threshold": 4
        }
    ]

    cur = conn.cursor()
    for p in initial_products:
        if conn.is_postgres:
            cur.execute("""
                INSERT INTO products (
                    sku, name, description, category, wood_type, dimensions, price,
                    price_display, images, product_type, availability_status, is_featured, tag, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """, (
                p["sku"], p["name"], p["description"], p["category"], p["wood_type"],
                p["dimensions"], p["price"], p["price_display"], p["images"],
                p["product_type"], p["availability_status"], p["is_featured"], p["tag"], now, now
            ))
            p_id = cur.fetchone()["id"]
        else:
            cur.execute("""
                INSERT INTO products (
                    sku, name, description, category, wood_type, dimensions, price,
                    price_display, images, product_type, availability_status, is_featured, tag, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                p["sku"], p["name"], p["description"], p["category"], p["wood_type"],
                p["dimensions"], p["price"], p["price_display"], p["images"],
                p["product_type"], p["availability_status"], p["is_featured"], p["tag"], now, now
            ))
            p_id = cur.lastrowid

        cur.execute("""
            INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold, updated_at)
            VALUES (?, ?, ?, ?)
        """, (p_id, p["stock"], p["threshold"], now))

        if p["stock"] > 0:
            cur.execute("""
                INSERT INTO inventory_transactions (
                    product_id, change_amount, previous_quantity, new_quantity, reason, reference_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (p_id, p["stock"], 0, p["stock"], "Initial Stocking", "SEED-INITIAL", now))

    conn.commit()
    print("[DB] Initialized catalog and stock.")

if __name__ == "__main__":
    init_db()
