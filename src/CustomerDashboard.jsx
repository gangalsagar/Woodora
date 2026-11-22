import React, { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, Truck, XCircle, ArrowLeft, RefreshCw, MapPin, User, LogOut } from 'lucide-react';
import { apiUrl } from './apiConfig';

export default function CustomerDashboard({ customer, token, onLogout, onClose, onBackToStore }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [error, setError] = useState('');

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/customer/orders'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch your orders');
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err.message || 'Could not load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [token]);

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'delivered') return { bg: '#e8f5e9', color: '#2e7d32', label: 'Delivered' };
    if (s === 'shipped') return { bg: '#e3f2fd', color: '#1565c0', label: 'Shipped' };
    if (s === 'in production' || s === 'ready for dispatch') return { bg: '#fff3e0', color: '#e65100', label: status };
    if (s === 'confirmed') return { bg: '#f3e5f5', color: '#6a1b9a', label: 'Confirmed' };
    if (s === 'cancelled' || s === 'rejected') return { bg: '#ffebee', color: '#c62828', label: status };
    return { bg: '#f5f5f5', color: '#616161', label: 'Pending Review' };
  };

  return (
    <div className="customer-dashboard-screen" style={{ minHeight: '100vh', background: '#f6f3ee', color: '#2b2927', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        
        {/* Top bar navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, borderBottom: '1px solid #e2dad0', paddingBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <button
              onClick={onBackToStore}
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 12px', background: '#fff', border: '1px solid #dcd2c4', cursor: 'pointer' }}
            >
              <ArrowLeft size={14} /> Back to Storefront
            </button>
            <h1 style={{ fontFamily: 'Playfair Display', fontSize: 26, margin: 0 }}>
              Client Portal · <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#a66c43' }}>Woodora</span>
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ textAlign: 'right', fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{customer?.name}</div>
              <div style={{ color: '#777' }}>{customer?.email}</div>
            </div>
            <button
              onClick={onLogout}
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 12px', cursor: 'pointer', background: '#fff', border: '1px solid #dcd2c4' }}
            >
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </div>

        {/* Dashboard grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
          
          {/* Header Card */}
          <div style={{ background: '#fff', border: '1px solid #e7ded2', padding: 24, borderRadius: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 10, letterSpacing: '0.12em', color: '#a66c43', textTransform: 'uppercase', fontWeight: 600 }}>
                  Order History & Fulfillment Tracker
                </span>
                <h2 style={{ fontFamily: 'Playfair Display', margin: '4px 0 0', fontSize: 22 }}>
                  Your Bespoke & Catalog Commissions
                </h2>
              </div>
              <button
                onClick={fetchOrders}
                disabled={loading}
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 12px', background: '#faf8f5', border: '1px solid #dcd2c4', cursor: 'pointer' }}
              >
                <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh Status
              </button>
            </div>
          </div>

          {/* Orders Listing */}
          {loading && orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', border: '1px solid #e7ded2', color: '#777' }}>
              Retrieving your commissions from our workshop ledger...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', border: '1px solid #e7ded2' }}>
              <Package size={36} color="#a66c43" style={{ marginBottom: 12 }} />
              <h3 style={{ fontFamily: 'Playfair Display', fontSize: 20, margin: '0 0 8px' }}>No orders placed yet</h3>
              <p style={{ color: '#777', fontSize: 13, maxWidth: 400, margin: '0 auto 20px' }}>
                Browse our curated catalogue of solid wood furniture pieces or submit a custom bespoke requirement.
              </p>
              <button onClick={onBackToStore} className="dark-btn" style={{ padding: '10px 20px' }}>
                Explore Collection
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {orders.map((ord) => {
                const badge = getStatusBadge(ord.order_status);
                return (
                  <div key={ord.id} style={{ background: '#fff', border: '1px solid #e7ded2', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ padding: '18px 24px', background: '#fdfbf7', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <span style={{ fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 16, marginRight: 12 }}>
                          {ord.order_code}
                        </span>
                        <span style={{ fontSize: 11, color: '#777' }}>
                          Placed on {new Date(ord.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 2 }}>
                          {badge.label}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>
                          ₹{Math.round(ord.total_amount).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: 24 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 2fr) minmax(260px, 1fr)', gap: 24 }}>
                        {/* Ordered Items */}
                        <div>
                          <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', margin: '0 0 12px' }}>
                            Items in this Order ({ord.items?.length || 0})
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {ord.items?.map((it, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#faf9f5', border: '1px solid #f0eae1' }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{it.product_name}</div>
                                  <div style={{ fontSize: 12, color: '#777' }}>
                                    Wood: {it.wood_type || 'Selected Timber'} · Qty: {it.quantity}
                                  </div>
                                </div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>
                                  ₹{Math.round(it.total_price).toLocaleString('en-IN')}
                                </div>
                              </div>
                            ))}
                          </div>

                          {ord.delivery_address && (
                            <div style={{ marginTop: 16, fontSize: 12, color: '#555' }}>
                              <span style={{ fontWeight: 600, color: '#2b2927' }}>Delivery Address: </span>
                              {ord.delivery_address}
                            </div>
                          )}
                        </div>

                        {/* Status Timeline */}
                        <div style={{ borderLeft: '1px solid #f0eae1', paddingLeft: 20 }}>
                          <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#777', margin: '0 0 12px' }}>
                            Workshop Progress Updates
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {ord.history?.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#888' }}>Awaiting initial review by our master artisan.</div>
                            ) : (
                              ord.history?.map((h, hIdx) => (
                                <div key={hIdx} style={{ borderLeft: '2px solid #a66c43', paddingLeft: 10, fontSize: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong style={{ color: '#2b2927' }}>{h.status}</strong>
                                    <span style={{ fontSize: 10, color: '#888' }}>
                                      {new Date(h.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <p style={{ margin: '3px 0 0', color: '#666', lineHeight: 1.4 }}>{h.note}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
