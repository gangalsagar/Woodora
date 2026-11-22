import os
import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai

from database import (
    get_db,
    init_db,
    hash_password,
    verify_password,
)

load_dotenv()

# Verify that in production, DATABASE_URL must be configured and not falling back to SQLite
ENV_MODE = os.getenv("ENVIRONMENT", "development").lower()
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if ENV_MODE == "production" and not (DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")):
    raise RuntimeError("CRITICAL: Production deployment requires a valid PostgreSQL DATABASE_URL. Local SQLite fallback is disabled in production.")

# Initialize DB tables and seed data if needed
init_db()

app = FastAPI(title="Woodora API & Business Platform", version="2.0.0")

# Production CORS origins
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173"
]
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip()
if FRONTEND_URL:
    ALLOWED_ORIGINS.extend([origin.strip() for origin in FRONTEND_URL.split(",") if origin.strip()])
if ENV_MODE != "production":
    ALLOWED_ORIGINS.append("*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if "*" not in ALLOWED_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    """Health check endpoint for Render service uptime monitoring."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        cur.fetchone()
        db_status = "connected"
        engine = "postgresql" if conn.is_postgres else "sqlite"
    except Exception as e:
        db_status = f"unhealthy: {e}"
        engine = "unknown"
    finally:
        conn.close()

    return {
        "status": "ok",
        "service": "Woodora API",
        "environment": ENV_MODE,
        "database": db_status,
        "engine": engine,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

# ==========================================
# AUTH DEPENDENCY & SCHEMAS
# ==========================================

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user: Dict[str, Any]

def get_current_admin(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization format")
    token = parts[1]

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role
        FROM admin_sessions s
        JOIN admin_users u ON s.user_id = u.id
        WHERE s.token = ?
    """, (token,))
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has expired. Please log in again.")

    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "token": token
    }

# ==========================================
# ADMIN AUTH ENDPOINTS
# ==========================================

@app.post("/api/admin/auth/login", response_model=LoginResponse)
async def admin_login(req: LoginRequest):
    email_clean = req.email.strip().lower()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, password_hash, role FROM admin_users WHERE email = ?", (email_clean,))
    user = cur.fetchone()

    if not user or not verify_password(req.password, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=7)

    cur.execute("""
        INSERT INTO admin_sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, user["id"], now.isoformat(), expires.isoformat()))
    conn.commit()
    conn.close()

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"]
        }
    }

