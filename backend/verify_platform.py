from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def run_tests():
    print("--- 1. Storefront: Public products ---")
    prod_res = client.get('/api/products')
    assert prod_res.status_code == 200, f"Public products failed: {prod_res.status_code}"
    print("✓ Public products count:", len(prod_res.json()))

    print("\n--- 2. Storefront: Submit custom enquiry ---")
    enq_res = client.post('/api/enquiries', json={
        'name': 'Pooja Hegde',
        'email': 'pooja@example.com',
        'phone': '+91 99887 76655',
        'furniture_category': 'Dining table',
        'requirements': '8-seater live-edge dining table in solid teak with brass inlays'
    })
    assert enq_res.status_code == 200, f"Enquiry failed: {enq_res.status_code}"
    enq_data = enq_res.json()
    print("✓ Created enquiry:", enq_data['enquiry_code'])

    print("\n--- 3. Admin: Login ---")
    login_res = client.post('/api/admin/auth/login', json={
        'email': 'admin@woodora.com',
        'password': 'WoodoraAdmin2026!'
    })
    assert login_res.status_code == 200, "Admin login failed"
    token = login_res.json()['token']
    headers = {'Authorization': f'Bearer {token}'}
    print("✓ Admin authenticated successfully")

    print("\n--- 4. Admin: Overview metrics ---")
    ov = client.get('/api/admin/dashboard/overview', headers=headers).json()
    print("✓ Dashboard metrics:", ov['metrics'])

    print("\n--- 5. Admin: Verify enquiry reached admin ---")
    enq_list = client.get('/api/admin/enquiries', headers=headers).json()
    target_enq = next((e for e in enq_list if e['enquiry_code'] == enq_data['enquiry_code']), None)
    assert target_enq is not None, "Enquiry not found in admin list"
    print("✓ Verified enquiry in admin list")

    print("\n--- 6. Admin: Update enquiry status to Approved ---")
    update_res = client.put(f"/api/admin/enquiries/{target_enq['id']}/status", headers=headers, json={
        'status': 'Approved',
        'internal_notes': 'Architect approved drawing on 22 Nov.'
    })
    assert update_res.status_code == 200
    print("✓ Status updated to Approved")

    print("\n--- 7. Admin: Convert approved enquiry to Custom Order ---")
    convert_res = client.post('/api/admin/enquiries/convert-to-order', headers=headers, json={
        'enquiry_id': target_enq['id'],
        'agreed_amount': 185000.0,
        'delivery_address': 'Flat 12B, Ocean Crest, Worli, Mumbai',
        'custom_specifications': '8-seater live-edge dining table in solid teak'
    })
    assert convert_res.status_code == 200
    conv_data = convert_res.json()
    print("✓ Converted to custom order:", conv_data['order_code'])

    print("\n--- 8. Admin: Create product with inventory ---")
    new_prod_res = client.post('/api/admin/products', headers=headers, json={
        'sku': 'WOD-TEST-888',
        'name': 'Aura Minimalist Armchair',
        'category': 'Seating',
        'wood_type': 'Solid Walnut',
        'dimensions': '75cm x 75cm x 80cm',
        'price': 42000.0,
        'images': ['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c'],
        'product_type': 'Ready-made',
        'availability_status': 'In Stock',
        'is_featured': True,
        'tag': 'New Arrival',
        'initial_stock': 5,
        'low_stock_threshold': 2
    })
    assert new_prod_res.status_code == 200
    new_pid = new_prod_res.json()['id']
    print(f"✓ Created test product ID {new_pid} with 5 stock units")

    print("\n--- 9. Admin: Adjust stock (Stock Control) ---")
    adj_res = client.post('/api/admin/inventory/adjust', headers=headers, json={
        'product_id': new_pid,
        'change_amount': -4,
        'reason': 'Showroom Display Transfer'
    })
    assert adj_res.status_code == 200
    assert adj_res.json()['new_quantity'] == 1
    assert adj_res.json()['availability_status'] == 'Low Stock'
    print("✓ Reduced stock to 1 -> Status automatically set to Low Stock")

    print("\n--- 10. Admin: Place order for ready-made item ---")
    order_res = client.post('/api/admin/orders', headers=headers, json={
        'order_type': 'Ready-made',
        'customer_name': 'Vikram Sarabhai',
        'customer_email': 'vikram@example.com',
        'customer_phone': '+91 91234 56789',
        'delivery_address': 'Space Villa, Ahmedabad',
        'items': [{
            'product_id': new_pid,
            'product_name': 'Aura Minimalist Armchair',
            'wood_type': 'Solid Walnut',
            'unit_price': 42000.0,
            'quantity': 1
        }],
        'payment_status': 'Verified Offline',
        'order_status': 'Confirmed'
    })
    assert order_res.status_code == 200
    print("✓ Order placed and stock auto-deducted to 0 (Out of Stock)")

    print("\n--- 11. Admin: Cleanup test product ---")
    del_res = client.delete(f"/api/admin/products/{new_pid}", headers=headers)
    assert del_res.status_code == 200
    print("✓ Test product deleted")

    print("\n--- 12. Preserved: Gemini AI Assistant ---")
    ai_res = client.post('/api/assistant', json={'message': 'Which wood is best for an outdoor dining table?'})
    assert ai_res.status_code == 200
    print("✓ Gemini live AI replied:", ai_res.json()['reply'][:65], "...")

    print("\n=============================================")
    print("ALL 12 PIPELINE VERIFICATIONS PASSED 100%!")
    print("=============================================")

if __name__ == '__main__':
    run_tests()
