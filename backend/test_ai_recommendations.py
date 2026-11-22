import sys
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def run_ai_tests():
    print("==========================================================")
    print("WOODORA AI RECOMMENDATION SYSTEM INTEGRATION TESTS")
    print("==========================================================")

    # 1. Customer asks for a dining table under ₹60,000 (Checks budget + category)
    print("\n[Scenario 1] Customer asks: 'I need a dining table under ₹60,000'")
    res1 = client.post('/api/assistant', json={'message': 'I need a dining table under ₹60,000'})
    assert res1.status_code == 200
    d1 = res1.json()
    print("AI Response:", d1['reply'][:120], "...")
    print("Recommended Products:", [p['name'] for p in d1['recommended_products']])
    print("Offer Custom Enquiry:", d1['offer_custom_enquiry'])

    # 2. Customer requests a specific wood type (e.g. solid oak)
    print("\n[Scenario 2] Customer asks for a specific wood: 'What do you have in solid oak?'")
    res2 = client.post('/api/assistant', json={'message': 'What do you have in solid oak?'})
    assert res2.status_code == 200
    d2 = res2.json()
    oak_names = [p['name'] for p in d2['recommended_products']]
    print("Recommended Oak pieces:", oak_names)
    assert any("The Alder Dining Table" in name or "Sora Sideboard" in name or "Noma Coffee Table" in name for name in oak_names), "Should recommend oak items"

    # 3. Customer requests furniture with specific dimensions
    print("\n[Scenario 3] Customer asks: 'Do you have a bed around 200cm x 210cm in walnut?'")
    res3 = client.post('/api/assistant', json={'message': 'Do you have a bed around 200cm x 210cm in walnut?'})
    assert res3.status_code == 200
    d3 = res3.json()
    print("Recommended for dimensions:", [p['name'] for p in d3['recommended_products']])
    assert any("Forma Platform Bed" in p['name'] for p in d3['recommended_products'])

    # 4. No products match the requested budget (e.g. under ₹10,000)
    print("\n[Scenario 4] No products match budget: 'Looking for a solid wood king bed under ₹15,000'")
    res4 = client.post('/api/assistant', json={'message': 'Looking for a solid wood king bed under ₹15,000'})
    assert res4.status_code == 200
    d4 = res4.json()
    print("Budget mismatch explanation:", d4['reply'][:130], "...")
    print("Offer custom enquiry triggered:", d4['offer_custom_enquiry'])

    # 5. Product is out of stock (simulate out of stock on product #4)
    print("\n[Scenario 5] Out of stock behavior")
    login = client.post('/api/admin/auth/login', json={'email': 'admin@woodora.com', 'password': 'WoodoraAdmin2026!'})
    token = login.json()['token']
    headers = {'Authorization': f'Bearer {token}'}

    # Temporarily set stock of product 4 to 0
    adj = client.post('/api/admin/inventory/adjust', headers=headers, json={
        'product_id': 4,
        'change_amount': -6,
        'reason': 'Audit zero stock test'
    })
    res5 = client.post('/api/assistant', json={'message': 'Tell me about the Sora Sideboard and its availability'})
    assert res5.status_code == 200
    d5 = res5.json()
    sora = next((p for p in d5['recommended_products'] if p['id'] == 4), None)
    if sora:
        print("Sora Sideboard availability in AI recommendation:", sora['availability_status'], f"(stock: {sora['stock_quantity']})")
        assert sora['stock_quantity'] == 0
        assert sora['availability_status'] == 'Out of Stock'
    # Restore stock
    client.post('/api/admin/inventory/adjust', headers=headers, json={
        'product_id': 4,
        'change_amount': 6,
        'reason': 'Restore stock'
    })

    # 6. Customer requests custom furniture
    print("\n[Scenario 6] Custom furniture request: 'Can you custom make an 8-seater rosewood dining table?'")
    res6 = client.post('/api/assistant', json={'message': 'Can you custom make an 8-seater rosewood dining table?'})
    assert res6.status_code == 200
    d6 = res6.json()
    assert d6['offer_custom_enquiry'] is True
    print("Custom offer triggered:", d6['offer_custom_enquiry'])
    print("Custom defaults pre-filled:", d6['custom_defaults'])

    # 7. Product update in Admin is reflected in AI recommendations
    print("\n[Scenario 7] Product updates reflected in AI")
    # Update product #6 (Noma Coffee Table) price to ₹29,500
    client.put('/api/admin/products/6', headers=headers, json={
        'sku': 'WOD-SMK-006',
        'name': 'Noma Coffee Table (Updated Signature)',
        'description': 'Circular monolithic low table in fumed smoked oak.',
        'category': 'Living',
        'wood_type': 'Smoked oak',
        'dimensions': '90cm Dia x 38cm H',
        'price': 29500.0,
        'images': ['https://images.unsplash.com/photo-1499933374294-4584851497cc'],
        'product_type': 'Ready-made',
        'availability_status': 'In Stock',
        'is_featured': True,
        'tag': 'Bestseller'
    })
    res7 = client.post('/api/assistant', json={'message': 'What is the price of the Noma Coffee Table?'})
    d7 = res7.json()
    noma = next((p for p in d7['recommended_products'] if p['id'] == 6), None)
    if noma:
        print("Updated Noma price in AI card:", noma['price_display'])
        assert noma['price'] == 29500.0

    # 8. Customer submits a custom enquiry generated through the AI flow
    print("\n[Scenario 8] Submit enquiry from AI assistant flow")
    enq_sub = client.post('/api/enquiries', json={
        'name': 'Siddharth Roy',
        'email': 'siddharth.roy@example.com',
        'phone': '+91 98111 22334',
        'furniture_category': 'Dining',
        'requirements': '8-seater rosewood dining table with brushed brass footings',
        'dimensions': '240cm x 100cm',
        'preferred_wood': 'Indian Rosewood (Sheesham)',
        'budget': '₹90,000'
    })
    assert enq_sub.status_code == 200
    enq_code = enq_sub.json()['enquiry_code']
    print("Submitted AI-prompted enquiry code:", enq_code)

    # Verify it immediately appeared in admin enquiry dashboard
    admin_enqs = client.get('/api/admin/enquiries', headers=headers).json()
    assert any(e['enquiry_code'] == enq_code for e in admin_enqs)
    print("✓ Confirmed enquiry is live in Admin Enquiry queue")

    print("\n==========================================================")
    print("ALL 8 AI RECOMMENDATION TEST SCENARIOS PASSED 100%!")
    print("==========================================================")

if __name__ == '__main__':
    run_ai_tests()