@app.post("/api/admin/auth/logout")
async def admin_logout(admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    conn.execute("DELETE FROM admin_sessions WHERE token = ?", (admin["token"],))
    conn.commit()
    conn.close()
    return {"message": "Logged out successfully"}

@app.get("/api/admin/auth/me")
async def admin_me(admin: Dict[str, Any] = Depends(get_current_admin)):
    return {"user": admin}

# ==========================================
# CUSTOMER AUTHENTICATION & SESSIONS
# ==========================================

class CustomerRegisterRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    password: str
    confirm_password: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None

class CustomerLoginRequest(BaseModel):
    email: str
    password: str

class CustomerUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None

def get_current_customer(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header format")
    token = parts[1]

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT s.token, s.expires_at, c.id, c.name, c.email, c.phone, c.city, c.address
        FROM customer_sessions s
        JOIN customers c ON s.customer_id = c.id
        WHERE s.token = ?
    """, (token,))
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired customer session")

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please log in again.")

    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "city": row["city"],
        "address": row["address"],
        "token": token
    }

@app.post("/api/customer/auth/register")
async def customer_register(req: CustomerRegisterRequest):
    name = req.name.strip()
    email = req.email.strip().lower()
    phone = req.phone.strip() if req.phone else None
    password = req.password

    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters long")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
    if req.confirm_password and req.confirm_password != password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash FROM customers WHERE email = ?", (email,))
    existing = cur.fetchone()

    hashed = hash_password(password)
    now = utc_now()

    if existing:
        if existing.get("password_hash"):
            conn.close()
            raise HTTPException(status_code=400, detail="An account with this email already exists. Please log in.")
        # Customer previously submitted an enquiry or order without password; upgrade account
        cur.execute("""
            UPDATE customers 
            SET name = ?, phone = COALESCE(?, phone), password_hash = ?, 
                city = COALESCE(?, city), address = COALESCE(?, address)
            WHERE id = ?
        """, (name, phone, hashed, req.city, req.address, existing["id"]))
        customer_id = existing["id"]
    else:
        cur.execute("""
            INSERT INTO customers (name, email, phone, password_hash, city, address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name, email, phone, hashed, req.city, req.address, now))
        customer_id = cur.lastrowid

    # Create active customer session
    token = secrets.token_urlsafe(32)
    session_now = datetime.now(timezone.utc)
    expires = session_now + timedelta(days=14)

    cur.execute("""
        INSERT INTO customer_sessions (token, customer_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, customer_id, session_now.isoformat(), expires.isoformat()))

    conn.commit()
    conn.close()

    return {
        "token": token,
        "customer": {
            "id": customer_id,
            "name": name,
            "email": email,
            "phone": phone,
            "city": req.city,
            "address": req.address
        }
    }

@app.post("/api/customer/auth/login")
async def customer_login(req: CustomerLoginRequest):
    email = req.email.strip().lower()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, phone, password_hash, city, address FROM customers WHERE email = ?", (email,))
    cust = cur.fetchone()

    if not cust or not cust.get("password_hash") or not verify_password(req.password, cust["password_hash"]):
        conn.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=14)

    cur.execute("""
        INSERT INTO customer_sessions (token, customer_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, cust["id"], now.isoformat(), expires.isoformat()))

    conn.commit()
    conn.close()

    return {
        "token": token,
        "customer": {
            "id": cust["id"],
            "name": cust["name"],
            "email": cust["email"],
            "phone": cust["phone"],
            "city": cust["city"],
            "address": cust["address"]
        }
    }

@app.post("/api/customer/auth/logout")
async def customer_logout(customer: Dict[str, Any] = Depends(get_current_customer)):
    conn = get_db()
    conn.execute("DELETE FROM customer_sessions WHERE token = ?", (customer["token"],))
    conn.commit()
    conn.close()
    return {"message": "Logged out successfully"}

@app.get("/api/customer/profile")
async def customer_profile(customer: Dict[str, Any] = Depends(get_current_customer)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, phone, city, address, created_at FROM customers WHERE id = ?", (customer["id"],))
    c = cur.fetchone()
    conn.close()
    return {"customer": dict(c)}

@app.put("/api/customer/profile")
async def update_customer_profile(req: CustomerUpdateRequest, customer: Dict[str, Any] = Depends(get_current_customer)):
    conn = get_db()
    cur = conn.cursor()
    updates = []
    params = []
    if req.name is not None:
        updates.append("name = ?")
        params.append(req.name.strip())
    if req.phone is not None:
        updates.append("phone = ?")
        params.append(req.phone.strip())
    if req.city is not None:
        updates.append("city = ?")
        params.append(req.city.strip())
    if req.address is not None:
        updates.append("address = ?")
        params.append(req.address.strip())

    if updates:
        params.append(customer["id"])
        cur.execute(f"UPDATE customers SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    cur.execute("SELECT id, name, email, phone, city, address FROM customers WHERE id = ?", (customer["id"],))
    updated = cur.fetchone()
    conn.close()
    return {"message": "Profile updated", "customer": dict(updated)}

@app.get("/api/customer/orders")
async def get_customer_orders(customer: Dict[str, Any] = Depends(get_current_customer)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM orders 
        WHERE customer_id = ? 
        ORDER BY id DESC
    """, (customer["id"],))
    orders = [dict(r) for r in cur.fetchall()]

    # Fetch items and history for each order
    for o in orders:
        cur.execute("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC", (o["id"],))
        o["items"] = [dict(it) for it in cur.fetchall()]
        cur.execute("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id ASC", (o["id"],))
        o["history"] = [dict(h) for h in cur.fetchall()]

    conn.close()
    return {"orders": orders}

@app.get("/api/customer/orders/{order_id}")
async def get_customer_order_detail(order_id: int, customer: Dict[str, Any] = Depends(get_current_customer)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM orders WHERE id = ? AND customer_id = ?", (order_id, customer["id"]))
    order = cur.fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found or unauthorized")

    cur.execute("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC", (order_id,))
    items = [dict(it) for it in cur.fetchall()]

    cur.execute("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id ASC", (order_id,))
    history = [dict(h) for h in cur.fetchall()]

    conn.close()
    return {
        "order": dict(order),
        "items": items,
        "history": history
    }

class CustomerPlaceOrderItem(BaseModel):
    product_id: int
    quantity: int = 1

class CustomerPlaceOrderRequest(BaseModel):
    delivery_address: str
    customer_phone: Optional[str] = None
    notes: Optional[str] = None
    items: List[CustomerPlaceOrderItem]

@app.post("/api/customer/orders")
async def customer_place_order(
    req: CustomerPlaceOrderRequest,
    customer: Dict[str, Any] = Depends(get_current_customer)
):
    if not req.items:
        raise HTTPException(status_code=400, detail="Cart is empty. Add at least one piece to checkout.")
    if not req.delivery_address or len(req.delivery_address.strip()) < 5:
        raise HTTPException(status_code=400, detail="A valid delivery address is required")

    conn = get_db()
    try:
        cur = conn.cursor()

        # Update customer phone or address if provided
        if req.customer_phone or req.delivery_address:
            cur.execute("""
                UPDATE customers 
                SET phone = COALESCE(?, phone), address = COALESCE(?, address)
                WHERE id = ?
            """, (req.customer_phone.strip() if req.customer_phone else None, req.delivery_address.strip(), customer["id"]))

        # 1. Validate all products, current verified prices, and inventory stock
        validated_items = []
        total_amount = 0.0

        for it in req.items:
            if it.quantity <= 0:
                raise HTTPException(status_code=400, detail="Product quantity must be at least 1")
            
            cur.execute("""
                SELECT p.id, p.name, p.wood_type, p.price, p.product_type,
                       COALESCE(i.stock_quantity, 0) as stock_quantity,
                       COALESCE(i.low_stock_threshold, 3) as low_stock_threshold
                FROM products p
                LEFT JOIN inventory i ON p.id = i.product_id
                WHERE p.id = ?
            """, (it.product_id,))
            prod = cur.fetchone()
            if not prod:
                raise HTTPException(status_code=404, detail=f"Product #{it.product_id} no longer exists")

            if prod["product_type"] == "Ready-made" and prod["stock_quantity"] < it.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient inventory for '{prod['name']}'. Requested: {it.quantity}, Available: {prod['stock_quantity']}"
                )

            line_total = prod["price"] * it.quantity
            total_amount += line_total
            validated_items.append({
                "product_id": prod["id"],
                "name": prod["name"],
                "wood_type": prod["wood_type"],
                "unit_price": prod["price"],
                "quantity": it.quantity,
                "total_price": line_total,
                "product_type": prod["product_type"],
                "stock_quantity": prod["stock_quantity"],
                "low_stock_threshold": prod["low_stock_threshold"]
            })

        # 2. Generate unique order reference code
        cur.execute("SELECT COUNT(*) as count FROM orders")
        order_count = cur.fetchone()["count"] + 1
        order_code = f"WOD-2026-{order_count:04d}"

        now = utc_now()

        # 3. Insert order
        cur.execute("""
            INSERT INTO orders (
                order_code, order_type, customer_id, customer_name, customer_email, customer_phone,
                delivery_address, total_amount, payment_status, order_status, custom_specifications,
                production_stage, created_at, updated_at
            ) VALUES (?, 'Ready-made', ?, ?, ?, ?, ?, ?, 'Pending', 'Pending', ?, 'Order Placed', ?, ?)
        """, (
            order_code, customer["id"], customer["name"], customer["email"],
            req.customer_phone or customer["phone"], req.delivery_address.strip(),
            total_amount, req.notes or None, now, now
        ))
        order_id = cur.lastrowid

        # 4. Insert order items & adjust stock
        for it in validated_items:
            cur.execute("""
                INSERT INTO order_items (order_id, product_id, product_name, wood_type, unit_price, quantity, total_price)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (order_id, it["product_id"], it["name"], it["wood_type"], it["unit_price"], it["quantity"], it["total_price"]))

            if it["product_type"] == "Ready-made":
                new_stock = it["stock_quantity"] - it["quantity"]
                cur.execute("UPDATE inventory SET stock_quantity = ?, updated_at = ? WHERE product_id = ?", (new_stock, now, it["product_id"]))

                # Update product status
                new_status = "In Stock" if new_stock > it["low_stock_threshold"] else ("Low Stock" if new_stock > 0 else "Out of Stock")
                cur.execute("UPDATE products SET availability_status = ? WHERE id = ?", (new_status, it["product_id"]))

                # Record inventory transaction
                cur.execute("""
                    INSERT INTO inventory_transactions (
                        product_id, change_amount, previous_quantity, new_quantity, reason, reference_id, created_at
                    ) VALUES (?, ?, ?, ?, 'Customer Order Placement', ?, ?)
                """, (it["product_id"], -it["quantity"], it["stock_quantity"], new_stock, order_code, now))

        # 5. Insert initial status history
        cur.execute("""
            INSERT INTO order_status_history (order_id, status, note, created_at)
            VALUES (?, 'Pending', ?, ?)
        """, (order_id, f"Order placed by customer {customer['name']}. Awaiting workshop review and confirmation.", now))

        conn.commit()
    except HTTPException:
        conn.rollback()
        conn.close()
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to place order: {e}")

    conn.close()

    return {
        "success": True,
        "order_id": order_id,
        "order_code": order_code,
        "total_amount": total_amount,
        "order_status": "Pending",
        "message": f"Order {order_code} confirmed! Our workshop has received your order."
    }

# ==========================================
# CUSTOMER FACING ENDPOINTS
# ==========================================

@app.get("/api/products")
async def get_public_products():
    """Returns products for the customer-facing storefront catalogue."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.*, COALESCE(i.stock_quantity, 0) as stock_quantity, COALESCE(i.low_stock_threshold, 5) as low_stock_threshold
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        ORDER BY p.is_featured DESC, p.id ASC
    """)
    rows = cur.fetchall()
    conn.close()

    res = []
    for r in rows:
        images_list = json.loads(r["images"]) if r["images"] else []
        res.append({
            "id": r["id"],
            "sku": r["sku"],
            "name": r["name"],
            "type": r["category"],
            "wood": r["wood_type"],
            "price": r["price_display"] or f"₹{int(r['price']):,}",
            "raw_price": r["price"],
            "tag": r["tag"],
            "img": images_list[0] if images_list else "",
            "images": images_list,
            "dimensions": r["dimensions"],
            "description": r["description"],
            "product_type": r["product_type"],
            "availability_status": r["availability_status"],
            "stock_quantity": r["stock_quantity"]
        })
    return res

class PublicEnquiryRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    furniture_category: str
    requirements: str
    dimensions: Optional[str] = None
    preferred_wood: Optional[str] = None
    budget: Optional[str] = None

@app.post("/api/enquiries")
async def submit_public_enquiry(req: PublicEnquiryRequest):
    """Submits a customer bespoke enquiry from the storefront custom furniture form."""
    conn = get_db()
    cur = conn.cursor()

    # Find or create customer
    cur.execute("SELECT id FROM customers WHERE email = ?", (req.email.lower().strip(),))
    cust = cur.fetchone()
    if cust:
        cust_id = cust["id"]
        # update phone if provided
        if req.phone:
            cur.execute("UPDATE customers SET phone = ? WHERE id = ?", (req.phone.strip(), cust_id))
    else:
        cur.execute("""
            INSERT INTO customers (name, email, phone, created_at)
            VALUES (?, ?, ?, ?)
        """, (req.name.strip(), req.email.lower().strip(), req.phone.strip() if req.phone else None, utc_now()))
        cust_id = cur.lastrowid

    # Generate enquiry code
    cur.execute("SELECT COUNT(*) as count FROM enquiries")
    count = cur.fetchone()["count"] + 1
    enquiry_code = f"ENQ-2026-{count:04d}"

    cur.execute("""
        INSERT INTO enquiries (
            enquiry_code, customer_id, customer_name, email, phone, furniture_category,
            requirements, dimensions, preferred_wood, budget, status, internal_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', '', ?, ?)
    """, (
        enquiry_code, cust_id, req.name.strip(), req.email.lower().strip(),
        req.phone.strip() if req.phone else None, req.furniture_category,
        req.requirements.strip(), req.dimensions, req.preferred_wood, req.budget,
        utc_now(), utc_now()
    ))
    enquiry_id = cur.lastrowid
    conn.commit()
    conn.close()

    return {
        "success": True,
        "enquiry_code": enquiry_code,
        "id": enquiry_id,
        "message": "Thank you! Your custom enquiry has been received by our Jaipur workshop team."
    }

# ==========================================
# GEMINI AI DATABASE-CONNECTED RECOMMENDATIONS
# ==========================================

class ChatMessageItem(BaseModel):
    from_role: str # 'user' or 'ai'
    text: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessageItem]] = None

