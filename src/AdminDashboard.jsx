import React, { useState, useEffect } from 'react';
import { apiUrl } from './apiConfig';
import {
  LayoutDashboard,
  Package,
  Layers,
  Users,
  MessageSquareQuote,
  ShoppingBag,
  Settings,
  LogOut,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Eye,
  Edit2,
  Trash2,
  X,
  FileText
} from 'lucide-react';

export default function AdminDashboard({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview, products, inventory, customers, enquiries, orders, settings
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Overview Data
  const [overview, setOverview] = useState(null);

  // Products Data
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [productCatFilter, setProductCatFilter] = useState('All');
  const [productModal, setProductModal] = useState({ open: false, mode: 'create', data: null });

  // Inventory Data
  const [inventory, setInventory] = useState([]);
  const [invFilter, setInvFilter] = useState('all');
  const [adjustModal, setAdjustModal] = useState({ open: false, product: null, amount: 0, reason: 'Restock' });

  // Customers Data
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerProfileModal, setCustomerProfileModal] = useState({ open: false, data: null });

  // Enquiries Data
  const [enquiries, setEnquiries] = useState([]);
  const [enqStatusFilter, setEnqStatusFilter] = useState('All');
  const [enquiryModal, setEnquiryModal] = useState({ open: false, data: null });
  const [convertModal, setConvertModal] = useState({ open: false, enquiry: null, agreedAmount: '', address: '', specs: '' });

  // Orders Data
  const [orders, setOrders] = useState([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [orderDetailModal, setOrderDetailModal] = useState({ open: false, data: null });
  const [newOrderModal, setNewOrderModal] = useState(false);

  // Settings State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Fetch functions
  const fetchOverview = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/dashboard/overview'), { headers: authHeaders });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setOverview(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async () => {
    try {
      const q = new URLSearchParams();
      if (productSearch) q.append('search', productSearch);
      if (productCatFilter !== 'All') q.append('category', productCatFilter);
      const res = await fetch(apiUrl(`/api/admin/products?${q.toString()}`), { headers: authHeaders });
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch(apiUrl(`/api/admin/inventory?status_filter=${invFilter}`), { headers: authHeaders });
      const data = await res.json();
      setInventory(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCustomers = async () => {
    try {
      const q = customerSearch ? `?search=${encodeURIComponent(customerSearch)}` : '';
      const res = await fetch(apiUrl(`/api/admin/customers${q}`), { headers: authHeaders });
      const data = await res.json();
      setCustomers(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEnquiries = async () => {
    try {
      const q = new URLSearchParams();
      if (enqStatusFilter !== 'All') q.append('status', enqStatusFilter);
      const res = await fetch(apiUrl(`/api/admin/enquiries?${q.toString()}`), { headers: authHeaders });
      const data = await res.json();
      setEnquiries(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchOrders = async () => {
    try {
      const q = new URLSearchParams();
      if (orderStatusFilter !== 'All') q.append('status', orderStatusFilter);
      const res = await fetch(apiUrl(`/api/admin/orders?${q.toString()}`), { headers: authHeaders });
      const data = await res.json();
      setOrders(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
    else if (activeTab === 'products') fetchProducts();
    else if (activeTab === 'inventory') fetchInventory();
    else if (activeTab === 'customers') fetchCustomers();
    else if (activeTab === 'enquiries') fetchEnquiries();
    else if (activeTab === 'orders') fetchOrders();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'products') fetchProducts();
  }, [productCatFilter]);

  useEffect(() => {
    if (activeTab === 'inventory') fetchInventory();
  }, [invFilter]);

  useEffect(() => {
    if (activeTab === 'enquiries') fetchEnquiries();
  }, [enqStatusFilter]);

  useEffect(() => {
    if (activeTab === 'orders') fetchOrders();
  }, [orderStatusFilter]);

  // Product actions
  const handleSaveProduct = async (formData) => {
    try {
      const isEdit = productModal.mode === 'edit';
      const url = isEdit ? apiUrl(`/api/admin/products/${productModal.data.id}`) : apiUrl('/api/admin/products');
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save product');

      setProductModal({ open: false, mode: 'create', data: null });
      showNotification(isEdit ? 'Product updated successfully.' : 'New product created.');
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProduct = async (p) => {
    if (!window.confirm(`Are you sure you want to delete "${p.name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(apiUrl(`/api/admin/products/${p.id}`), { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error('Failed to delete product');
      showNotification('Product deleted.');
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  // Inventory adjustment
  const handleAdjustStock = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/inventory/adjust'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          product_id: adjustModal.product.id,
          change_amount: parseInt(adjustModal.amount, 10),
          reason: adjustModal.reason,
          reference: 'Admin Manual Update'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Adjustment failed');

      setAdjustModal({ open: false, product: null, amount: 0, reason: 'Restock' });
      showNotification(`Stock adjusted to ${data.new_quantity}.`);
      fetchInventory();
    } catch (err) {
      alert(err.message);
    }
  };

  // Enquiry actions
  const handleUpdateEnquiryStatus = async (id, status, notes) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/enquiries/${id}/status`), {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ status, internal_notes: notes })
      });
      if (!res.ok) throw new Error('Failed to update status');
      showNotification('Enquiry updated.');
      fetchEnquiries();
      if (enquiryModal.open) {
        setEnquiryModal({
          open: true,
          data: { ...enquiryModal.data, enquiry: { ...enquiryModal.data.enquiry, status, internal_notes: notes } }
        });
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConvertEnquiry = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/enquiries/convert-to-order'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          enquiry_id: convertModal.enquiry.id,
          agreed_amount: parseFloat(convertModal.agreedAmount),
          delivery_address: convertModal.address,
          custom_specifications: convertModal.specs
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Conversion failed');

      setConvertModal({ open: false, enquiry: null, agreedAmount: '', address: '', specs: '' });
      showNotification(`Order ${data.order_code} initiated from custom enquiry.`);
      fetchEnquiries();
      setActiveTab('orders');
    } catch (err) {
      alert(err.message);
    }
  };

  // Order actions
  const handleUpdateOrderStatus = async (orderId, newStatus, prodStage, payStatus, note) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/orders/${orderId}/status`), {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          order_status: newStatus,
          production_stage: prodStage,
          payment_status: payStatus,
          note: note || `Status updated to ${newStatus}`
        })
      });
      if (!res.ok) throw new Error('Failed to update order');
      showNotification(`Order status updated to ${newStatus}.`);
      fetchOrders();
      if (orderDetailModal.open) {
        // refresh modal
        const detailRes = await fetch(apiUrl(`/api/admin/orders/${orderId}`), { headers: authHeaders });
        const detailData = await detailRes.json();
        setOrderDetailModal({ open: true, data: detailData });
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/api/admin/settings/password'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Password change failed');
      showNotification('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="admin-layout">
      {/* SIDEBAR */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="brand-mark">W.</span>
          <div className="admin-brand-info">
            <h4>WOODORA</h4>
            <span>PORTAL & MANAGEMENT</span>
          </div>
        </div>

        <nav className="admin-nav">
          <button
            className={`admin-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={16} />
            <span>Overview</span>
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            <Package size={16} />
            <span>Products</span>
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            <Layers size={16} />
            <span>Inventory</span>
            {overview?.metrics?.low_stock_products > 0 && (
              <span className="admin-nav-badge">{overview.metrics.low_stock_products}</span>
            )}
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            <Users size={16} />
            <span>Customers</span>
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'enquiries' ? 'active' : ''}`}
            onClick={() => setActiveTab('enquiries')}
          >
            <MessageSquareQuote size={16} />
            <span>Enquiries</span>
            {overview?.metrics?.new_enquiries > 0 && (
              <span className="admin-nav-badge">{overview.metrics.new_enquiries}</span>
            )}
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <ShoppingBag size={16} />
            <span>Orders</span>
            {overview?.metrics?.pending_orders > 0 && (
              <span className="admin-nav-badge">{overview.metrics.pending_orders}</span>
            )}
          </button>

          <button
            className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-pill">
            <span className="admin-user-name">{user?.name || 'Administrator'}</span>
            <span className="admin-user-role">{user?.role || 'Admin'}</span>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            style={{ background: 'none', border: 0, color: '#a39d91', cursor: 'pointer' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="admin-main">
        <header className="admin-topbar">
          <h2>
            {activeTab === 'overview' && 'Executive Dashboard'}
            {activeTab === 'products' && 'Product Catalogue Management'}
            {activeTab === 'inventory' && 'Inventory & Stock Control'}
            {activeTab === 'customers' && 'Customer Directory'}
            {activeTab === 'enquiries' && 'Custom Furniture Enquiries'}
            {activeTab === 'orders' && 'Order & Production Fulfillment'}
            {activeTab === 'settings' && 'Platform Settings'}
          </h2>

          <div className="admin-topbar-actions">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ fontSize: 11 }}
            >
              <ExternalLink size={13} /> View Live Storefront
            </a>
          </div>
        </header>

        {successMsg && (
          <div style={{ background: '#216a3e', color: '#fff', padding: '10px 36px', fontSize: 12 }}>
            <CheckCircle size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />
            {successMsg}
          </div>
        )}

        <div className="admin-content">
          {/* ==================================================== */}
          {/* TAB 1: OVERVIEW */}
          {/* ==================================================== */}
          {activeTab === 'overview' && (
            <div>
              {/* Metrics Grid */}
              <div className="admin-metrics-grid">
                <div className="admin-metric-card">
                  <div>
                    <div className="label">Total Products</div>
                    <div className="value">{overview?.metrics?.total_products ?? 0}</div>
                  </div>
                  <div className="admin-metric-icon"><Package size={20} /></div>
                </div>

                <div className="admin-metric-card">
                  <div>
                    <div className="label">Total Orders</div>
                    <div className="value">{overview?.metrics?.total_orders ?? 0}</div>
                  </div>
                  <div className="admin-metric-icon"><ShoppingBag size={20} /></div>
                </div>

                <div className="admin-metric-card">
                  <div>
                    <div className="label">Pending Orders</div>
                    <div className="value" style={{ color: overview?.metrics?.pending_orders > 0 ? '#966112' : 'inherit' }}>
                      {overview?.metrics?.pending_orders ?? 0}
                    </div>
                  </div>
                  <div className="admin-metric-icon"><Clock size={20} /></div>
                </div>

                <div className="admin-metric-card">
                  <div>
                    <div className="label">Total Customers</div>
                    <div className="value">{overview?.metrics?.total_customers ?? 0}</div>
                  </div>
                  <div className="admin-metric-icon"><Users size={20} /></div>
                </div>

                <div className="admin-metric-card">
                  <div>
                    <div className="label">New Enquiries</div>
                    <div className="value" style={{ color: overview?.metrics?.new_enquiries > 0 ? '#a66c43' : 'inherit' }}>
                      {overview?.metrics?.new_enquiries ?? 0}
                    </div>
                  </div>
                  <div className="admin-metric-icon"><MessageSquareQuote size={20} /></div>
                </div>

                <div className="admin-metric-card">
                  <div>
                    <div className="label">Low Stock Alerts</div>
                    <div className="value" style={{ color: overview?.metrics?.low_stock_products > 0 ? '#a13524' : 'inherit' }}>
                      {overview?.metrics?.low_stock_products ?? 0}
                    </div>
                  </div>
                  <div className="admin-metric-icon"><AlertTriangle size={20} /></div>
                </div>

                <div className="admin-metric-card">
                  <div>
                    <div className="label">Verified Revenue</div>
                    <div className="value">
                      ₹{Math.round(overview?.metrics?.total_revenue || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="admin-metric-icon"><TrendingUp size={20} /></div>
                </div>
              </div>

              {/* Status Breakdown & Low Stock */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
                {/* Recent Orders */}
                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <h3>Recent Client Orders</h3>
                    <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setActiveTab('orders')}>
                      View All Orders <ChevronRight size={13} />
                    </button>
                  </div>
                  <div className="admin-table-wrapper">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Order Code</th>
                          <th>Customer</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview?.recent_orders?.map((o) => (
                          <tr key={o.id}>
                            <td><strong>{o.order_code}</strong></td>
                            <td>{o.customer_name}</td>
                            <td><span className="status-pill status-optimal">{o.order_type}</span></td>
                            <td>₹{Math.round(o.total_amount).toLocaleString()}</td>
                            <td><span className={`status-pill status-${o.order_status.toLowerCase().replace(/\s+/g, '-')}`}>{o.order_status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Low Stock Alerts */}
                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <h3>Low-Stock Finished Goods</h3>
                    <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setActiveTab('inventory')}>
                      Manage Stock
                    </button>
                  </div>
                  <div className="admin-table-wrapper">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Wood</th>
                          <th>In Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview?.low_stock_items?.length === 0 ? (
                          <tr><td colSpan="3" style={{ textAlign: 'center', color: '#777', padding: 20 }}>All stock levels are optimal.</td></tr>
                        ) : (
                          overview?.low_stock_items?.map((item) => (
                            <tr key={item.id}>
                              <td><strong>{item.name}</strong><br/><small style={{ color: '#777' }}>{item.sku}</small></td>
                              <td>{item.wood_type}</td>
                              <td>
                                <span className={`status-pill ${item.stock_quantity === 0 ? 'status-out-of-stock' : 'status-low-stock'}`}>
                                  {item.stock_quantity} left (min: {item.low_stock_threshold})
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Recent Enquiries */}
              <div className="admin-panel" style={{ marginTop: 20 }}>
                <div className="admin-panel-head">
                  <h3>Recent Bespoke Enquiries</h3>
                  <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setActiveTab('enquiries')}>
                    Manage All Enquiries
                  </button>
                </div>
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Enquiry Code</th>
                        <th>Client</th>
                        <th>Category</th>
                        <th>Requirements</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview?.recent_enquiries?.map((e) => (
                        <tr key={e.id}>
                          <td><strong>{e.enquiry_code}</strong></td>
                          <td>{e.customer_name}<br/><small style={{ color: '#777' }}>{e.email}</small></td>
                          <td>{e.furniture_category}</td>
                          <td style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {e.requirements}
                          </td>
                          <td><span className={`status-pill status-${e.status.toLowerCase().replace(/\s+/g, '-')}`}>{e.status}</span></td>
                          <td>{new Date(e.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 2: PRODUCTS */}
          {/* ==================================================== */}
          {activeTab === 'products' && (
            <div>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <div className="admin-panel-actions">
                    <input
                      type="text"
                      className="admin-input admin-search-input"
                      placeholder="Search by name, SKU or wood..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchProducts()}
                    />
                    <select
                      className="admin-select"
                      value={productCatFilter}
                      onChange={(e) => setProductCatFilter(e.target.value)}
                    >
                      <option value="All">All Categories</option>
                      <option value="Dining">Dining</option>
                      <option value="Seating">Seating</option>
                      <option value="Bedroom">Bedroom</option>
                      <option value="Storage">Storage</option>
                      <option value="Living">Living</option>
                    </select>
                    <button className="btn-secondary" onClick={fetchProducts}>
                      <Search size={13} /> Filter
                    </button>
                  </div>

                  <button
                    className="btn-primary"
                    onClick={() => setProductModal({ open: true, mode: 'create', data: null })}
                  >
                    <Plus size={15} /> Add New Furniture
                  </button>
                </div>

                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Photo</th>
                        <th>SKU & Name</th>
                        <th>Category</th>
                        <th>Wood & Dimensions</th>
                        <th>Price</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Stock</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <img
                              src={p.images?.[0] || 'https://via.placeholder.com/60'}
                              alt=""
                              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 2 }}
                            />
                          </td>
                          <td>
                            <strong>{p.name}</strong>
                            <div style={{ fontSize: 10, color: '#777' }}>{p.sku} {p.is_featured ? '· ★ Featured' : ''}</div>
                          </td>
                          <td>{p.category}</td>
                          <td>
                            <div>{p.wood_type}</div>
                            <small style={{ color: '#777' }}>{p.dimensions || '—'}</small>
                          </td>
                          <td><strong>₹{Math.round(p.price).toLocaleString()}</strong></td>
                          <td>
                            <span className="status-pill status-optimal">{p.product_type}</span>
                          </td>
                          <td>
                            <span className={`status-pill status-${p.availability_status.toLowerCase().replace(/\s+/g, '-')}`}>
                              {p.availability_status}
                            </span>
                          </td>
                          <td>
                            {p.product_type === 'Ready-made' ? (
                              <span>{p.stock_quantity} units</span>
                            ) : (
                              <span style={{ color: '#777' }}>Bespoke</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn-secondary"
                                style={{ padding: '5px 8px' }}
                                onClick={() => setProductModal({ open: true, mode: 'edit', data: p })}
                                title="Edit Product"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                className="btn-danger"
                                style={{ padding: '5px 8px' }}
                                onClick={() => handleDeleteProduct(p)}
                                title="Delete Product"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 3: INVENTORY */}
          {/* ==================================================== */}
          {activeTab === 'inventory' && (
            <div>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <div className="admin-panel-actions">
                    <select className="admin-select" value={invFilter} onChange={(e) => setInvFilter(e.target.value)}>
                      <option value="all">All Finished Goods & Bespoke</option>
                      <option value="low">Low Stock Alerts Only</option>
                      <option value="out">Out of Stock</option>
                      <option value="mto">Made to Order</option>
                    </select>
                    <button className="btn-secondary" onClick={fetchInventory}>
                      <RefreshCw size={13} /> Refresh
                    </button>
                  </div>

                  <div style={{ fontSize: 12, color: '#777' }}>
                    * Ready-made items maintain stock levels; Made-to-order items are manufactured per approved client order.
                  </div>
                </div>

                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Product Name</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Current Quantity</th>
                        <th>Low Stock Threshold</th>
                        <th>Inventory Health</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.sku}</strong></td>
                          <td>{item.name}</td>
                          <td>{item.category}</td>
                          <td>{item.product_type}</td>
                          <td>
                            {item.product_type === 'Ready-made' ? (
                              <strong style={{ fontSize: 14 }}>{item.stock_quantity}</strong>
                            ) : (
                              <span style={{ color: '#777' }}>N/A (Made-to-order)</span>
                            )}
                          </td>
                          <td>{item.product_type === 'Ready-made' ? item.low_stock_threshold : '—'}</td>
                          <td>
                            <span className={`status-pill status-${item.stock_state.toLowerCase().replace(/\s+/g, '-')}`}>
                              {item.stock_state}
                            </span>
                          </td>
                          <td>
                            {item.product_type === 'Ready-made' ? (
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 11 }}
                                onClick={() => setAdjustModal({ open: true, product: item, amount: 0, reason: 'Restock' })}
                              >
                                Adjust Stock
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: '#777' }}>Track in Custom Orders</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 4: CUSTOMERS */}
          {/* ==================================================== */}
          {activeTab === 'customers' && (
            <div>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <div className="admin-panel-actions">
                    <input
                      type="text"
                      className="admin-input admin-search-input"
                      placeholder="Search customers by name, email or city..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchCustomers()}
                    />
                    <button className="btn-secondary" onClick={fetchCustomers}>
                      <Search size={13} /> Search
                    </button>
                  </div>
                </div>

                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Customer ID</th>
                        <th>Name</th>
                        <th>Contact Email</th>
                        <th>Phone</th>
                        <th>City / Location</th>
                        <th>Enquiries</th>
                        <th>Orders</th>
                        <th>Total Spent</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr key={c.id}>
                          <td>#{c.id}</td>
                          <td><strong>{c.name}</strong></td>
                          <td>{c.email}</td>
                          <td>{c.phone || '—'}</td>
                          <td>{c.city || '—'}</td>
                          <td>{c.enquiry_count}</td>
                          <td>{c.order_count}</td>
                          <td><strong>₹{Math.round(c.total_spent).toLocaleString()}</strong></td>
                          <td>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: '5px 9px' }}
                              onClick={async () => {
                                const res = await fetch(`/api/admin/customers/${c.id}`, { headers: authHeaders });
                                const data = await res.json();
                                setCustomerProfileModal({ open: true, data });
                              }}
                            >
                              <Eye size={12} /> View Profile
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 5: ENQUIRIES */}
          {/* ==================================================== */}
          {activeTab === 'enquiries' && (
            <div>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <div className="admin-panel-actions">
                    <select
                      className="admin-select"
                      value={enqStatusFilter}
                      onChange={(e) => setEnqStatusFilter(e.target.value)}
                    >
                      <option value="All">All Statuses</option>
                      <option value="New">New</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Quotation Sent">Quotation Sent</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Closed">Closed</option>
                    </select>
                    <button className="btn-secondary" onClick={fetchEnquiries}>
                      <RefreshCw size={13} /> Refresh
                    </button>
                  </div>
                </div>

                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Enquiry Code</th>
                        <th>Client Details</th>
                        <th>Category</th>
                        <th>Wood & Specs</th>
                        <th>Budget</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enquiries.map((e) => (
                        <tr key={e.id}>
                          <td><strong>{e.enquiry_code}</strong></td>
                          <td>
                            <strong>{e.customer_name}</strong>
                            <div style={{ fontSize: 10, color: '#777' }}>{e.email}</div>
                            {e.phone && <div style={{ fontSize: 10, color: '#777' }}>{e.phone}</div>}
                          </td>
                          <td>{e.furniture_category}</td>
                          <td>
                            <div>{e.preferred_wood || 'Custom Choice'}</div>
                            <small style={{ color: '#777' }}>{e.dimensions || 'Custom sizing'}</small>
                          </td>
                          <td>{e.budget || 'Open / Discussion'}</td>
                          <td>
                            <span className={`status-pill status-${e.status.toLowerCase().replace(/\s+/g, '-')}`}>
                              {e.status}
                            </span>
                          </td>
                          <td>{new Date(e.created_at).toLocaleDateString()}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 11, padding: '5px 8px' }}
                                onClick={async () => {
                                  const res = await fetch(`/api/admin/enquiries/${e.id}`, { headers: authHeaders });
                                  const data = await res.json();
                                  setEnquiryModal({ open: true, data });
                                }}
                              >
                                View / Edit
                              </button>
                              {e.status === 'Approved' && (
                                <button
                                  className="btn-primary"
                                  style={{ fontSize: 11, padding: '5px 8px' }}
                                  onClick={() => setConvertModal({
                                    open: true,
                                    enquiry: e,
                                    agreedAmount: '',
                                    address: '',
                                    specs: `${e.furniture_category} in ${e.preferred_wood || 'solid wood'}. ${e.requirements}`
                                  })}
                                >
                                  Convert to Order
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 6: ORDERS */}
          {/* ==================================================== */}
          {activeTab === 'orders' && (
            <div>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <div className="admin-panel-actions">
                    <select
                      className="admin-select"
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                    >
                      <option value="All">All Order Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="In Production">In Production</option>
                      <option value="Ready for Dispatch">Ready for Dispatch</option>
                      <option value="Shipped">Shipped</option>
                      <option value="Delivered">Delivered</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                    <button className="btn-secondary" onClick={fetchOrders}>
                      <RefreshCw size={13} /> Refresh
                    </button>
                  </div>

                  <button className="btn-primary" onClick={() => setNewOrderModal(true)}>
                    <Plus size={15} /> Book Client Order
                  </button>
                </div>

                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Order Type</th>
                        <th>Customer</th>
                        <th>Total Amount</th>
                        <th>Payment Status</th>
                        <th>Production / Delivery</th>
                        <th>Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td><strong>{o.order_code}</strong></td>
                          <td>
                            <span className="status-pill status-optimal">{o.order_type}</span>
                          </td>
                          <td>
                            <strong>{o.customer_name}</strong>
                            <div style={{ fontSize: 10, color: '#777' }}>{o.customer_email}</div>
                          </td>
                          <td><strong>₹{Math.round(o.total_amount).toLocaleString()}</strong></td>
                          <td>
                            <span className={`status-pill status-${o.payment_status.toLowerCase().replace(/\s+/g, '-')}`}>
                              {o.payment_status}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill status-${o.order_status.toLowerCase().replace(/\s+/g, '-')}`}>
                              {o.order_status}
                            </span>
                            {o.production_stage && (
                              <div style={{ fontSize: 10, color: '#a66c43', marginTop: 3 }}>
                                ⚙ {o.production_stage}
                              </div>
                            )}
                          </td>
                          <td>{new Date(o.created_at).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: '5px 9px' }}
                              onClick={async () => {
                                const res = await fetch(`/api/admin/orders/${o.id}`, { headers: authHeaders });
                                const data = await res.json();
                                setOrderDetailModal({ open: true, data });
                              }}
                            >
                              Manage Order
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 7: SETTINGS */}
          {/* ==================================================== */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 600 }}>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <h3>Admin Account & Security</h3>
                </div>
                <div style={{ padding: 26 }}>
                  <p style={{ fontSize: 12, color: '#777', margin: '0 0 20px' }}>
                    You are logged in as <strong>{user?.email}</strong>. Update your password below:
                  </p>
                  <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="form-group">
                      <label>Current Password</label>
                      <input
                        type="password"
                        required
                        className="admin-input"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>New Password (min 8 characters)</label>
                      <input
                        type="password"
                        required
                        className="admin-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>
                      Update Admin Password
                    </button>
                  </form>
                </div>
              </div>

              <div className="admin-panel">
                <div className="admin-panel-head">
                  <h3>Environment & System Status</h3>
                </div>
                <div style={{ padding: 26, fontSize: 12, lineHeight: 1.8 }}>
                  <div><strong>Database:</strong> SQLite3 (ACID compliant, relational with foreign keys)</div>
                  <div><strong>AI Engine:</strong> Gemini 3.5 Flash Lite Live API Integration</div>
                  <div><strong>API Backend:</strong> FastAPI (Python 3.13) with Token Auth</div>
                  <div><strong>Storefront:</strong> React 19 + Vite</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ==================================================== */}
      {/* MODAL: PRODUCT CREATE / EDIT */}
      {/* ==================================================== */}
      {productModal.open && (
        <ProductFormModal
          mode={productModal.mode}
          initialData={productModal.data}
          onClose={() => setProductModal({ open: false, mode: 'create', data: null })}
          onSave={handleSaveProduct}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL: INVENTORY ADJUSTMENT */}
      {/* ==================================================== */}
      {adjustModal.open && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: 440 }}>
            <div className="admin-modal-head">
              <h3>Adjust Stock: {adjustModal.product?.name}</h3>
              <button style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setAdjustModal({ open: false, product: null, amount: 0, reason: 'Restock' })}><X size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: 12, margin: 0, color: '#777' }}>
                Current finished-goods stock: <strong>{adjustModal.product?.stock_quantity} units</strong>.
              </p>
              <div className="form-group">
                <label>Change Quantity (+ to add, - to reduce)</label>
                <input
                  type="number"
                  className="admin-input"
                  value={adjustModal.amount}
                  onChange={(e) => setAdjustModal({ ...adjustModal, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Reason for Adjustment</label>
                <select
                  className="admin-select"
                  value={adjustModal.reason}
                  onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                >
                  <option value="Restock">Restock from Workshop</option>
                  <option value="Showroom Display">Showroom Display Transfer</option>
                  <option value="Inventory Audit">Inventory Audit Adjustment</option>
                  <option value="Damaged in Transit">Damaged in Transit</option>
                </select>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setAdjustModal({ open: false, product: null, amount: 0, reason: 'Restock' })}>Cancel</button>
              <button className="btn-primary" onClick={handleAdjustStock}>Commit Adjustment</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: CUSTOMER PROFILE */}
      {/* ==================================================== */}
      {customerProfileModal.open && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: 650 }}>
            <div className="admin-modal-head">
              <h3>Customer Profile: {customerProfileModal.data?.customer?.name}</h3>
              <button style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setCustomerProfileModal({ open: false, data: null })}><X size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <div style={{ background: '#faf8f4', padding: 16, border: '1px solid #e6dfd3', fontSize: 12 }}>
                <div><strong>Email:</strong> {customerProfileModal.data?.customer?.email}</div>
                <div><strong>Phone:</strong> {customerProfileModal.data?.customer?.phone || 'Not provided'}</div>
                <div><strong>Location:</strong> {customerProfileModal.data?.customer?.city || ''} {customerProfileModal.data?.customer?.address || ''}</div>
                <div><strong>Registered:</strong> {new Date(customerProfileModal.data?.customer?.created_at).toLocaleDateString()}</div>
              </div>

              <h4 style={{ margin: '14px 0 6px', fontFamily: 'Playfair Display' }}>Orders Placed</h4>
              {customerProfileModal.data?.orders?.length === 0 ? (
                <p style={{ fontSize: 12, color: '#777' }}>No orders placed yet.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr><th>Code</th><th>Type</th><th>Amount</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {customerProfileModal.data?.orders?.map((o) => (
                      <tr key={o.id}>
                        <td><strong>{o.order_code}</strong></td>
                        <td>{o.order_type}</td>
                        <td>₹{Math.round(o.total_amount).toLocaleString()}</td>
                        <td><span className="status-pill status-optimal">{o.order_status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 style={{ margin: '14px 0 6px', fontFamily: 'Playfair Display' }}>Bespoke Enquiries</h4>
              {customerProfileModal.data?.enquiries?.length === 0 ? (
                <p style={{ fontSize: 12, color: '#777' }}>No enquiries submitted.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr><th>Code</th><th>Category</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {customerProfileModal.data?.enquiries?.map((e) => (
                      <tr key={e.id}>
                        <td><strong>{e.enquiry_code}</strong></td>
                        <td>{e.furniture_category}</td>
                        <td><span className="status-pill status-contacted">{e.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setCustomerProfileModal({ open: false, data: null })}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ENQUIRY DETAIL & STATUS UPDATE */}
      {/* ==================================================== */}
      {enquiryModal.open && (
        <EnquiryDetailModal
          data={enquiryModal.data}
          onClose={() => setEnquiryModal({ open: false, data: null })}
          onUpdateStatus={handleUpdateEnquiryStatus}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL: CONVERT ENQUIRY TO ORDER */}
      {/* ==================================================== */}
      {convertModal.open && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: 520 }}>
            <div className="admin-modal-head">
              <h3>Convert Enquiry to Production Order</h3>
              <button style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setConvertModal({ open: false, enquiry: null, agreedAmount: '', address: '', specs: '' })}><X size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <div style={{ background: '#f5f0e8', padding: 12, fontSize: 12, border: '1px solid #dfd7c9' }}>
                Converting <strong>{convertModal.enquiry?.enquiry_code}</strong> for client <strong>{convertModal.enquiry?.customer_name}</strong>.
              </div>
              <div className="form-group">
                <label>Agreed Project Amount (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 150000"
                  className="admin-input"
                  value={convertModal.agreedAmount}
                  onChange={(e) => setConvertModal({ ...convertModal, agreedAmount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Delivery Address</label>
                <textarea
                  rows="2"
                  required
                  className="admin-textarea"
                  placeholder="Enter full shipping/delivery address..."
                  value={convertModal.address}
                  onChange={(e) => setConvertModal({ ...convertModal, address: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Workshop Specifications & Production Notes</label>
                <textarea
                  rows="3"
                  className="admin-textarea"
                  value={convertModal.specs}
                  onChange={(e) => setConvertModal({ ...convertModal, specs: e.target.value })}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setConvertModal({ open: false, enquiry: null, agreedAmount: '', address: '', specs: '' })}>Cancel</button>
              <button className="btn-primary" onClick={handleConvertEnquiry}>Generate Custom Order</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ORDER DETAIL & STATUS HISTORY */}
      {/* ==================================================== */}
      {orderDetailModal.open && (
        <OrderDetailModal
          data={orderDetailModal.data}
          onClose={() => setOrderDetailModal({ open: false, data: null })}
          onUpdateStatus={handleUpdateOrderStatus}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL: CREATE ORDER */}
      {/* ==================================================== */}
      {newOrderModal && (
        <NewOrderModal
          products={products}
          onClose={() => setNewOrderModal(false)}
          onCreated={() => {
            setNewOrderModal(false);
            showNotification('Order recorded.');
            fetchOrders();
          }}
          authHeaders={authHeaders}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// SUB-COMPONENT: PRODUCT FORM MODAL
// ----------------------------------------------------
function ProductFormModal({ mode, initialData, onClose, onSave }) {
  const [sku, setSku] = useState(initialData?.sku || '');
  const [name, setName] = useState(initialData?.name || '');
  const [category, setCategory] = useState(initialData?.category || 'Dining');
  const [woodType, setWoodType] = useState(initialData?.wood_type || 'Solid oak');
  const [dimensions, setDimensions] = useState(initialData?.dimensions || '');
  const [price, setPrice] = useState(initialData?.price || '');
  const [productType, setProductType] = useState(initialData?.product_type || 'Ready-made');
  const [availStatus, setAvailStatus] = useState(initialData?.availability_status || 'In Stock');
  const [isFeatured, setIsFeatured] = useState(initialData?.is_featured || false);
  const [tag, setTag] = useState(initialData?.tag || '');
  const [imageUrl, setImageUrl] = useState(initialData?.images?.[0] || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [initialStock, setInitialStock] = useState(initialData?.stock_quantity ?? 5);
  const [threshold, setThreshold] = useState(initialData?.low_stock_threshold ?? 3);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      sku,
      name,
      category,
      wood_type: woodType,
      dimensions,
      price: parseFloat(price),
      images: imageUrl ? [imageUrl] : ['https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85'],
      product_type: productType,
      availability_status: availStatus,
      is_featured: isFeatured,
      tag,
      description,
      initial_stock: parseInt(initialStock, 10),
      low_stock_threshold: parseInt(threshold, 10)
    });
  };

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 640 }}>
        <div className="admin-modal-head">
          <h3>{mode === 'edit' ? `Edit Furniture: ${initialData.name}` : 'Add New Furniture to Catalogue'}</h3>
          <button style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="admin-modal-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>SKU (Identifier)</label>
                <input required className="admin-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. WOD-OAK-007" />
              </div>
              <div className="form-group">
                <label>Product Name</label>
                <input required className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kyoto Credenza" />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Category</label>
                <select className="admin-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="Dining">Dining</option>
                  <option value="Seating">Seating</option>
                  <option value="Bedroom">Bedroom</option>
                  <option value="Storage">Storage</option>
                  <option value="Living">Living</option>
                </select>
              </div>
              <div className="form-group">
                <label>Wood Type / Material</label>
                <input required className="admin-input" value={woodType} onChange={(e) => setWoodType(e.target.value)} placeholder="e.g. Solid French Oak" />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Dimensions</label>
                <input className="admin-input" value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="e.g. 200cm L x 90cm W x 76cm H" />
              </div>
              <div className="form-group">
                <label>Selling Price (₹)</label>
                <input required type="number" step="100" className="admin-input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 75000" />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Product Type</label>
                <select className="admin-select" value={productType} onChange={(e) => setProductType(e.target.value)}>
                  <option value="Ready-made">Ready-made (Finished Goods)</option>
                  <option value="Made-to-order">Made-to-order (Bespoke)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Availability Status</label>
                <select className="admin-select" value={availStatus} onChange={(e) => setAvailStatus(e.target.value)}>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Made to Order">Made to Order</option>
                </select>
              </div>
            </div>

            {productType === 'Ready-made' && (
              <div className="form-grid-2">
                <div className="form-group">
                  <label>{mode === 'edit' ? 'Stock Quantity' : 'Initial Stock Quantity'}</label>
                  <input type="number" className="admin-input" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Low Stock Alert Threshold</label>
                  <input type="number" className="admin-input" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Image URL</label>
              <input className="admin-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://images.unsplash.com/..." />
            </div>

            <div className="form-group">
              <label>Product Description & Craftsmanship Details</label>
              <textarea rows="3" className="admin-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                Feature on Customer Homepage
              </label>
              <div style={{ flex: 1 }}>
                <input className="admin-input" placeholder="Badge tag (e.g. Bestseller, Signature, New)" value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
          </div>
          <div className="admin-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save to Catalogue</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SUB-COMPONENT: ENQUIRY DETAIL MODAL
// ----------------------------------------------------
function EnquiryDetailModal({ data, onClose, onUpdateStatus }) {
  const enq = data?.enquiry;
  const linkedOrder = data?.linked_order;
  const [status, setStatus] = useState(enq?.status || 'New');
  const [notes, setNotes] = useState(enq?.internal_notes || '');

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 600 }}>
        <div className="admin-modal-head">
          <h3>Enquiry: {enq?.enquiry_code}</h3>
          <button style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="admin-modal-body">
          <div style={{ background: '#faf8f4', padding: 18, border: '1px solid #e6dfd3', fontSize: 12, lineHeight: 1.8 }}>
            <div><strong>Client Name:</strong> {enq?.customer_name}</div>
            <div><strong>Email:</strong> {enq?.email}</div>
            <div><strong>Phone:</strong> {enq?.phone || 'Not provided'}</div>
            <div><strong>Category:</strong> {enq?.furniture_category}</div>
            <div><strong>Preferred Wood:</strong> {enq?.preferred_wood || 'Open'}</div>
            <div><strong>Dimensions / Space:</strong> {enq?.dimensions || 'Custom'}</div>
            <div><strong>Client Budget:</strong> {enq?.budget || 'Not specified'}</div>
            <div><strong>Submitted On:</strong> {new Date(enq?.created_at).toLocaleString()}</div>
            <div style={{ marginTop: 8 }}>
              <strong>Client Requirements:</strong>
              <div style={{ background: '#fff', padding: 10, border: '1px solid #ddd', marginTop: 4 }}>
                {enq?.requirements}
              </div>
            </div>
          </div>

          {linkedOrder && (
            <div style={{ background: '#eaf3ed', border: '1px solid #c2e2cc', padding: 12, fontSize: 12 }}>
              ✓ Converted to Order: <strong>{linkedOrder.order_code}</strong> (Status: {linkedOrder.order_status})
            </div>
          )}

          <div className="form-group">
            <label>Update Status</label>
            <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Quotation Sent">Quotation Sent</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="form-group">
            <label>Internal Workshop / Sales Notes</label>
            <textarea
              rows="3"
              className="admin-textarea"
              placeholder="Record phone notes, quote details, architect drawings..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="admin-modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={() => onUpdateStatus(enq.id, status, notes)}>Save Status & Notes</button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SUB-COMPONENT: ORDER DETAIL MODAL
// ----------------------------------------------------
function OrderDetailModal({ data, onClose, onUpdateStatus }) {
  const o = data?.order;
  const items = data?.items || [];
  const history = data?.history || [];

  const [orderStatus, setOrderStatus] = useState(o?.order_status || 'Pending');
  const [payStatus, setPayStatus] = useState(o?.payment_status || 'Pending');
  const [prodStage, setProdStage] = useState(o?.production_stage || '');
  const [note, setNote] = useState('');

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 700 }}>
        <div className="admin-modal-head">
          <h3>Order: {o?.order_code} ({o?.order_type})</h3>
          <button style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="admin-modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12, background: '#faf8f4', padding: 16, border: '1px solid #e6dfd3' }}>
            <div>
              <div><strong>Client:</strong> {o?.customer_name}</div>
              <div><strong>Email:</strong> {o?.customer_email}</div>
              <div><strong>Phone:</strong> {o?.customer_phone || '—'}</div>
              <div><strong>Address:</strong> {o?.delivery_address}</div>
            </div>
            <div>
              <div><strong>Order Total:</strong> ₹{Math.round(o?.total_amount || 0).toLocaleString()}</div>
              <div><strong>Payment Status:</strong> <span className="status-pill status-paid">{o?.payment_status}</span></div>
              <div><strong>Order Status:</strong> <span className="status-pill status-optimal">{o?.order_status}</span></div>
              {o?.production_stage && <div><strong>Production Stage:</strong> {o.production_stage}</div>}
            </div>
          </div>

          <h4 style={{ margin: '14px 0 6px', fontFamily: 'Playfair Display' }}>Ordered Items</h4>
          <table className="admin-table">
            <thead>
              <tr><th>Item</th><th>Wood</th><th>Unit Price</th><th>Qty</th><th>Total</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td><strong>{it.product_name}</strong></td>
                  <td>{it.wood_type}</td>
                  <td>₹{Math.round(it.unit_price).toLocaleString()}</td>
                  <td>{it.quantity}</td>
                  <td>₹{Math.round(it.total_price).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ background: '#fcfbf8', border: '1px solid #e6dfd3', padding: 16, marginTop: 10 }}>
            <h4 style={{ margin: '0 0 12px', fontFamily: 'Playfair Display' }}>Update Order & Production Status</h4>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Order Fulfillment Status</label>
                <select className="admin-select" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="In Production">In Production</option>
                  <option value="Ready for Dispatch">Ready for Dispatch</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="form-group">
                <label>Payment Status</label>
                <select className="admin-select" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
                  <option value="Pending">Pending Payment</option>
                  <option value="Verified Offline">Verified Offline (Wire/NEFT/Cheque)</option>
                  <option value="Paid">Paid in Full</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>
            </div>

            {o?.order_type === 'Custom' && (
              <div className="form-group" style={{ marginTop: 10 }}>
                <label>Workshop Production Stage</label>
                <select className="admin-select" value={prodStage} onChange={(e) => setProdStage(e.target.value)}>
                  <option value="Materials Sourcing">Materials Sourcing & Lumber Selection</option>
                  <option value="Woodworking & Joinery">Woodworking & Joinery</option>
                  <option value="Hand Finishing">Hand Finishing & Oil Treatment</option>
                  <option value="Inspection">Quality Inspection</option>
                  <option value="Ready">Ready for White Glove Packaging</option>
                </select>
              </div>
            )}

            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Status History Note</label>
              <input
                className="admin-input"
                placeholder="e.g. Lumber kiln-dried, joined with mortise and tenons."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => onUpdateStatus(o.id, orderStatus, prodStage, payStatus, note)}
            >
              Update Order Record
            </button>
          </div>

          <h4 style={{ margin: '14px 0 6px', fontFamily: 'Playfair Display' }}>Order Status History</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
            {history.map((h) => (
              <div key={h.id} style={{ borderLeft: '3px solid #a66c43', paddingLeft: 10 }}>
                <strong>{h.status}</strong> · <span style={{ color: '#777' }}>{new Date(h.created_at).toLocaleString()}</span>
                <div>{h.note}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="admin-modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SUB-COMPONENT: NEW ORDER MODAL
// ----------------------------------------------------
function NewOrderModal({ products, onClose, onCreated, authHeaders }) {
  const [orderType, setOrderType] = useState('Ready-made');
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payStatus, setPayStatus] = useState('Pending');

  // items
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState(1);

  // custom item
  const [customItemName, setCustomItemName] = useState('');
  const [customWood, setCustomWood] = useState('American Walnut');
  const [customPrice, setCustomPrice] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    let items = [];
    if (orderType === 'Ready-made') {
      const p = products.find((x) => x.id === parseInt(selectedProductId, 10));
      if (!p) return alert('Select a product');
      items = [{
        product_id: p.id,
        product_name: p.name,
        wood_type: p.wood_type,
        unit_price: p.price,
        quantity: parseInt(quantity, 10)
      }];
    } else {
      if (!customItemName || !customPrice) return alert('Please enter custom piece name and price');
      items = [{
        product_id: null,
        product_name: customItemName,
        wood_type: customWood,
        unit_price: parseFloat(customPrice),
        quantity: 1
      }];
    }

    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          order_type: orderType,
          customer_name: custName,
          customer_email: custEmail,
          customer_phone: custPhone,
          delivery_address: address,
          items,
          payment_status: payStatus,
          order_status: orderType === 'Ready-made' ? 'Confirmed' : 'In Production',
          production_stage: orderType === 'Custom' ? 'Materials Sourcing' : null,
          notes: 'Manually entered through admin management portal.'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not create order');
      onCreated();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal" style={{ maxWidth: 600 }}>
        <div className="admin-modal-head">
          <h3>Book New Furniture Order</h3>
          <button style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="admin-modal-body">
            <div className="form-group">
              <label>Order Type</label>
              <select className="admin-select" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="Ready-made">Ready-made Finished Goods Order</option>
                <option value="Custom">Custom Bespoke Production Order</option>
              </select>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Customer Name</label>
                <input required className="admin-input" value={custName} onChange={(e) => setCustName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Customer Email</label>
                <input required type="email" className="admin-input" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Customer Phone</label>
                <input className="admin-input" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Payment Status</label>
                <select className="admin-select" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
                  <option value="Pending">Pending</option>
                  <option value="Verified Offline">Verified Offline (Wire/NEFT)</option>
                  <option value="Paid">Paid in Full</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Delivery Address</label>
              <textarea required rows="2" className="admin-textarea" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            {orderType === 'Ready-made' ? (
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Select Catalog Piece</label>
                  <select className="admin-select" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                    {products.filter((p) => p.product_type === 'Ready-made').map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.wood_type}) — ₹{Math.round(p.price).toLocaleString()} [Stock: {p.stock_quantity}]</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input required type="number" min="1" className="admin-input" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Custom Furniture Piece Name</label>
                  <input required className="admin-input" placeholder="e.g. Custom Credenza with Brass Inlays" value={customItemName} onChange={(e) => setCustomItemName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Wood Spec & Agreed Price (₹)</label>
                  <input required type="number" className="admin-input" placeholder="Price (₹)" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <div className="admin-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Confirm & Create Order</button>
          </div>
        </form>
      </div>
    </div>
  );
}
