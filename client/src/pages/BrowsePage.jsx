import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategories, searchCostumes } from '../api.js';
import CostumeCard from '../components/CostumeCard.jsx';

const SIZES = Array.from({ length: 15 }, (_, i) => 16 + i * 2); // 16..44
const todayLocal = () => new Date().toLocaleDateString('en-CA');

export default function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const size = params.get('size') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const clear = () => setParams({}, { replace: true });

  useEffect(() => { getCategories().then(setCategories).catch(() => {}); }, []);

  const datesReady = from && to && to >= from;
  const dateProblem = (from || to) && !datesReady
    ? (from && to ? 'The end date must be on or after the start date.' : 'Pick both a start and an end date to see what is free.')
    : '';

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(() => {
      setError('');
      searchCostumes({ q, category, size, from: datesReady ? from : '', to: datesReady ? to : '' })
        .then((r) => { if (!stale) setItems(r); })
        .catch((e) => { if (!stale) { setError(e.message); setItems([]); } });
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [q, category, size, from, to, datesReady]);

  const filtered = q || category || size || from || to;

  return (
    <main className="page">
      <div className="container">
        <div className="section-heading">
          <h1 className="page-title">Browse &amp; book</h1>
          <p>Find a costume by style and size, and pick your dates to see exactly what is free.</p>
        </div>

        <div className="filters">
          <label className="filters__field filters__field--wide">
            <span>Search</span>
            <input type="search" value={q} onChange={(e) => set('q', e.target.value)} placeholder="e.g. frock, six piece, red" />
          </label>
          <label className="filters__field">
            <span>Category</span>
            <select value={category} onChange={(e) => set('category', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="filters__field">
            <span>Size (inches)</span>
            <select value={size} onChange={(e) => set('size', e.target.value)}>
              <option value="">Any size</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="filters__field">
            <span>From</span>
            <input type="date" min={todayLocal()} value={from} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className="filters__field">
            <span>To</span>
            <input type="date" min={from || todayLocal()} value={to} onChange={(e) => set('to', e.target.value)} />
          </label>
        </div>
        {dateProblem && <p className="form-hint">{dateProblem}</p>}

        <div className="results-bar">
          <p aria-live="polite">{items ? `${items.length} costume${items.length === 1 ? '' : 's'} found` : 'Loading…'}</p>
          {filtered && <button className="link-btn" onClick={clear}>Clear filters</button>}
        </div>

        {error && <p className="form-error">{error}</p>}
        {items && items.length === 0 && !error && (
          <p className="empty">No costumes match those filters. Try a different size or dates, or message us on WhatsApp and we will help you find one.</p>
        )}
        <div className="costume-grid">
          {(items || []).map((c) => <CostumeCard key={c.id} costume={c} />)}
        </div>
      </div>
    </main>
  );
}