@app.post("/api/assistant")
async def assistant(req: ChatRequest):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Gemini API key is not configured")
    
    # 1. Fetch live product catalog & inventory from database
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, p.sku, p.name, p.category, p.wood_type, p.dimensions, p.price,
               p.price_display, p.product_type, p.availability_status, p.is_featured,
               COALESCE(i.stock_quantity, 0) as stock_quantity,
               p.images, p.description
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        ORDER BY p.id ASC
    """)
    rows = cur.fetchall()
    conn.close()

    db_products = []
    product_lookup = {}
    for r in rows:
        imgs = json.loads(r["images"]) if r["images"] else []
        prod_obj = {
            "id": r["id"],
            "sku": r["sku"],
            "name": r["name"],
            "category": r["category"],
            "wood_type": r["wood_type"],
            "dimensions": r["dimensions"],
            "price": r["price"],
            "price_display": r["price_display"] or f"₹{int(r['price']):,}",
            "product_type": r["product_type"],
            "availability_status": r["availability_status"],
            "stock_quantity": r["stock_quantity"],
            "image": imgs[0] if imgs else "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85",
            "description": r["description"]
        }
        db_products.append({
            "id": prod_obj["id"],
            "sku": prod_obj["sku"],
            "name": prod_obj["name"],
            "category": prod_obj["category"],
            "wood_type": prod_obj["wood_type"],
            "dimensions": prod_obj["dimensions"],
            "price": prod_obj["price"],
            "product_type": prod_obj["product_type"],
            "availability_status": prod_obj["availability_status"],
            "stock_quantity": prod_obj["stock_quantity"]
        })
        product_lookup[prod_obj["id"]] = prod_obj

    # 2. Build Gemini System Prompt with live DB context
    client = genai.Client(api_key=key)
    prompt = f"""You are Woodora's expert architectural furniture design advisor and intelligent recommendation engine.
