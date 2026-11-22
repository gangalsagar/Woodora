# Woodora Database & PostgreSQL Migration Guide

## 1. Current Architecture: SQLite (Development & Local Deployments)
- Database file: `backend/woodora.db`
- Connection configuration: Foreign key constraints enabled (`PRAGMA foreign_keys = ON;`).
- Concurrency: Single writer, concurrent readers.
- All transactional order and inventory state changes are wrapped in atomic `BEGIN...COMMIT/ROLLBACK` blocks.

## 2. PostgreSQL Schema & Production Migration Path

When deploying Woodora to production environments (AWS RDS, Google Cloud SQL, Supabase, Neon, or Railway PostgreSQL), use the standard SQL definition below:

```sql
-- 1. Admin Users
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Admin Sessions
CREATE TABLE admin_sessions (
    token VARCHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(token);

-- 3. Products
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    wood_type VARCHAR(100) NOT NULL,
    dimensions VARCHAR(100),
    price NUMERIC(12, 2) NOT NULL,
    price_display VARCHAR(50),
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    product_type VARCHAR(50) NOT NULL DEFAULT 'Ready-made',
    availability_status VARCHAR(50) NOT NULL DEFAULT 'In Stock',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    tag VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_sku ON products(sku);

-- 4. Inventory
CREATE TABLE inventory (
    product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Inventory Transactions
CREATE TABLE inventory_transactions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    change_amount INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Customers
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    city VARCHAR(100),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customers_email ON customers(email);

-- 7. Enquiries
CREATE TABLE enquiries (
    id SERIAL PRIMARY KEY,
    enquiry_code VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    furniture_category VARCHAR(100) NOT NULL,
    requirements TEXT NOT NULL,
    dimensions VARCHAR(100),
    preferred_wood VARCHAR(100),
    budget VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'New',
    internal_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_enquiries_status ON enquiries(status);

-- 8. Orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_code VARCHAR(50) UNIQUE NOT NULL,
    order_type VARCHAR(50) NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    delivery_address TEXT,
    total_amount NUMERIC(12, 2) NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    order_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    custom_specifications TEXT,
    production_stage VARCHAR(100),
    enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_status ON orders(order_status);

-- 9. Order Items
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    wood_type VARCHAR(100),
    unit_price NUMERIC(12, 2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price NUMERIC(12, 2) NOT NULL
);

-- 10. Order Status History
CREATE TABLE order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3. Migration Steps
1. Add `psycopg2-binary` or `asyncpg` to `requirements.txt`.
2. Configure `DATABASE_URL=postgresql://user:password@host:5432/woodoradb` in `.env`.
3. In `database.py`, switch connection provider:
   ```python
   import psycopg2
   from psycopg2.extras import RealDictCursor
   def get_db():
       return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=RealDictCursor)
   ```
4. Transfer existing data using `pgloader` or a one-line Python migration script from SQLite to PostgreSQL.
