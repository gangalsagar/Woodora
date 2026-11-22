import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  ArrowUpRight,
  Menu,
  X,
  Search,
  ShoppingBag,
  Sparkles,
  Plus,
  Minus,
  Send,
  Check,
  ChevronDown,
  ShieldAlert
} from 'lucide-react';
import './styles.css';
import './admin.css';
import { apiUrl } from './apiConfig';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';

// Fallback initial products if API is momentarily offline
const defaultProducts = [
  { id: 1, name: 'The Alder Dining Table', type: 'Dining', wood: 'Solid oak', price: '₹68,000', tag: 'Bestseller', img: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85' },
  { id: 2, name: 'Marlow Lounge Chair', type: 'Seating', wood: 'Teak & cane', price: '₹32,500', tag: 'Made to order', img: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1000&q=85' },
  { id: 3, name: 'Forma Platform Bed', type: 'Bedroom', wood: 'American walnut', price: '₹94,000', tag: 'Signature', img: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=85' },
  { id: 4, name: 'Sora Sideboard', type: 'Storage', wood: 'White oak', price: '₹57,000', tag: 'New', img: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1000&q=85' },
  { id: 5, name: 'Arc Dining Chair', type: 'Seating', wood: 'Solid ash', price: '₹18,500', tag: 'Made to order', img: 'https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?auto=format&fit=crop&w=1000&q=85' },
  { id: 6, name: 'Noma Coffee Table', type: 'Living', wood: 'Smoked oak', price: '₹26,000', tag: 'Bestseller', img: 'https://images.unsplash.com/photo-1499933374294-4584851497cc?auto=format&fit=crop&w=1000&q=85' }
];

function Storefront() {
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [chat, setChat] = useState(false);
  const [messages, setMessages] = useState([
    {
      from: 'ai',
      text: 'Hello. I’m the Woodora design assistant. Tell me about your space, preferred wood, dimensions, or budget, and I’ll check our workshop collection.',
      products: [],
      offerCustom: false,
      customDefaults: null
    }
  ]);
  const [question, setQuestion] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [customModal, setCustomModal] = useState({ open: false, defaults: null });

  // Custom modal form states
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cCat, setCCat] = useState('Dining table');
  const [cWood, setCWood] = useState('');
  const [cDims, setCDims] = useState('');
  const [cBudget, setCBudget] = useState('');
  const [cReqs, setCReqs] = useState('');
  const [cSubmitting, setCSubmitting] = useState(false);
  const [cSuccess, setCSuccess] = useState('');
  const [formSent, setFormSent] = useState(false);
  const [enquirySuccessCode, setEnquirySuccessCode] = useState('');
  const [enquirySubmitting, setEnquirySubmitting] = useState(false);

  // Live products from API
  const [catalog, setCatalog] = useState(defaultProducts);

  useEffect(() => {
    fetch(apiUrl('/api/products'))
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCatalog(data);
        }
      })
      .catch((err) => console.log('Using initial fallback catalog:', err));
  }, []);

  // Enquiry form state
  const [enqName, setEnqName] = useState('');
  const [enqEmail, setEnqEmail] = useState('');
  const [enqPhone, setEnqPhone] = useState('');
  const [enqCategory, setEnqCategory] = useState('Dining table');
  const [enqRequirements, setEnqRequirements] = useState('');

  const shown = useMemo(
    () => catalog.filter((p) => (filter === 'All' || p.type === filter) && (`${p.name} ${p.wood}`).toLowerCase().includes(query.toLowerCase())),
    [catalog, filter, query]
  );

  const add = (p) => setCart((c) => [...c, p]);

  const send = async () => {
    if (!question.trim()) return;
    const q = question.trim();
    setMessages((m) => [...m, { from: 'user', text: q, products: [] }]);
    setQuestion('');
    setAiTyping(true);
    try {
      const r = await fetch(apiUrl('/api/assistant'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q })
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setMessages((m) => [
        ...m,
        {
          from: 'ai',
          text: d.reply,
          products: d.recommended_products || [],
          offerCustom: d.offer_custom_enquiry || false,
          customDefaults: d.custom_defaults || null
        }
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          from: 'ai',
          text: 'Thanks for sharing that. For a tailored recommendation, consider room dimensions, preferred wood species, and budget. Our team can turn those details into a custom bespoke piece.',
          products: [],
          offerCustom: true,
          customDefaults: null
        }
      ]);
    } finally {
      setAiTyping(false);
    }
  };

  const openCustomModalWithDefaults = (defaults) => {
    setCSuccess('');
    setCName('');
    setCEmail('');
    setCPhone('');
    setCCat(defaults?.category || 'Dining table');
    setCWood(defaults?.preferred_wood || '');
    setCDims(defaults?.dimensions || '');
    setCBudget(defaults?.budget || '');
    setCReqs(defaults?.requirements || '');
    setCustomModal({ open: true, defaults });
  };

  const handleCustomModalSubmit = async (e) => {
    e.preventDefault();
    setCSubmitting(true);
    try {
      const res = await fetch(apiUrl('/api/enquiries'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cName,
          email: cEmail,
          phone: cPhone || null,
          furniture_category: cCat,
          requirements: cReqs,
          dimensions: cDims || null,
          preferred_wood: cWood || null,
          budget: cBudget || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not submit enquiry');
      setCSuccess(data.enquiry_code);
    } catch (err) {
      alert(err.message);
    } finally {
      setCSubmitting(false);
    }
  };

  const handleEnquirySubmit = async (e) => {
    e.preventDefault();
    setEnquirySubmitting(true);
    try {
      const res = await fetch(apiUrl('/api/enquiries'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: enqName,
          email: enqEmail,
          phone: enqPhone || null,
          furniture_category: enqCategory,
          requirements: enqRequirements,
          dimensions: null,
          preferred_wood: null,
          budget: null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not submit enquiry');

      setEnquirySuccessCode(data.enquiry_code || 'Recorded');
      setFormSent(true);
    } catch (err) {
      alert(err.message || 'Error submitting enquiry');
    } finally {
      setEnquirySubmitting(false);
    }
  };

  return (
    <>
      <div className="announcement">
        Thoughtfully made in India · Designed to stay for generations{' '}
        <span>
          Explore our craft <ArrowUpRight size={12} />
        </span>
      </div>

      <header>
        <a className="brand" href="#">
          <span className="brand-mark">W.</span>
          <span>
            WOODORA<small>FURNITURE, CONSIDERED</small>
          </span>
        </a>

        <nav className={menu ? 'open' : ''}>
          <a href="#collection" onClick={() => setMenu(false)}>Collection</a>
          <a href="#craft" onClick={() => setMenu(false)}>Our craft</a>
          <a href="#custom" onClick={() => setMenu(false)}>Custom furniture</a>
          <a href="#journal" onClick={() => setMenu(false)}>Journal</a>
          <a
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/admin');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            style={{ fontWeight: 600, color: 'var(--accent)' }}
          >
            Portal
          </a>
        </nav>

        <div className="head-actions">
          <button className="icon-btn" onClick={() => setShowCart(true)} aria-label="Open enquiry bag">
            <ShoppingBag size={19} />
            <sup>{cart.length}</sup>
          </button>
          <button className="icon-btn mobile-menu" onClick={() => setMenu(!menu)} aria-label="Toggle menu">
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-image"></div>
          <div className="hero-copy">
            <p className="eyebrow">THE ART OF LIVING WELL</p>
            <h1>
              Furniture with
              <br />
              <em>a sense of</em>
              <br />
              permanence.
            </h1>
            <p className="hero-sub">Honest materials. Considered forms. Made by hand, made to be lived with.</p>
            <a className="dark-btn" href="#collection">
              Discover the collection <ArrowRight size={16} />
            </a>
            <div className="hero-note">
              <span>01 / 03</span>
              <span>Crafted slowly. Kept forever.</span>
            </div>
          </div>
          <div className="hero-vertical">SOLID WOOD · MADE WITH INTENTION</div>
        </section>

        <section className="intro">
          <p className="eyebrow">A DIFFERENT KIND OF FURNITURE</p>
          <h2>
            Good furniture doesn’t
            <br />
            ask for attention. <em>It earns it.</em>
          </h2>
          <p>
            We bring together enduring materials, thoughtful proportions and skilled hands to create furniture that feels at
            home — wherever home may be.
          </p>
        </section>

        <section className="collection section" id="collection">
          <div className="section-head">
            <div>
              <p className="eyebrow">THE WOODORA EDIT</p>
              <h2>
                Pieces to live <em>with.</em>
              </h2>
            </div>
            <a className="text-link" href="#custom">
              Need something bespoke? <ArrowUpRight size={15} />
            </a>
          </div>

          <div className="catalog-tools">
            <div className="filters">
              {['All', 'Dining', 'Seating', 'Bedroom', 'Storage', 'Living'].map((f) => (
                <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
            <label className="search">
              <Search size={15} />
              <input placeholder="Find a piece..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>

          <div className="product-grid">
            {shown.map((p) => (
              <article className="product" key={p.id}>
                <div className="product-img">
                  <img src={p.img || 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85'} alt={p.name} />
                  <span>{p.tag || p.wood}</span>
                  <button onClick={() => add(p)} aria-label={'Add ' + p.name + ' to enquiry bag'}>
                    <Plus size={18} />
                  </button>
                </div>
                <div className="product-meta">
                  <div>
                    <h3>{p.name}</h3>
                    <p>{p.wood}</p>
                  </div>
                  <strong>{p.price}</strong>
                </div>
              </article>
            ))}
          </div>

          <div className="center">
            <a className="outline-btn" href="#custom">
              Explore made-to-order options <ArrowRight size={15} />
            </a>
          </div>
        </section>

        <section className="craft section" id="craft">
          <div className="craft-photo">
            <img
              src="https://images.unsplash.com/photo-1601058268499-e52658b8bb88?auto=format&fit=crop&w=1200&q=85"
              alt="Woodworking craftsmanship"
            />
          </div>
          <div className="craft-copy">
            <p className="eyebrow">MADE WITH INTENTION</p>
            <h2>
              From the grain
              <br />
              to the <em>final touch.</em>
            </h2>
            <p>
              Every piece begins with a material worth respecting. Our makers select quality timber, shape each detail with care
              and finish by hand — so the character of the wood remains part of the story.
            </p>
            <div className="craft-points">
              <div>
                <b>01</b>
                <span>Responsibly selected timber</span>
              </div>
              <div>
                <b>02</b>
                <span>Skilled, considered making</span>
              </div>
              <div>
                <b>03</b>
                <span>Finishes made for everyday life</span>
              </div>
            </div>
            <a className="text-link" href="#custom">
              Discover how we make <ArrowUpRight size={15} />
            </a>
          </div>
        </section>

        <section className="custom section" id="custom">
          <div className="custom-copy">
            <p className="eyebrow">MADE FOR YOUR SPACE</p>
            <h2>
              Your idea.
              <br />
              <em>Our hands.</em>
            </h2>
            <p>
              From a dining table sized for Sunday lunches to a wardrobe built around an awkward corner, tell us what you need.
              We’ll help shape it into a piece that belongs.
            </p>
            <div className="custom-tags">
              <span>Choose your wood</span>
              <span>Set your dimensions</span>
              <span>Make it yours</span>
            </div>
          </div>

          <form className="enquiry" onSubmit={handleEnquirySubmit}>
            <h3>Start a custom enquiry</h3>
            <p>Share a few details. Our Jaipur design team will review and reply within 24 hours.</p>

            {formSent ? (
              <div className="success">
                <Check /> Enquiry <strong>{enquirySuccessCode}</strong> received. Our team will contact you shortly with material samples and design proposals.
              </div>
            ) : (
              <>
                <div className="field-row">
                  <label>
                    Your name
                    <input required placeholder="Name" value={enqName} onChange={(e) => setEnqName(e.target.value)} />
                  </label>
                  <label>
                    Email address
                    <input
                      required
                      type="email"
                      placeholder="you@example.com"
                      value={enqEmail}
                      onChange={(e) => setEnqEmail(e.target.value)}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Phone number (optional)
                    <input
                      type="tel"
                      placeholder="+91 98..."
                      value={enqPhone}
                      onChange={(e) => setEnqPhone(e.target.value)}
                    />
                  </label>
                  <label>
                    What are you looking to make?
                    <select value={enqCategory} onChange={(e) => setEnqCategory(e.target.value)}>
                      <option value="Dining table">Dining table</option>
                      <option value="Bed / bedroom furniture">Bed / bedroom furniture</option>
                      <option value="Wardrobe / storage">Wardrobe / storage</option>
                      <option value="Seating">Seating</option>
                      <option value="Something else">Something else</option>
                    </select>
                  </label>
                </div>
                <label>
                  Tell us about your idea
                  <textarea
                    rows="3"
                    required
                    placeholder="Dimensions, wood preference, room layout, budget, inspiration..."
                    value={enqRequirements}
                    onChange={(e) => setEnqRequirements(e.target.value)}
                  />
                </label>
                <button className="dark-btn" type="submit" disabled={enquirySubmitting}>
                  {enquirySubmitting ? 'Sending...' : 'Send custom enquiry'} <ArrowRight size={15} />
                </button>
                {/* Custom Enquiry Modal triggered from AI Assistant */}
      {customModal.open && (
        <div className="ai-custom-modal" onClick={() => setCustomModal({ open: false, defaults: null })}>
          <div className="cart" style={{ width: 'min(500px, 100%)', height: 'auto', maxHeight: '90vh', background: '#faf8f2' }} onClick={(e) => e.stopPropagation()}>
            <div className="cart-head">
              <h3>Custom Workshop Enquiry</h3>
              <button onClick={() => setCustomModal({ open: false, defaults: null })}>
                <X />
              </button>
            </div>

            {cSuccess ? (
              <div style={{ padding: 25, fontSize: 13, lineHeight: 1.8 }}>
                <div style={{ color: '#216a3e', fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  ✓ Custom Enquiry Received ({cSuccess})
                </div>
                <p style={{ color: '#777', margin: 0 }}>
                  Thank you! Our Jaipur artisanal master craftsmen have received your design requirements and will review timber selection, feasibility, and prepare a custom proposal.
                </p>
                <button
                  className="dark-btn"
                  style={{ marginTop: 20 }}
                  onClick={() => setCustomModal({ open: false, defaults: null })}
                >
                  Return to Storefront
                </button>
              </div>
            ) : (
              <form onSubmit={handleCustomModalSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 11, color: '#777', margin: 0 }}>
                  The AI assistant pre-filled your requirements from your conversation. Verify and confirm to submit directly to our workshop queue:
                </p>

                <div className="field-row">
                  <label>
                    Your Name
                    <input required className="admin-input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Full name" />
                  </label>
                  <label>
                    Email Address
                    <input required type="email" className="admin-input" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="name@example.com" />
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Phone (optional)
                    <input className="admin-input" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+91 98..." />
                  </label>
                  <label>
                    Category
                    <select className="admin-select" value={cCat} onChange={(e) => setCCat(e.target.value)}>
                      <option value="Dining">Dining</option>
                      <option value="Seating">Seating</option>
                      <option value="Bedroom">Bedroom</option>
                      <option value="Storage">Storage</option>
                      <option value="Living">Living</option>
                    </select>
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Preferred Wood
                    <input className="admin-input" value={cWood} onChange={(e) => setCWood(e.target.value)} placeholder="e.g. Teak, French Oak, Walnut" />
                  </label>
                  <label>
                    Target Budget
                    <input className="admin-input" value={cBudget} onChange={(e) => setCBudget(e.target.value)} placeholder="e.g. ₹60,000" />
                  </label>
                </div>

                <label>
                  Dimensions & Space Allowance
                  <input className="admin-input" value={cDims} onChange={(e) => setCDims(e.target.value)} placeholder="e.g. 180cm L x 90cm W x 76cm H (6-seater)" />
                </label>

                <label>
                  Custom Requirements & Details
                  <textarea required rows="3" className="admin-textarea" value={cReqs} onChange={(e) => setCReqs(e.target.value)} placeholder="Details..." />
                </label>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setCustomModal({ open: false, defaults: null })}>
                    Cancel
                  </button>
                  <button type="submit" className="dark-btn" disabled={cSubmitting}>
                    {cSubmitting ? 'Submitting to Workshop...' : 'Confirm & Submit Enquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
            )}
          </form>
        </section>

        <section className="journal section" id="journal">
          <div className="section-head">
            <div>
              <p className="eyebrow">NOTES ON MATERIAL & MAKING</p>
              <h2>
                The Woodora <em>journal.</em>
              </h2>
            </div>
            <a className="text-link" href="#craft">
              More stories <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="journal-grid">
            <article>
              <img
                src="https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=800&q=85"
                alt=""
              />
              <p className="eyebrow">MATERIAL GUIDE · 5 MIN READ</p>
              <h3>Oak, teak or walnut: finding your grain</h3>
            </article>
            <article>
              <img
                src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=85"
                alt=""
              />
              <p className="eyebrow">THE MAKING · 4 MIN READ</p>
              <h3>The beauty of a well-made joint</h3>
            </article>
            <article>
              <img
                src="https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?auto=format&fit=crop&w=800&q=85"
                alt=""
              />
              <p className="eyebrow">LIVING WELL · 3 MIN READ</p>
              <h3>Making room for pieces that last</h3>
            </article>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-top">
          <a className="brand light" href="#">
            <span className="brand-mark">W.</span>
            <span>
              WOODORA<small>FURNITURE, CONSIDERED</small>
            </span>
          </a>
          <p>
            Furniture that finds its place
            <br />
            and stays there.
          </p>
          <a className="text-link light-link" href="#custom">
            Let’s make something <ArrowUpRight size={15} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Woodora. All rights reserved.</span>
          <span>Made with care, in India.</span>
          <span>
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/admin');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              style={{ color: '#d4b08c', textDecoration: 'underline' }}
            >
              Management Portal
            </a>
          </span>
        </div>
      </footer>

      {/* Floating AI Assistant */}
      <button className="ai-fab" onClick={() => setChat(!chat)}>
        <Sparkles size={17} /> Ask Woodora
      </button>

      {chat && (
        <aside className="chat">
          <div className="chat-head">
            <div>
              <Sparkles size={17} /> Woodora assistant
            </div>
            <button onClick={() => setChat(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="chat-body">
            {messages.map((m, i) => (
              <div key={i} className="chat-bubble-container">
                <div className={'bubble ' + m.from}>
                  {m.text}
                </div>

                {/* Database-connected product recommendation cards */}
                {m.products && m.products.length > 0 && (
                  <div className="ai-recommendations">
                    {m.products.map((p) => (
                      <div className="ai-card" key={p.id}>
                        <img src={p.image || p.img} alt={p.name} className="ai-card-img" />
                        <div className="ai-card-info">
                          <h5 className="ai-card-title">{p.name}</h5>
                          <div className="ai-card-meta">
                            {p.wood_type || p.wood} · {p.dimensions || 'Standard'}<br />
                            <span style={{ color: p.stock_quantity > 0 || p.product_type === 'Made-to-order' ? '#216a3e' : '#a13524', fontWeight: 500 }}>
                              {p.product_type === 'Made-to-order' ? 'Made to Order' : (p.stock_quantity > 0 ? `In Stock (${p.stock_quantity} left)` : 'Out of Stock')}
                            </span>
                          </div>
                          <div className="ai-card-bottom">
                            <span className="ai-card-price">{p.price_display || `₹${Math.round(p.price).toLocaleString()}`}</span>
                            <button
                              className="ai-card-btn"
                              onClick={() => {
                                add({
                                  id: p.id,
                                  name: p.name,
                                  wood: p.wood_type || p.wood,
                                  price: p.price_display || `₹${Math.round(p.price).toLocaleString()}`,
                                  img: p.image || p.img
                                });
                                setShowCart(true);
                              }}
                            >
                              + Enquire
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Custom furniture suggestion prompt */}
                {m.offerCustom && (
                  <div className="ai-custom-prompt-box">
                    <div>✨ <strong>Need a custom or bespoke build?</strong></div>
                    <div style={{ fontSize: 10, color: '#777', marginTop: 3 }}>
                      Our Jaipur artisans can craft this to your exact dimensions and wood preference.
                    </div>
                    <button
                      className="ai-custom-btn"
                      onClick={() => openCustomModalWithDefaults(m.customDefaults)}
                    >
                      Request Workshop Quote
                    </button>
                  </div>
                )}
              </div>
            ))}
            {aiTyping && (
              <div className="bubble ai" style={{ fontStyle: 'italic', color: '#777' }}>
                Consulting Woodora inventory & craftsmanship database...
              </div>
            )}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about wood, sizes, styles..."
            />
            <button type="submit">
              <Send size={17} />
            </button>
          </form>
        </aside>
      )}

      {/* Cart / Enquiry Bag Drawer */}
      {showCart && (
        <div className="overlay" onClick={() => setShowCart(false)}>
          <aside className="cart" onClick={(e) => e.stopPropagation()}>
            <div className="cart-head">
              <h3>Your enquiry list ({cart.length})</h3>
              <button onClick={() => setShowCart(false)}>
                <X />
              </button>
            </div>
            {cart.length === 0 ? (
              <p className="empty">Your list is empty. Add pieces you’d like to enquire about.</p>
            ) : (
              <>
                {cart.map((p, i) => (
                  <div className="cart-item" key={i}>
                    <img src={p.img || 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85'} alt="" />
                    <div>
                      <b>{p.name}</b>
                      <p>{p.price}</p>
                    </div>
                    <button onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <a className="dark-btn full" href="#custom" onClick={() => setShowCart(false)}>
                  Continue to custom enquiry <ArrowRight size={15} />
                </a>
                {/* Custom Enquiry Modal triggered from AI Assistant */}
      {customModal.open && (
        <div className="ai-custom-modal" onClick={() => setCustomModal({ open: false, defaults: null })}>
          <div className="cart" style={{ width: 'min(500px, 100%)', height: 'auto', maxHeight: '90vh', background: '#faf8f2' }} onClick={(e) => e.stopPropagation()}>
            <div className="cart-head">
              <h3>Custom Workshop Enquiry</h3>
              <button onClick={() => setCustomModal({ open: false, defaults: null })}>
                <X />
              </button>
            </div>

            {cSuccess ? (
              <div style={{ padding: 25, fontSize: 13, lineHeight: 1.8 }}>
                <div style={{ color: '#216a3e', fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  ✓ Custom Enquiry Received ({cSuccess})
                </div>
                <p style={{ color: '#777', margin: 0 }}>
                  Thank you! Our Jaipur artisanal master craftsmen have received your design requirements and will review timber selection, feasibility, and prepare a custom proposal.
                </p>
                <button
                  className="dark-btn"
                  style={{ marginTop: 20 }}
                  onClick={() => setCustomModal({ open: false, defaults: null })}
                >
                  Return to Storefront
                </button>
              </div>
            ) : (
              <form onSubmit={handleCustomModalSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 11, color: '#777', margin: 0 }}>
                  The AI assistant pre-filled your requirements from your conversation. Verify and confirm to submit directly to our workshop queue:
                </p>

                <div className="field-row">
                  <label>
                    Your Name
                    <input required className="admin-input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Full name" />
                  </label>
                  <label>
                    Email Address
                    <input required type="email" className="admin-input" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="name@example.com" />
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Phone (optional)
                    <input className="admin-input" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+91 98..." />
                  </label>
                  <label>
                    Category
                    <select className="admin-select" value={cCat} onChange={(e) => setCCat(e.target.value)}>
                      <option value="Dining">Dining</option>
                      <option value="Seating">Seating</option>
                      <option value="Bedroom">Bedroom</option>
                      <option value="Storage">Storage</option>
                      <option value="Living">Living</option>
                    </select>
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Preferred Wood
                    <input className="admin-input" value={cWood} onChange={(e) => setCWood(e.target.value)} placeholder="e.g. Teak, French Oak, Walnut" />
                  </label>
                  <label>
                    Target Budget
                    <input className="admin-input" value={cBudget} onChange={(e) => setCBudget(e.target.value)} placeholder="e.g. ₹60,000" />
                  </label>
                </div>

                <label>
                  Dimensions & Space Allowance
                  <input className="admin-input" value={cDims} onChange={(e) => setCDims(e.target.value)} placeholder="e.g. 180cm L x 90cm W x 76cm H (6-seater)" />
                </label>

                <label>
                  Custom Requirements & Details
                  <textarea required rows="3" className="admin-textarea" value={cReqs} onChange={(e) => setCReqs(e.target.value)} placeholder="Details..." />
                </label>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setCustomModal({ open: false, defaults: null })}>
                    Cancel
                  </button>
                  <button type="submit" className="dark-btn" disabled={cSubmitting}>
                    {cSubmitting ? 'Submitting to Workshop...' : 'Confirm & Submit Enquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
            )}
          </aside>
        </div>
      )}
      {/* Custom Enquiry Modal triggered from AI Assistant */}
      {customModal.open && (
        <div className="ai-custom-modal" onClick={() => setCustomModal({ open: false, defaults: null })}>
          <div className="cart" style={{ width: 'min(500px, 100%)', height: 'auto', maxHeight: '90vh', background: '#faf8f2' }} onClick={(e) => e.stopPropagation()}>
            <div className="cart-head">
              <h3>Custom Workshop Enquiry</h3>
              <button onClick={() => setCustomModal({ open: false, defaults: null })}>
                <X />
              </button>
            </div>

            {cSuccess ? (
              <div style={{ padding: 25, fontSize: 13, lineHeight: 1.8 }}>
                <div style={{ color: '#216a3e', fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  ✓ Custom Enquiry Received ({cSuccess})
                </div>
                <p style={{ color: '#777', margin: 0 }}>
                  Thank you! Our Jaipur artisanal master craftsmen have received your design requirements and will review timber selection, feasibility, and prepare a custom proposal.
                </p>
                <button
                  className="dark-btn"
                  style={{ marginTop: 20 }}
                  onClick={() => setCustomModal({ open: false, defaults: null })}
                >
                  Return to Storefront
                </button>
              </div>
            ) : (
              <form onSubmit={handleCustomModalSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 11, color: '#777', margin: 0 }}>
                  The AI assistant pre-filled your requirements from your conversation. Verify and confirm to submit directly to our workshop queue:
                </p>

                <div className="field-row">
                  <label>
                    Your Name
                    <input required className="admin-input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Full name" />
                  </label>
                  <label>
                    Email Address
                    <input required type="email" className="admin-input" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="name@example.com" />
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Phone (optional)
                    <input className="admin-input" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+91 98..." />
                  </label>
                  <label>
                    Category
                    <select className="admin-select" value={cCat} onChange={(e) => setCCat(e.target.value)}>
                      <option value="Dining">Dining</option>
                      <option value="Seating">Seating</option>
                      <option value="Bedroom">Bedroom</option>
                      <option value="Storage">Storage</option>
                      <option value="Living">Living</option>
                    </select>
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Preferred Wood
                    <input className="admin-input" value={cWood} onChange={(e) => setCWood(e.target.value)} placeholder="e.g. Teak, French Oak, Walnut" />
                  </label>
                  <label>
                    Target Budget
                    <input className="admin-input" value={cBudget} onChange={(e) => setCBudget(e.target.value)} placeholder="e.g. ₹60,000" />
                  </label>
                </div>

                <label>
                  Dimensions & Space Allowance
                  <input className="admin-input" value={cDims} onChange={(e) => setCDims(e.target.value)} placeholder="e.g. 180cm L x 90cm W x 76cm H (6-seater)" />
                </label>

                <label>
                  Custom Requirements & Details
                  <textarea required rows="3" className="admin-textarea" value={cReqs} onChange={(e) => setCReqs(e.target.value)} placeholder="Details..." />
                </label>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setCustomModal({ open: false, defaults: null })}>
                    Cancel
                  </button>
                  <button type="submit" className="dark-btn" disabled={cSubmitting}>
                    {cSubmitting ? 'Submitting to Workshop...' : 'Confirm & Submit Enquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ==========================================
// ROOT APP WITH ROUTING
// ==========================================
function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [adminToken, setAdminToken] = useState(localStorage.getItem('woodora_admin_token') || null);
  const [adminUser, setAdminUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('woodora_admin_user') || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleLoginSuccess = (user, token) => {
    setAdminUser(user);
    setAdminToken(token);
    window.history.pushState({}, '', '/admin');
    setCurrentPath('/admin');
  };

  const handleLogout = async () => {
    try {
      if (adminToken) {
        await fetch(apiUrl('/api/admin/auth/logout'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('woodora_admin_token');
    localStorage.removeItem('woodora_admin_user');
    setAdminToken(null);
    setAdminUser(null);
    window.history.pushState({}, '', '/admin');
    setCurrentPath('/admin');
  };

  // Route matching:
  if (currentPath === '/admin' || currentPath.startsWith('/admin/')) {
    if (!adminToken) {
      return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
    }
    return <AdminDashboard user={adminUser} token={adminToken} onLogout={handleLogout} />;
  }

  return <Storefront />;
}

createRoot(document.getElementById('root')).render(<App />);