Woodora specializes in handcrafted solid wood furniture (Categories: Dining, Seating, Bedroom, Storage, Living).

CURRENT LIVE PRODUCT & INVENTORY DATABASE:
{json.dumps(db_products, indent=2)}

CUSTOMER MESSAGE:
"{req.message}"

MANDATORY RULES:
1. NEVER invent products, prices, stock quantities, or wood types not present in the database.
2. If the customer specifies constraints (e.g. budget, specific wood like Teak, dimensions, seating capacity, or custom request):
   - Check if an exact match exists in the database.
   - If an exact match is found, recommend it with a brief explanation of why the craftsmanship and dimensions fit.
   - If NO exact match exists (e.g. price is above customer's budget, requested wood is unavailable, or item is out of stock):
     * Honestly inform the customer that an exact ready-made item is not in stock.
     * Suggest closest alternatives from the database if relevant (e.g. Oak dining table when Teak was requested, or another price point).
     * Proactively offer to craft a bespoke custom piece tailored to their exact wood, dimensions, and budget through Woodora's Jaipur workshop.
3. If an item is "Out of Stock" (stock_quantity = 0), explain that it can be custom-crafted or wait-listed.
4. Output your entire response as a VALID, RAW JSON object with NO markdown formatting (no ```json code blocks), containing:
   - "reply": (string) Your complete, warm, sophisticated conversational response.
   - "recommended_product_ids": (array of integers) IDs of products from the database that directly match or serve as good alternatives (empty list [] if none fit).
   - "offer_custom_enquiry": (boolean) true if the request requires or would benefit from a custom bespoke order, false otherwise.
   - "custom_defaults": (object with keys: "category", "preferred_wood", "dimensions", "budget", "requirements") pre-filled values to assist the customer in submitting an enquiry.

Output raw JSON only:"""

    models_to_try = ["gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash-lite"]
    response = None
    last_err = None

    for m in models_to_try:
        try:
            response = client.models.generate_content(model=m, contents=prompt)
            if response and response.text:
                break
        except Exception as e:
            last_err = e
            continue

    if not response or not response.text:
        raise HTTPException(status_code=502, detail=f"AI recommendation failed across models: {last_err}")

    raw_text = response.text.strip()
    
    # Clean any accidental markdown code fences
    if raw_text.startswith("```"):
        lines = raw_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        raw_text = "\n".join(lines).strip()

    try:
        parsed = json.loads(raw_text)
    except Exception:
        parsed = {"reply": raw_text, "recommended_product_ids": [], "offer_custom_enquiry": False}

    recommended_ids = parsed.get("recommended_product_ids", [])
    
    # Build enriched product objects for UI cards from our verified database lookup
    recommended_products = []
    for pid in recommended_ids:
        if pid in product_lookup:
            recommended_products.append(product_lookup[pid])

    return {
        "reply": parsed.get("reply", raw_text),
        "recommended_products": recommended_products,
        "offer_custom_enquiry": parsed.get("offer_custom_enquiry", False),
        "custom_defaults": parsed.get("custom_defaults", None)
    }


# ==========================================
# ADMIN DASHBOARD OVERVIEW ENDPOINT
# ==========================================

@app.get("/api/admin/dashboard/overview")
async def get_dashboard_overview(admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()

    # Product counts
    cur.execute("SELECT COUNT(*) as count FROM products")
    total_products = cur.fetchone()["count"]

    # Orders counts
    cur.execute("SELECT COUNT(*) as count FROM orders")
    total_orders = cur.fetchone()["count"]

    cur.execute("SELECT COUNT(*) as count FROM orders WHERE order_status = 'Pending'")
    pending_orders = cur.fetchone()["count"]

    # Customers counts
    cur.execute("SELECT COUNT(*) as count FROM customers")
    total_customers = cur.fetchone()["count"]

    # New Enquiries
    cur.execute("SELECT COUNT(*) as count FROM enquiries WHERE status = 'New'")
    new_enquiries = cur.fetchone()["count"]

    # Low Stock Products (ready-made where stock <= threshold)
    cur.execute("""
        SELECT COUNT(*) as count
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        WHERE p.product_type = 'Ready-made' AND i.stock_quantity <= i.low_stock_threshold
    """)
    low_stock_products = cur.fetchone()["count"]

    # Actual verified revenue from database orders
    cur.execute("""
        SELECT COALESCE(SUM(total_amount), 0) as rev
        FROM orders
        WHERE payment_status IN ('Verified Offline', 'Paid')
    """)
    total_revenue = cur.fetchone()["rev"]

    # Recent Orders
    cur.execute("""
        SELECT o.id, o.order_code, o.order_type, o.customer_name, o.customer_email,
               o.total_amount, o.payment_status, o.order_status, o.created_at
        FROM orders o
        ORDER BY o.id DESC LIMIT 5
    """)
    recent_orders = [dict(r) for r in cur.fetchall()]

    # Recent Enquiries
    cur.execute("""
        SELECT id, enquiry_code, customer_name, email, furniture_category, requirements, status, created_at
        FROM enquiries
        ORDER BY id DESC LIMIT 5
    """)
    recent_enquiries = [dict(r) for r in cur.fetchall()]

    # Low Stock List
    cur.execute("""
        SELECT p.id, p.sku, p.name, p.wood_type, i.stock_quantity, i.low_stock_threshold
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        WHERE p.product_type = 'Ready-made' AND i.stock_quantity <= i.low_stock_threshold
        ORDER BY i.stock_quantity ASC LIMIT 5
    """)
    low_stock_items = [dict(r) for r in cur.fetchall()]

    # Order Status Distribution
    cur.execute("""
        SELECT order_status, COUNT(*) as count
        FROM orders
        GROUP BY order_status
    """)
    status_distribution = {r["order_status"]: r["count"] for r in cur.fetchall()}

    conn.close()

    return {
        "metrics": {
            "total_products": total_products,
            "total_orders": total_orders,
            "pending_orders": pending_orders,
            "total_customers": total_customers,
            "new_enquiries": new_enquiries,
            "low_stock_products": low_stock_products,
            "total_revenue": total_revenue
        },
        "recent_orders": recent_orders,
        "recent_enquiries": recent_enquiries,
        "low_stock_items": low_stock_items,
        "status_distribution": status_distribution
    }

# ==========================================
# ADMIN PRODUCT MANAGEMENT (CRUD)
# ==========================================

class ProductCreateUpdate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = ""
    category: str
    wood_type: str
    dimensions: Optional[str] = ""
    price: float
    images: List[str]
    product_type: str = "Ready-made" # "Ready-made" or "Made-to-order"
    availability_status: str = "In Stock"
    is_featured: bool = False
    tag: Optional[str] = ""
    initial_stock: Optional[int] = 0
    low_stock_threshold: Optional[int] = 3

@app.get("/api/admin/products")
async def admin_get_products(
    search: Optional[str] = None,
    category: Optional[str] = None,
    product_type: Optional[str] = None,
    admin: Dict[str, Any] = Depends(get_current_admin)
):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT p.*, COALESCE(i.stock_quantity, 0) as stock_quantity, COALESCE(i.low_stock_threshold, 3) as low_stock_threshold
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        WHERE 1=1
    """
    params = []
    if search:
        s = f"%{search.strip().lower()}%"
        query += " AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(p.wood_type) LIKE ?)"
        params.extend([s, s, s])
    if category and category != "All":
        query += " AND p.category = ?"
        params.append(category)
    if product_type and product_type != "All":
        query += " AND p.product_type = ?"
        params.append(product_type)

    query += " ORDER BY p.id DESC"
    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["images"] = json.loads(d["images"]) if d["images"] else []
        d["is_featured"] = bool(d["is_featured"])
        result.append(d)
    return result

@app.post("/api/admin/products")
async def admin_create_product(req: ProductCreateUpdate, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM products WHERE sku = ?", (req.sku.strip(),))
    if cur.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Product SKU '{req.sku}' already exists.")

    now = utc_now()
    price_display = f"₹{int(req.price):,}"

    cur.execute("""
        INSERT INTO products (
            sku, name, description, category, wood_type, dimensions, price, price_display,
            images, product_type, availability_status, is_featured, tag, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.sku.strip(), req.name.strip(), req.description, req.category, req.wood_type,
        req.dimensions, req.price, price_display, json.dumps(req.images),
        req.product_type, req.availability_status, 1 if req.is_featured else 0,
        req.tag, now, now
    ))
    p_id = cur.lastrowid

    # Inventory
    stock_qty = req.initial_stock if req.product_type == "Ready-made" else 0
    cur.execute("""
        INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold, updated_at)
        VALUES (?, ?, ?, ?)
    """, (p_id, stock_qty, req.low_stock_threshold or 3, now))

    if stock_qty > 0:
        cur.execute("""
            INSERT INTO inventory_transactions (
                product_id, change_amount, previous_quantity, new_quantity, reason, reference_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (p_id, stock_qty, 0, stock_qty, "Initial Catalog Stock", f"NEW-PROD-{req.sku}", now))

    conn.commit()
    conn.close()
    return {"message": "Product created successfully", "id": p_id}

@app.put("/api/admin/products/{product_id}")
async def admin_update_product(product_id: int, req: ProductCreateUpdate, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM products WHERE id = ?", (product_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")

    cur.execute("SELECT id FROM products WHERE sku = ? AND id != ?", (req.sku.strip(), product_id))
    if cur.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"SKU '{req.sku}' is taken by another product")

    now = utc_now()
    price_display = f"₹{int(req.price):,}"

    cur.execute("""
        UPDATE products SET
            sku = ?, name = ?, description = ?, category = ?, wood_type = ?,
            dimensions = ?, price = ?, price_display = ?, images = ?, product_type = ?,
            availability_status = ?, is_featured = ?, tag = ?, updated_at = ?
        WHERE id = ?
    """, (
        req.sku.strip(), req.name.strip(), req.description, req.category, req.wood_type,
        req.dimensions, req.price, price_display, json.dumps(req.images),
        req.product_type, req.availability_status, 1 if req.is_featured else 0,
        req.tag, now, product_id
    ))

    # Update threshold
    if req.low_stock_threshold is not None:
        cur.execute("UPDATE inventory SET low_stock_threshold = ? WHERE product_id = ?", (req.low_stock_threshold, product_id))

    conn.commit()
    conn.close()
    return {"message": "Product updated successfully"}

@app.delete("/api/admin/products/{product_id}")
async def admin_delete_product(product_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM products WHERE id = ?", (product_id,))
    p = cur.fetchone()
    if not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")

    cur.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()
    return {"message": f"Product '{p['name']}' deleted successfully"}

# ==========================================
# ADMIN INVENTORY MANAGEMENT
# ==========================================

class StockAdjustmentRequest(BaseModel):
    product_id: int
    change_amount: int # can be positive or negative
    reason: str
    reference: Optional[str] = ""

@app.get("/api/admin/inventory")
async def admin_get_inventory(
    status_filter: Optional[str] = None, # 'all', 'low', 'out', 'normal'
    admin: Dict[str, Any] = Depends(get_current_admin)
):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT p.id, p.sku, p.name, p.category, p.wood_type, p.product_type, p.availability_status,
               COALESCE(i.stock_quantity, 0) as stock_quantity,
               COALESCE(i.low_stock_threshold, 3) as low_stock_threshold,
               i.updated_at as inventory_updated_at
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        ORDER BY p.id ASC
    """)
    rows = cur.fetchall()
    conn.close()

    items = []
    for r in rows:
        d = dict(r)
        if d["product_type"] == "Made-to-order":
            d["stock_state"] = "Made to Order"
        elif d["stock_quantity"] <= 0:
            d["stock_state"] = "Out of Stock"
        elif d["stock_quantity"] <= d["low_stock_threshold"]:
            d["stock_state"] = "Low Stock"
        else:
            d["stock_state"] = "Optimal"

        if status_filter and status_filter != "all":
            if status_filter == "low" and d["stock_state"] != "Low Stock":
                continue
            if status_filter == "out" and d["stock_state"] != "Out of Stock":
                continue
            if status_filter == "mto" and d["stock_state"] != "Made to Order":
                continue

        items.append(d)
    return items

@app.post("/api/admin/inventory/adjust")
async def admin_adjust_inventory(req: StockAdjustmentRequest, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT p.id, p.product_type, i.stock_quantity, i.low_stock_threshold FROM products p JOIN inventory i ON p.id = i.product_id WHERE p.id = ?", (req.product_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Product inventory record not found")

    if row["product_type"] == "Made-to-order":
        conn.close()
        raise HTTPException(status_code=400, detail="Made-to-order items do not carry finished goods inventory. Track them through Custom Orders.")

    current_qty = row["stock_quantity"]
    new_qty = current_qty + req.change_amount

    if new_qty < 0:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Stock cannot be negative. Current stock is {current_qty}.")

    now = utc_now()
    cur.execute("UPDATE inventory SET stock_quantity = ?, updated_at = ? WHERE product_id = ?", (new_qty, now, req.product_id))

    # Update product availability status automatically
    new_status = "In Stock"
    if new_qty == 0:
        new_status = "Out of Stock"
    elif new_qty <= row["low_stock_threshold"]:
        new_status = "Low Stock"
    cur.execute("UPDATE products SET availability_status = ?, updated_at = ? WHERE id = ?", (new_status, now, req.product_id))

    # Record Movement
    cur.execute("""
        INSERT INTO inventory_transactions (
            product_id, change_amount, previous_quantity, new_quantity, reason, reference_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (req.product_id, req.change_amount, current_qty, new_qty, req.reason.strip(), req.reference.strip() if req.reference else "Manual Adjustment", now))

    conn.commit()
    conn.close()
    return {"message": "Stock adjusted successfully", "new_quantity": new_qty, "availability_status": new_status}

@app.get("/api/admin/inventory/transactions")
async def admin_get_inventory_transactions(
    product_id: Optional[int] = None,
    limit: int = 25,
    admin: Dict[str, Any] = Depends(get_current_admin)
):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT t.*, p.name as product_name, p.sku
        FROM inventory_transactions t
        JOIN products p ON t.product_id = p.id
    """
    params = []
    if product_id:
        query += " WHERE t.product_id = ?"
        params.append(product_id)
    query += " ORDER BY t.id DESC LIMIT ?"
    params.append(limit)

    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

# ==========================================
# ADMIN CUSTOMER MANAGEMENT
# ==========================================

@app.get("/api/admin/customers")
async def admin_get_customers(
    search: Optional[str] = None,
    admin: Dict[str, Any] = Depends(get_current_admin)
):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT c.*,
               (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as order_count,
               (SELECT COUNT(*) FROM enquiries e WHERE e.customer_id = c.id) as enquiry_count,
               (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status IN ('Paid', 'Verified Offline')) as total_spent
        FROM customers c
        WHERE 1=1
    """
    params = []
    if search:
        s = f"%{search.strip().lower()}%"
        query += " AND (LOWER(c.name) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(COALESCE(c.city, '')) LIKE ?)"
        params.extend([s, s, s])

    query += " ORDER BY c.id DESC"
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.get("/api/admin/customers/{customer_id}")
async def admin_get_customer_profile(customer_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM customers WHERE id = ?", (customer_id,))
    cust = cur.fetchone()
    if not cust:
        conn.close()
        raise HTTPException(status_code=404, detail="Customer not found")

    cur.execute("SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC", (customer_id,))
    orders = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM enquiries WHERE customer_id = ? ORDER BY id DESC", (customer_id,))
    enquiries = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "customer": dict(cust),
        "orders": orders,
        "enquiries": enquiries
    }

# ==========================================
# ADMIN ENQUIRY MANAGEMENT
# ==========================================

class EnquiryStatusUpdate(BaseModel):
    status: str # 'New', 'Contacted', 'Quotation Sent', 'Approved', 'Rejected', 'Closed'
    internal_notes: Optional[str] = None

class ConvertEnquiryToOrderRequest(BaseModel):
    enquiry_id: int
    agreed_amount: float
    delivery_address: str
    custom_specifications: Optional[str] = ""

@app.get("/api/admin/enquiries")
async def admin_get_enquiries(
    status: Optional[str] = None,
    search: Optional[str] = None,
    admin: Dict[str, Any] = Depends(get_current_admin)
):
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT * FROM enquiries WHERE 1=1"
    params = []
    if status and status != "All":
        query += " AND status = ?"
        params.append(status)
    if search:
        s = f"%{search.strip().lower()}%"
        query += " AND (LOWER(customer_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(enquiry_code) LIKE ? OR LOWER(furniture_category) LIKE ?)"
        params.extend([s, s, s, s])

    query += " ORDER BY id DESC"
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.get("/api/admin/enquiries/{enquiry_id}")
async def admin_get_enquiry_detail(enquiry_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM enquiries WHERE id = ?", (enquiry_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Enquiry not found")

    # Linked order if converted
    cur.execute("SELECT * FROM orders WHERE enquiry_id = ?", (enquiry_id,))
    order = cur.fetchone()

    conn.close()
    return {
        "enquiry": dict(row),
        "linked_order": dict(order) if order else None
    }

@app.put("/api/admin/enquiries/{enquiry_id}/status")
async def admin_update_enquiry_status(enquiry_id: int, req: EnquiryStatusUpdate, admin: Dict[str, Any] = Depends(get_current_admin)):
    valid_statuses = ['New', 'Contacted', 'Quotation Sent', 'Approved', 'Rejected', 'Closed']
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, internal_notes FROM enquiries WHERE id = ?", (enquiry_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Enquiry not found")

    notes = req.internal_notes if req.internal_notes is not None else row["internal_notes"]

    cur.execute("""
        UPDATE enquiries SET status = ?, internal_notes = ?, updated_at = ? WHERE id = ?
    """, (req.status, notes, utc_now(), enquiry_id))
    conn.commit()
    conn.close()
    return {"message": "Enquiry status updated successfully", "status": req.status}

@app.post("/api/admin/enquiries/convert-to-order")
async def admin_convert_enquiry_to_order(req: ConvertEnquiryToOrderRequest, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM enquiries WHERE id = ?", (req.enquiry_id,))
    enq = cur.fetchone()
    if not enq:
        conn.close()
        raise HTTPException(status_code=404, detail="Enquiry not found")

    # Check if already converted
    cur.execute("SELECT order_code FROM orders WHERE enquiry_id = ?", (req.enquiry_id,))
    existing = cur.fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail=f"This enquiry was already converted to order {existing['order_code']}")

    now = utc_now()
    cur.execute("SELECT COUNT(*) as count FROM orders")
    order_num = cur.fetchone()["count"] + 1
    order_code = f"WOD-2026-C{order_num:03d}"

    specs = req.custom_specifications or f"Category: {enq['furniture_category']} | Wood: {enq['preferred_wood']} | Dims: {enq['dimensions']} | Brief: {enq['requirements']}"

    cur.execute("""
        INSERT INTO orders (
            order_code, order_type, customer_id, customer_name, customer_email, customer_phone,
            delivery_address, total_amount, payment_status, order_status, custom_specifications,
            production_stage, enquiry_id, created_at, updated_at
        ) VALUES (?, 'Custom', ?, ?, ?, ?, ?, ?, 'Pending', 'In Production', ?, 'Materials Sourcing', ?, ?, ?)
    """, (
        order_code, enq["customer_id"], enq["customer_name"], enq["email"], enq["phone"],
        req.delivery_address.strip(), req.agreed_amount, specs, req.enquiry_id, now, now
    ))
    order_id = cur.lastrowid

    # Create Order Item
    item_title = f"Custom Bespoke {enq['furniture_category']} ({enq['preferred_wood'] or 'Solid Wood'})"
    cur.execute("""
        INSERT INTO order_items (order_id, product_id, product_name, wood_type, unit_price, quantity, total_price)
        VALUES (?, NULL, ?, ?, ?, 1, ?)
    """, (order_id, item_title, enq["preferred_wood"] or "Custom", req.agreed_amount, req.agreed_amount))

    # Add Status History
    cur.execute("""
        INSERT INTO order_status_history (order_id, status, note, created_at)
        VALUES (?, 'In Production', ?, ?)
    """, (order_id, f"Converted from approved enquiry {enq['enquiry_code']}. Production initiated: Materials Sourcing.", now))

    # Update Enquiry Status to Approved / Closed
    cur.execute("UPDATE enquiries SET status = 'Approved', updated_at = ? WHERE id = ?", (now, req.enquiry_id))

    conn.commit()
    conn.close()

    return {
        "message": "Enquiry successfully converted to Custom Order",
        "order_id": order_id,
        "order_code": order_code
    }

# ==========================================
# ADMIN ORDER MANAGEMENT
# ==========================================

class OrderItemInput(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    wood_type: Optional[str] = "Solid Wood"
    unit_price: float
    quantity: int

class CreateOrderRequest(BaseModel):
    order_type: str = "Ready-made" # "Ready-made" or "Custom"
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    delivery_address: str
    items: List[OrderItemInput]
    payment_status: str = "Pending" # "Pending", "Verified Offline", "Paid"
    order_status: str = "Confirmed" # "Pending", "Confirmed", "In Production", "Ready for Dispatch", "Shipped", "Delivered", "Cancelled"
    custom_specifications: Optional[str] = None
    production_stage: Optional[str] = None
    notes: Optional[str] = None

class UpdateOrderStatusRequest(BaseModel):
    order_status: str
    payment_status: Optional[str] = None
    production_stage: Optional[str] = None
    note: Optional[str] = None

@app.get("/api/admin/orders")
async def admin_get_orders(
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    search: Optional[str] = None,
    admin: Dict[str, Any] = Depends(get_current_admin)
):
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT * FROM orders WHERE 1=1"
    params = []
    if status and status != "All":
        query += " AND order_status = ?"
        params.append(status)
    if order_type and order_type != "All":
        query += " AND order_type = ?"
        params.append(order_type)
    if search:
        s = f"%{search.strip().lower()}%"
        query += " AND (LOWER(order_code) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_email) LIKE ?)"
        params.extend([s, s, s])

    query += " ORDER BY id DESC"
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.get("/api/admin/orders/{order_id}")
async def admin_get_order_detail(order_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    order = cur.fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found")

    cur.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
    items = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id ASC", (order_id,))
    history = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "order": dict(order),
        "items": items,
        "history": history
    }

@app.post("/api/admin/orders")
async def admin_create_order(req: CreateOrderRequest, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Find or create customer
        cur.execute("SELECT id FROM customers WHERE email = ?", (req.customer_email.lower().strip(),))
        cust = cur.fetchone()
        if cust:
            cust_id = cust["id"]
        else:
            cur.execute("""
                INSERT INTO customers (name, email, phone, address, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (req.customer_name.strip(), req.customer_email.lower().strip(), req.customer_phone, req.delivery_address, utc_now()))
            cust_id = cur.lastrowid

        now = utc_now()
        cur.execute("SELECT COUNT(*) as count FROM orders")
        total_orders = cur.fetchone()["count"] + 1
        code_prefix = "WOD-2026-C" if req.order_type == "Custom" else "WOD-2026-"
        order_code = f"{code_prefix}{total_orders:03d}"

        # Calculate total
        total_amount = sum(it.unit_price * it.quantity for it in req.items)

        cur.execute("""
            INSERT INTO orders (
                order_code, order_type, customer_id, customer_name, customer_email, customer_phone,
                delivery_address, total_amount, payment_status, order_status, custom_specifications,
                production_stage, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            order_code, req.order_type, cust_id, req.customer_name.strip(), req.customer_email.lower().strip(),
            req.customer_phone, req.delivery_address.strip(), total_amount, req.payment_status,
            req.order_status, req.custom_specifications, req.production_stage, now, now
        ))
        order_id = cur.lastrowid

        # Insert items and adjust stock for ready-made
        for it in req.items:
            line_total = it.unit_price * it.quantity
            cur.execute("""
                INSERT INTO order_items (order_id, product_id, product_name, wood_type, unit_price, quantity, total_price)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (order_id, it.product_id, it.product_name, it.wood_type, it.unit_price, it.quantity, line_total))

            if req.order_type == "Ready-made" and it.product_id:
                # Check and decrement stock
                cur.execute("SELECT stock_quantity, low_stock_threshold FROM inventory WHERE product_id = ?", (it.product_id,))
                inv = cur.fetchone()
                if inv:
                    old_qty = inv["stock_quantity"]
                    new_qty = max(0, old_qty - it.quantity)
                    cur.execute("UPDATE inventory SET stock_quantity = ?, updated_at = ? WHERE product_id = ?", (new_qty, now, it.product_id))

                    new_status = "In Stock" if new_qty > inv["low_stock_threshold"] else ("Low Stock" if new_qty > 0 else "Out of Stock")
                    cur.execute("UPDATE products SET availability_status = ? WHERE id = ?", (new_status, it.product_id))

                    cur.execute("""
                        INSERT INTO inventory_transactions (
                            product_id, change_amount, previous_quantity, new_quantity, reason, reference_id, created_at
                        ) VALUES (?, ?, ?, ?, 'Order Placed', ?, ?)
                    """, (it.product_id, -it.quantity, old_qty, new_qty, order_code, now))

        # Insert Initial Status History
        cur.execute("""
            INSERT INTO order_status_history (order_id, status, note, created_at)
            VALUES (?, ?, ?, ?)
        """, (order_id, req.order_status, req.notes or f"Order created in {req.order_status} status.", now))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Order transaction failed: {e}")

    conn.close()

    return {
        "message": "Order created successfully",
        "order_id": order_id,
        "order_code": order_code,
        "total_amount": total_amount
    }

@app.put("/api/admin/orders/{order_id}/status")
async def admin_update_order_status(order_id: int, req: UpdateOrderStatusRequest, admin: Dict[str, Any] = Depends(get_current_admin)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    order = cur.fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = order["order_status"]
    new_status = req.order_status
    now = utc_now()

    # Inventory restoration if an order is cancelled or rejected
    if new_status in ["Cancelled", "Rejected"] and old_status not in ["Cancelled", "Rejected"]:
        # Restore stock for ready-made items in this order
        cur.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", (order_id,))
        items = cur.fetchall()
        for it in items:
            if it["product_id"]:
                cur.execute("SELECT stock_quantity, low_stock_threshold FROM inventory WHERE product_id = ?", (it["product_id"],))
                inv = cur.fetchone()
                if inv:
                    restored_stock = inv["stock_quantity"] + it["quantity"]
                    cur.execute("UPDATE inventory SET stock_quantity = ?, updated_at = ? WHERE product_id = ?", (restored_stock, now, it["product_id"]))
                    cur.execute("""
                        INSERT INTO inventory_transactions (
                            product_id, change_amount, previous_quantity, new_quantity, reason, reference_id, created_at
                        ) VALUES (?, ?, ?, ?, 'Order Cancellation Restock', ?, ?)
                    """, (it["product_id"], it["quantity"], inv["stock_quantity"], restored_stock, order["order_code"], now))

    updates = ["order_status = ?", "updated_at = ?"]
    params = [new_status, now]

    if req.payment_status:
        updates.append("payment_status = ?")
        params.append(req.payment_status)

    if req.production_stage is not None:
        updates.append("production_stage = ?")
        params.append(req.production_stage)

    params.append(order_id)
    cur.execute(f"UPDATE orders SET {', '.join(updates)} WHERE id = ?", params)

    # Record history with responsible admin
    admin_name = admin.get("name", "Administrator")
    history_note = req.note or f"Order status changed to '{new_status}' by {admin_name}."
    if req.production_stage:
        history_note += f" Production Stage: {req.production_stage}."
    if req.payment_status:
        history_note += f" Payment: {req.payment_status}."

    cur.execute("""
        INSERT INTO order_status_history (order_id, status, note, created_at)
        VALUES (?, ?, ?, ?)
    """, (order_id, new_status, history_note, now))

    conn.commit()
    conn.close()

    return {"message": "Order status updated successfully", "order_status": new_status}

# ==========================================
# ADMIN SETTINGS & PROFILE ENDPOINT
# ==========================================

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/admin/settings/password")
async def admin_change_password(req: ChangePasswordRequest, admin: Dict[str, Any] = Depends(get_current_admin)):
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT password_hash FROM admin_users WHERE id = ?", (admin["id"],))
    row = cur.fetchone()
    if not row or not verify_password(req.current_password, row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = hash_password(req.new_password)
    cur.execute("UPDATE admin_users SET password_hash = ? WHERE id = ?", (new_hash, admin["id"]))
    conn.commit()
    conn.close()

    return {"message": "Password changed successfully"}
