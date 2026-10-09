import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  adminBookings, adminCostumes, adminCreateCostume, adminEnquiries, adminSetBookingStatus,
  adminStats, adminUpdateCostume, assetUrl, getCategories
} from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { costumeTitle } from '../components/CostumeCard.jsx';

const STATUSES = ['pending', 'confirmed', 'returned', 'cancelled'];
const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
};

export default function AdminPage() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState('bookings');
  const [stats, setStats] = useState(null);
  const refreshStats = useCallback(() => adminStats().then(setStats).catch(() => {}), []);
  useEffect(() => { if (user?.role === 'admin') refreshStats(); }, [user, refreshStats]);

  if (!ready) return <main className="page"><div className="container"><p>Loading…</p></div></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: { pathname: '/admin' } }} />;
  if (user.role !== 'admin') {
    return <main className="page"><div className="container"><p className="form-error">This page is for the shop admin only.</p></div></main>;
  }

  const cards = stats && [
    ['Pending bookings', stats.pendingBookings], ['Confirmed bookings', stats.confirmedBookings],
    ['Costumes listed', stats.costumes], ['Customers', stats.customers], ['Enquiries', stats.enquiries]
  ];

  return (
    <main className="page">
      <div className="container">
        <h1 className="page-title">Shop dashboard</h1>
        {cards && <div className="stat-row">{cards.map(([label, n]) => <div className="stat" key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>}
        <div className="tabs" role="tablist">
          {[['bookings', 'Bookings'], ['costumes', 'Costumes & stock'], ['enquiries', 'Enquiries']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {tab === 'bookings' && <BookingsTab onChange={refreshStats} />}
        {tab === 'costumes' && <CostumesTab onChange={refreshStats} />}
        {tab === 'enquiries' && <EnquiriesTab />}
      </div>
    </main>
  );
}

function BookingsTab({ onChange }) {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    adminBookings(status).then(setRows).catch((e) => setError(e.message));
  }, [status]);

  const change = async (b, next) => {
    setError('');
    try {
      const updated = await adminSetBookingStatus(b.id, next);
      setRows((list) => list.map((x) => (x.id === b.id ? { ...x, status: updated.status } : x)));
      onChange();
    } catch (e) { setError(e.message); }
  };

  return (
    <section>
      <div className="results-bar">
        <label className="filters__field"><span>Show</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All bookings</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {rows === null ? <p>Loading…</p> : rows.length === 0 ? <p className="empty">No bookings here yet.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Costume</th><th>Customer</th><th>Size</th><th>Dates</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><div className="cell-costume"><img src={assetUrl(b.src)} alt="" /><span>{b.costumeName}<small>#{b.id}</small></span></div></td>
                  <td>{b.user.name}<small>{b.user.email}</small>
                    {b.user.phone && <small><a href={waLink(b.user.phone)} target="_blank" rel="noreferrer">{b.user.phone} · WhatsApp</a></small>}</td>
                  <td>{b.size}</td>
                  <td>{b.startDate} → {b.endDate}<small>{b.days} day{b.days > 1 ? 's' : ''}{b.notes ? ` · “${b.notes}”` : ''}</small></td>
                  <td>
                    <select aria-label={`Status of booking ${b.id}`} className={`status-select badge--${b.status}`} value={b.status} onChange={(e) => change(b, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CostumesTab({ onChange }) {
  const [costumes, setCostumes] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | costume
  const [error, setError] = useState('');

  const load = useCallback(() => adminCostumes().then(setCostumes).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); getCategories().then(setCategories).catch(() => {}); }, [load]);

  const saved = () => { setEditing(null); load(); onChange(); };

  return (
    <section>
      <div className="results-bar">
        <p>{costumes ? `${costumes.length} costumes` : 'Loading…'}</p>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add costume</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {editing && <CostumeEditor costume={editing === 'new' ? null : editing} categories={categories} onSaved={saved} onCancel={() => setEditing(null)} />}
      {costumes && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Costume</th><th>Category</th><th>Rent / day</th><th>Stock</th><th>Status</th><th /></tr></thead>
            <tbody>
              {costumes.map((c) => (
                <tr key={c.id} className={c.active ? '' : 'row-off'}>
                  <td><div className="cell-costume"><img src={assetUrl(c.src)} alt="" /><span>{costumeTitle(c)}<small>#{c.id}</small></span></div></td>
                  <td>{c.categoryName}</td>
                  <td>{c.rentPrice ? `₹${c.rentPrice}` : '—'}</td>
                  <td>{c.total === null ? <small>enquiry only</small> : <>{c.total} pcs<small>{c.pooled ? `any size ${c.sizeMin}–${c.sizeMax}` : c.sizes.map((s) => `${s.size}×${s.count}`).join(' ')}</small></>}</td>
                  <td>{c.active ? 'Listed' : 'Hidden'}</td>
                  <td><button className="link-btn" onClick={() => setEditing(c)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CostumeEditor({ costume, categories, onSaved, onCancel }) {
  const isNew = !costume;
  const [name, setName] = useState(costume?.name || '');
  const [label, setLabel] = useState(costume?.label || '');
  const [categoryId, setCategoryId] = useState(costume?.categoryId || categories[0]?.id || '');
  const [price, setPrice] = useState(costume?.rentPrice ?? '');
  const [active, setActive] = useState(costume ? costume.active : true);
  const [mode, setMode] = useState(costume?.pooled ? 'pooled' : 'sizes');
  const [rows, setRows] = useState(costume && !costume.pooled ? costume.sizes.map((s) => ({ size: s.size, qty: s.count })) : [{ size: '', qty: '' }]);
  const [pool, setPool] = useState({ qty: costume?.pooled ? costume.total : '', min: costume?.sizeMin || '', max: costume?.sizeMax || '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setRow = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const sizes = mode === 'pooled'
      ? [{ size: 0, qty: Number(pool.qty) }]
      : rows.filter((r) => r.size !== '' || r.qty !== '').map((r) => ({ size: Number(r.size), qty: Number(r.qty) }));
    if (mode === 'pooled' && (pool.qty === '' || !pool.min || !pool.max)) return setError('Enter the stock count and the smallest and largest size.');
    if (isNew && !file) return setError('Please choose a photo.');

    setBusy(true);
    try {
      if (isNew) {
        const form = new FormData();
        form.append('image', file);
        form.append('categoryId', categoryId);
        form.append('name', name);
        form.append('label', label);
        form.append('rentPrice', price);
        form.append('sizes', JSON.stringify(sizes));
        if (mode === 'pooled') { form.append('sizeMin', pool.min); form.append('sizeMax', pool.max); }
        await adminCreateCostume(form);
      } else {
        await adminUpdateCostume(costume.id, {
          name, label, categoryId, rentPrice: price === '' ? null : Number(price), active, sizes,
          ...(mode === 'pooled' && { sizeMin: Number(pool.min), sizeMax: Number(pool.max) })
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel editor" onSubmit={submit}>
      <h2>{isNew ? 'Add a costume' : `Edit ${costumeTitle(costume)}`}</h2>
      <div className="form-row">
        <label className="field"><span>Name (shown to customers)</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Peacock Blue Set" /></label>
        <label className="field"><span>Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>Rent per day (₹)</span><input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="blank = on request" /></label>
      </div>
      <label className="field"><span>Short label (optional)</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Red & black with gold border" /></label>
      {isNew && <label className="field"><span>Photo (JPG, PNG or WebP, up to 5 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} /></label>}

      <fieldset className="stock">
        <legend>Stock</legend>
        <div className="seg">
          <button type="button" className={mode === 'sizes' ? 'on' : ''} onClick={() => setMode('sizes')}>Count per size</button>
          <button type="button" className={mode === 'pooled' ? 'on' : ''} onClick={() => setMode('pooled')}>Total only (any size in a range)</button>
        </div>
        {mode === 'sizes' ? (
          <>
            {rows.map((r, i) => (
              <div className="form-row stock__row" key={i}>
                <label className="field"><span>Size (in)</span><input type="number" min="1" value={r.size} onChange={(e) => setRow(i, 'size', e.target.value)} /></label>
                <label className="field"><span>Pieces</span><input type="number" min="0" value={r.qty} onChange={(e) => setRow(i, 'qty', e.target.value)} /></label>
                <button type="button" className="link-btn" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" className="link-btn" onClick={() => setRows((x) => [...x, { size: '', qty: '' }])}>+ Add a size</button>
            {rows.every((r) => r.size === '' && r.qty === '') && <p className="form-hint">With no sizes listed, this costume is shown as “enquire to book”.</p>}
          </>
        ) : (
          <div className="form-row">
            <label className="field"><span>Total pieces</span><input type="number" min="0" value={pool.qty} onChange={(e) => setPool({ ...pool, qty: e.target.value })} /></label>
            <label className="field"><span>Smallest size</span><input type="number" min="1" value={pool.min} onChange={(e) => setPool({ ...pool, min: e.target.value })} /></label>
            <label className="field"><span>Largest size</span><input type="number" min="1" value={pool.max} onChange={(e) => setPool({ ...pool, max: e.target.value })} /></label>
          </div>
        )}
      </fieldset>

      {!isNew && <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show this costume on the website</label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="editor__actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EnquiriesTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { adminEnquiries().then(setRows).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="form-error">{error}</p>;
  if (!rows) return <p>Loading…</p>;
  if (rows.length === 0) return <p className="empty">No enquiries yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>When</th><th>From</th><th>Interested in</th><th>Message</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.created_at}</td>
              <td>{r.name}<small><a href={waLink(r.phone)} target="_blank" rel="noreferrer">{r.phone}</a></small>{r.email && <small>{r.email}</small>}</td>
              <td>{r.costume_type || '—'}</td>
              <td>{r.message || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
