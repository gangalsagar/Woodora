import os
import sys
import json
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath("."))
load_dotenv("backend/.env")

from backend.database import get_db

def run_cleanup():
    print("Starting Neon database test data cleanup...")
    with get_db() as conn:
        with conn.cursor() as cur:
            # 1. Restore Product #6 to its original title, price and display price
            print("\n1. Restoring Product #6 to original seed values...")
            cur.execute("""
                UPDATE products 
                SET name = 'Noma Coffee Table',
                    price = 26000.0,
                    price_display = '₹26,000',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 6
                RETURNING id, name, price, price_display;
            """)
            updated_p6 = cur.fetchone()
            print(f"Product #6 restored: {dict(updated_p6)}")

            # Ensure inventory for product 6 is reset to original 11 if changed
            cur.execute("""
                UPDATE inventory
                SET stock_quantity = 11,
                    updated_at = CURRENT_TIMESTAMP
                WHERE product_id = 6;
            """)
            print("Product #6 inventory restored to stock_quantity=11.")

            # 2. Inspect test record IDs before deletion
            cur.execute("SELECT id, order_code, customer_id FROM orders WHERE id > 2;")
            test_orders = cur.fetchall()
            print(f"\nTest orders to delete ({len(test_orders)}): {[o['order_code'] for o in test_orders]}")

            cur.execute("SELECT id, enquiry_code, customer_id FROM enquiries WHERE id > 2;")
            test_enquiries = cur.fetchall()
            print(f"Test enquiries to delete ({len(test_enquiries)}): {[e['enquiry_code'] for e in test_enquiries]}")

            cur.execute("SELECT id, name, email FROM customers WHERE id > 3;")
            test_customers = cur.fetchall()
            print(f"Test customers to delete ({len(test_customers)}): {[c['name'] for c in test_customers]}")

            cur.execute("SELECT id, product_id, reason FROM inventory_transactions WHERE id > 4;")
            test_inv_txs = cur.fetchall()
            print(f"Test inventory transactions to delete ({len(test_inv_txs)}): {[tx['id'] for tx in test_inv_txs]}")

            # 3. Delete in exact FK dependency order
            print("\n2. Executing deletions in FK dependency order:")
            
            # Delete order status history for test orders
            cur.execute("DELETE FROM order_status_history WHERE order_id > 2;")
            print(" - Deleted order_status_history for test orders (order_id > 2)")

            # Delete order items for test orders
            cur.execute("DELETE FROM order_items WHERE order_id > 2;")
            print(" - Deleted order_items for test orders (order_id > 2)")

            # Delete test orders
            cur.execute("DELETE FROM orders WHERE id > 2;")
            print(" - Deleted test orders (id > 2)")

            # Delete test enquiries
            cur.execute("DELETE FROM enquiries WHERE id > 2;")
            print(" - Deleted test enquiries (id > 2)")

            # Delete test inventory transactions (seeded were ids 1-4)
            cur.execute("DELETE FROM inventory_transactions WHERE id > 4;")
            print(" - Deleted test inventory_transactions (id > 4)")

            # Delete test customers (genuine seeded customers are ids 1-3)
            cur.execute("DELETE FROM customers WHERE id > 3;")
            print(" - Deleted test customers (id > 3)")

            # Commit changes
            conn.commit()
            print("\nCleanup committed successfully.")

            # 4. Verification audit of all tables
            print("\n3. Post-cleanup table record counts:")
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
            for t in TABLES:
                cur.execute(f"SELECT COUNT(*) as count FROM {t};")
                count = cur.fetchone()["count"]
                print(f"   {t:25}: {count}")

if __name__ == "__main__":
    run_cleanup()
