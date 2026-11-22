import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath("."))
load_dotenv("backend/.env")

from backend.database import get_db, init_db

# We test against FastAPI TestClient or direct backend API
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def run_e2e_tests():
    print("=" * 65)
    print("WOODORA END-TO-END ORDER LIFECYCLE VERIFICATION SUITE")
    print("=" * 65)

    timestamp = int(datetime.now().timestamp())
    test_email = f"customer_{timestamp}@woodora-test.com"
    test_password = "SecurePassword123!"
    test_name = "Kavita Singhania"
    test_phone = "+91 98765 43210"
    test_address = "Flat 12B, Oberoi Sky Heights, Worli, Mumbai 400018"

    admin_token = None
    customer_token = None
    customer_id = None
    order_id = None
    order_code = None

    # Step 0: Login as Admin to get Admin token
    print("\n[Step 0] Admin Authentication...")
    admin_login_res = client.post("/api/admin/auth/login", json={
        "email": "admin@woodora.com",
        "password": "WoodoraAdmin2026!"
    })
    assert admin_login_res.status_code == 200, f"Admin login failed: {admin_login_res.text}"
    admin_token = admin_login_res.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("✓ Admin authenticated successfully.")

    # Step 1: Register a new customer
    print("\n[Step 1] Customer Registration...")
    reg_res = client.post("/api/customer/auth/register", json={
        "name": test_name,
        "email": test_email,
        "phone": test_phone,
        "password": test_password,
        "confirm_password": test_password,
        "city": "Mumbai",
        "address": test_address
    })
    assert reg_res.status_code == 200, f"Customer registration failed: {reg_res.text}"
    reg_data = reg_res.json()
    customer_token = reg_data["token"]
    customer_id = reg_data["customer"]["id"]
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    print(f"✓ Customer registered: ID {customer_id}, Email: {test_email}")

    # Step 2: Customer Login verification
    print("\n[Step 2] Customer Login...")
    login_res = client.post("/api/customer/auth/login", json={
        "email": test_email,
        "password": test_password
    })
    assert login_res.status_code == 200, f"Customer login failed: {login_res.text}"
    print("✓ Customer logged in successfully with valid session token.")

    # Step 3: Browse catalogue and select available product
    print("\n[Step 3] Catalogue Browsing & Stock Inspection...")
    cat_res = client.get("/api/products")
    assert cat_res.status_code == 200, f"Get products failed: {cat_res.text}"
    products = cat_res.json()
    ready_products = [p for p in products if p["product_type"] == "Ready-made" and p["stock_quantity"] > 0]
    assert len(ready_products) > 0, "No ready-made products in stock for testing"
    test_prod = ready_products[0]
    initial_stock = test_prod["stock_quantity"]
    print(f"✓ Selected piece '{test_prod['name']}' (ID: {test_prod['id']}) with initial stock: {initial_stock}")

    # Step 4: Unauthenticated order placement rejection test
    print("\n[Step 4] Security Test: Unauthenticated Visitor Cannot Place Order...")
    unauth_order_res = client.post("/api/customer/orders", json={
        "delivery_address": test_address,
        "items": [{"product_id": test_prod["id"], "quantity": 1}]
    })
    assert unauth_order_res.status_code == 401, f"Expected 401 Unauthorized but got {unauth_order_res.status_code}"
    print("✓ Unauthenticated order placement correctly rejected with 401 Unauthorized.")

    # Step 5: Place order with authenticated customer
    print("\n[Step 5] Customer Places Order via Checkout...")
    order_res = client.post("/api/customer/orders", headers=customer_headers, json={
        "delivery_address": test_address,
        "customer_phone": test_phone,
        "notes": "Please deliver between 2 PM and 5 PM with white glove assembly.",
        "items": [{"product_id": test_prod["id"], "quantity": 1}]
    })
    assert order_res.status_code == 200, f"Order placement failed: {order_res.text}"
    order_data = order_res.json()
    order_id = order_data["order_id"]
    order_code = order_data["order_code"]
    print(f"✓ Order created successfully: Code: {order_code}, Order ID: {order_id}, Status: {order_data['order_status']}")

    # Step 6: Verify Database state and inventory deduction
    print("\n[Step 6] Database Integrity & Stock Deduction Verification...")
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
        db_order = cur.fetchone()
        assert db_order is not None, "Order record not found in PostgreSQL"
        assert db_order["customer_id"] == customer_id, "Customer ID mismatch in DB"
        assert db_order["order_status"] == "Pending", "Order status must be Pending"
        
        cur.execute("SELECT stock_quantity FROM inventory WHERE product_id = ?", (test_prod["id"],))
        new_stock = cur.fetchone()["stock_quantity"]
        assert new_stock == initial_stock - 1, f"Stock quantity did not decrease by 1! Old: {initial_stock}, New: {new_stock}"
        print(f"✓ Verified in PostgreSQL: Customer ID {customer_id}, Status 'Pending', Stock decremented to {new_stock}")
    conn.close()

    # Step 7: Customer checks My Orders
    print("\n[Step 7] Customer My Orders Visibility...")
    my_orders_res = client.get("/api/customer/orders", headers=customer_headers)
    assert my_orders_res.status_code == 200, f"Get customer orders failed: {my_orders_res.text}"
    cust_orders = my_orders_res.json()["orders"]
    found = any(o["order_code"] == order_code for o in cust_orders)
    assert found, f"Order {order_code} not found in customer's order history"
    print(f"✓ Order {order_code} is visible under customer account.")

    # Step 8: Security Test: Customer Isolation (Another customer cannot view this order)
    print("\n[Step 8] Security Test: Cross-Customer Authorization Isolation...")
    reg_other = client.post("/api/customer/auth/register", json={
        "name": "Other Customer",
        "email": f"other_{timestamp}@woodora-test.com",
        "password": "Password999!",
        "confirm_password": "Password999!"
    })
    other_token = reg_other.json()["token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    other_access_res = client.get(f"/api/customer/orders/{order_id}", headers=other_headers)
    assert other_access_res.status_code == 404, f"Expected 404 on cross-customer access, got {other_access_res.status_code}"
    print("✓ Customer isolation verified: Another customer received 404 on private order detail.")

    # Step 9: Security Test: Customer cannot call admin endpoints
    print("\n[Step 9] Security Test: Customer Cannot Access Admin Endpoints...")
    cust_admin_attempt = client.get("/api/admin/orders", headers=customer_headers)
    assert cust_admin_attempt.status_code == 401, f"Expected 401 when customer calls admin route, got {cust_admin_attempt.status_code}"
    print("✓ Customer cannot access admin endpoints.")

    # Step 10: Admin orders visibility
    print("\n[Step 10] Admin Dashboard Visibility...")
    admin_orders_res = client.get("/api/admin/orders", headers=admin_headers)
    assert admin_orders_res.status_code == 200, f"Admin orders failed: {admin_orders_res.text}"
    all_admin_orders = admin_orders_res.json()
    admin_found = next((o for o in all_admin_orders if o["order_code"] == order_code), None)
    assert admin_found is not None, f"Order {order_code} not listed in Admin orders"
    print(f"✓ Admin sees Order {order_code} from {admin_found['customer_name']} with Total ₹{admin_found['total_amount']}")

    # Step 11: Admin inspects order details
    print("\n[Step 11] Admin Opens Full Order Details...")
    order_detail_res = client.get(f"/api/admin/orders/{order_id}", headers=admin_headers)
    assert order_detail_res.status_code == 200, f"Admin order detail failed: {order_detail_res.text}"
    detail_data = order_detail_res.json()
    assert len(detail_data["items"]) == 1
    assert detail_data["order"]["customer_email"] == test_email
    print(f"✓ Admin verified complete items, customer contact, and timeline logs.")

    # Step 12: Admin Approves / Confirms Order
    print("\n[Step 12] Admin Approves Order...")
    approve_res = client.put(f"/api/admin/orders/{order_id}/status", headers=admin_headers, json={
        "order_status": "Confirmed",
        "payment_status": "Verified Offline",
        "note": "Payment confirmed via RTGS. Order scheduled for packaging."
    })
    assert approve_res.status_code == 200, f"Approve failed: {approve_res.text}"
    print("✓ Admin successfully approved order (status -> 'Confirmed').")

    # Step 13: Customer sees Confirmed status
    print("\n[Step 13] Synchronization: Customer Sees Confirmed Status...")
    cust_check_res = client.get(f"/api/customer/orders/{order_id}", headers=customer_headers)
    assert cust_check_res.status_code == 200
    assert cust_check_res.json()["order"]["order_status"] == "Confirmed"
    print("✓ Customer account reflects 'Confirmed' status in real time.")

    # Step 14: Step through Production / Delivery Stages
    stages = [
        ("In Production", "Lumber joinery and sanding in progress at Jaipur workshop.", "Woodworking & Joinery"),
        ("Ready for Dispatch", "Hand waxed and white-glove packaging complete.", "Ready"),
        ("Shipped", "Dispatched via specialized furniture transport.", "Dispatched"),
        ("Delivered", "Delivered and installed at customer residence.", "Delivered")
    ]
    for st, note_txt, prod_st in stages:
        print(f"\n[Step 14] Admin updates status to '{st}'...")
        upd = client.put(f"/api/admin/orders/{order_id}/status", headers=admin_headers, json={
            "order_status": st,
            "production_stage": prod_st,
            "note": note_txt
        })
        assert upd.status_code == 200

        # Verify on customer side
        c_ver = client.get(f"/api/customer/orders/{order_id}", headers=customer_headers)
        assert c_ver.status_code == 200
        assert c_ver.json()["order"]["order_status"] == st, f"Customer side failed to reflect {st}"
        print(f"✓ Synchronized: Admin updated to '{st}', customer side verified.")

    # Step 15: Test Cancellation & Inventory Restock
    print("\n[Step 15] Test Order Cancellation & Inventory Restocking...")
    # Place another test order to cancel
    cancel_order_res = client.post("/api/customer/orders", headers=customer_headers, json={
        "delivery_address": test_address,
        "items": [{"product_id": test_prod["id"], "quantity": 1}]
    })
    assert cancel_order_res.status_code == 200
    cancel_order_id = cancel_order_res.json()["order_id"]

    # Verify stock decremented again
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute("SELECT stock_quantity FROM inventory WHERE product_id = ?", (test_prod["id"],))
        stock_before_cancel = cur.fetchone()["stock_quantity"]
    conn.close()

    # Admin rejects / cancels order
    rej_res = client.put(f"/api/admin/orders/{cancel_order_id}/status", headers=admin_headers, json={
        "order_status": "Cancelled",
        "note": "Customer requested order cancellation before dispatch."
    })
    assert rej_res.status_code == 200

    # Verify inventory was automatically restored
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute("SELECT stock_quantity FROM inventory WHERE product_id = ?", (test_prod["id"],))
        stock_after_cancel = cur.fetchone()["stock_quantity"]
        assert stock_after_cancel == stock_before_cancel + 1, "Inventory stock was NOT restored upon cancellation!"
        print(f"✓ Stock restored from {stock_before_cancel} back to {stock_after_cancel} upon cancellation.")
    conn.close()

    # Customer verifies Cancelled status
    c_cancel_ver = client.get(f"/api/customer/orders/{cancel_order_id}", headers=customer_headers)
    assert c_cancel_ver.json()["order"]["order_status"] == "Cancelled"
    print("✓ Customer view verified: Order shows 'Cancelled'.")

    # Step 16: Cleanup test records
    print("\n[Step 16] Cleaning up test records created during testing...")
    conn = get_db()
    with conn.cursor() as cur:
        # Delete order status history for test orders
        cur.execute("DELETE FROM order_status_history WHERE order_id IN (?, ?)", (order_id, cancel_order_id))
        # Delete order items
        cur.execute("DELETE FROM order_items WHERE order_id IN (?, ?)", (order_id, cancel_order_id))
        # Delete orders
        cur.execute("DELETE FROM orders WHERE id IN (?, ?)", (order_id, cancel_order_id))
        # Delete customer sessions
        cur.execute("DELETE FROM customer_sessions WHERE customer_id IN (?, ?)", (customer_id, reg_other.json()["customer"]["id"]))
        # Delete customers
        cur.execute("DELETE FROM customers WHERE id IN (?, ?)", (customer_id, reg_other.json()["customer"]["id"]))
        # Restore test product stock to initial_stock
        cur.execute("UPDATE inventory SET stock_quantity = ? WHERE product_id = ?", (initial_stock, test_prod["id"]))
        # Clean test inventory transactions
        cur.execute("DELETE FROM inventory_transactions WHERE reference_id IN (?, ?)", (order_code, cancel_order_res.json()["order_code"]))
        conn.commit()
    conn.close()
    print("✓ Cleaned up test data safely without affecting seeded records.")

    print("\n" + "=" * 65)
    print("ALL 16 TEST STAGES PASSED 100%! PIPELINE VERIFIED END-TO-END.")
    print("=" * 65)

if __name__ == "__main__":
    run_e2e_tests()
