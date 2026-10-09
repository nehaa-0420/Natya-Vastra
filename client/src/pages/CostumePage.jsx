import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { assetUrl, createBooking, getAvailability, getCostume } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { costumeTitle } from '../components/CostumeCard.jsx';

const WA_NUMBER = '919900599872';
const todayLocal = () => new Date().toLocaleDateString('en-CA');
const dayCount = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

export default function CostumePage() {
  const { id } = useParams();
  const { user, wishlist, toggleWishlist } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [costume, setCostume] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [size, setSize] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [avail, setAvail] = useState(null);
  const [availError, setAvailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState(null);

  useEffect(() => {
    setCostume(null); setLoadError('');
    getCostume(id).then(setCostume).catch((e) => setLoadError(e.message));
  }, [id]);

  const datesReady = start && end && end >= start;
  useEffect(() => {
    setAvail(null); setAvailError('');
    if (!datesReady) return undefined;
    let stale = false;
    getAvailability(id, start, end)
      .then((r) => { if (!stale) setAvail(r); })
      .catch((e) => { if (!stale) setAvailError(e.message); });
    return () => { stale = true; };
  }, [id, start, end, datesReady]);

  const sizeOptions = useMemo(() => {
    if (!costume) return [];
    if (costume.pooled) {
      const out = [];
      for (let s = costume.sizeMin; s <= costume.sizeMax; s += 2) out.push(s);
      return out;
    }
    return costume.sizes.filter((s) => s.count > 0).map((s) => s.size);
  }, [costume]);

  const remainingFor = (s) => {
    if (!avail) return null;
    const row = costume.pooled ? avail[0] : avail.find((a) => a.size === s);
    return row ? row.remaining : 0;
  };
  const chosenRemaining = size ? remainingFor(Number(size)) : null;

  if (loadError) {
    return <main className="page"><div className="container"><p className="form-error">{loadError}</p><Link to="/browse" className="link-btn">← Back to all costumes</Link></div></main>;
  }
  if (!costume) return <main className="page"><div className="container"><p>Loading…</p></div></main>;

  const title = costumeTitle(costume);
  const saved = wishlist.has(costume.id);
  const days = datesReady ? dayCount(start, end) : 0;
  const estimate = costume.rentPrice && days ? costume.rentPrice * days : null;
  const waText = `Namaste! I'm interested in the ${title} costume (${costume.categoryName}). Could you share availability and pricing?`;

  const onHeart = async () => {
    const ok = await toggleWishlist(costume.id);
    if (!ok) navigate('/login', { state: { from: location } });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!size) return setError('Please choose a size.');
    if (!datesReady) return setError('Please choose your start and end dates.');
    setSubmitting(true);
    try {
      setBooked(await createBooking({ costumeId: costume.id, size: Number(size), startDate: start, endDate: end, notes }));
    } catch (err) {
      setError(err.message);
      getAvailability(id, start, end).then(setAvail).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <div className="container">
        <Link to="/browse" className="link-btn">← All costumes</Link>
        <div className="detail">
          <div className="detail__img"><img src={assetUrl(costume.src)} alt={title} /></div>

          <div className="detail__info">
            <p className="detail__cat">{costume.categoryName}</p>
            <h1 className="page-title">{title}</h1>
            <p className="detail__price">{costume.rentPrice ? `₹${costume.rentPrice} per day` : 'Rent price on request'}</p>

            {costume.sizeMin && <p>Available in sizes {costume.sizeMin}–{costume.sizeMax} inches{costume.total ? ` · ${costume.total} pieces in total` : ''}.</p>}
            {costume.sizes.length > 0 && (
              <ul className="chips">
                {costume.sizes.map((s) => <li key={s.size}><strong>{s.size}</strong> × {s.count}</li>)}
              </ul>
            )}

            <button className="btn btn-outline detail__heart" onClick={onHeart} aria-pressed={saved}>
              {saved ? '♥ Saved to wishlist' : '♡ Save to wishlist'}
            </button>

            {!costume.bookable ? (
              <div className="panel">
                <h2>Ask us about this one</h2>
                <p>This costume is arranged personally rather than booked online. Message us and we will confirm sizes, stitching time and price.</p>
                <a className="btn btn-primary" target="_blank" rel="noreferrer" href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`}>Enquire on WhatsApp</a>
              </div>
            ) : booked ? (
              <div className="panel panel--ok" role="status">
                <h2>Booking request received</h2>
                <p>Thank you! We have held <strong>size {booked.size}</strong> for <strong>{booked.startDate}</strong> to <strong>{booked.endDate}</strong> ({booked.days} day{booked.days > 1 ? 's' : ''}). We will confirm with you shortly, and you can follow it under <Link to="/account">My account</Link>.</p>
                <a className="btn btn-primary" target="_blank" rel="noreferrer"
                   href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hi! I just requested booking #${booked.id} for the ${title} costume, size ${booked.size}, ${booked.startDate} to ${booked.endDate}.`)}`}>
                  Message us on WhatsApp
                </a>
              </div>
            ) : (
              <form className="panel" onSubmit={submit}>
                <h2>Book this costume</h2>
                <div className="form-row">
                  <label className="field">
                    <span>From</span>
                    <input type="date" min={todayLocal()} value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd(''); }} required />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input type="date" min={start || todayLocal()} value={end} onChange={(e) => setEnd(e.target.value)} required />
                  </label>
                </div>
                <label className="field">
                  <span>Size (inches)</span>
                  <select value={size} onChange={(e) => setSize(e.target.value)} required>
                    <option value="">Choose a size</option>
                    {sizeOptions.map((s) => {
                      const left = remainingFor(s);
                      return <option key={s} value={s} disabled={left === 0}>{s}{left === 0 ? ' — booked for these dates' : ''}</option>;
                    })}
                  </select>
                </label>
                {costume.pooled && <p className="form-hint">Tell us your exact measurements in the notes and we will check the fit.</p>}

                {availError && <p className="form-error">{availError}</p>}
                {size && datesReady && chosenRemaining !== null && (
                  <p className={chosenRemaining > 0 ? 'avail avail--ok' : 'avail avail--no'} aria-live="polite">
                    {chosenRemaining > 0 ? `Good news — size ${size} is free for these dates (${chosenRemaining} left).` : `Size ${size} is already booked for some of these dates.`}
                  </p>
                )}

                <label className="field">
                  <span>Notes (occasion, measurements)</span>
                  <textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Arangetram on 14th, height 4'8&quot;" />
                </label>

                {estimate && <p className="estimate">{days} day{days > 1 ? 's' : ''} × ₹{costume.rentPrice} = <strong>₹{estimate}</strong> <span>(final amount confirmed by us)</span></p>}
                {error && <p className="form-error" role="alert">{error}</p>}

                {user ? (
                  <button className="btn btn-primary" disabled={submitting || chosenRemaining === 0}>{submitting ? 'Sending…' : 'Request booking'}</button>
                ) : (
                  <Link className="btn btn-primary" to="/login" state={{ from: location }}>Log in to book</Link>
                )}
                <p className="form-hint">Your request holds the costume for you. We confirm every booking personally.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
