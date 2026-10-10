import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { assetUrl, cancelBooking, getMyBookings, getWishlist } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import CostumeCard from '../components/CostumeCard.jsx';

const todayLocal = () => new Date().toLocaleDateString('en-CA');

export default function AccountPage() {
  const { user, ready, wishlist } = useAuth();
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getMyBookings().then(setBookings).catch((e) => setError(e.message));
  }, [user]);

  // refetch whenever the saved set changes so un-hearting removes the card
  useEffect(() => {
    if (!user) return;
    getWishlist().then(setSaved).catch((e) => setError(e.message));
  }, [user, wishlist]);

  if (!ready) return <main className="page"><div className="container"><p>Loading…</p></div></main>;
  if (!user) return <Navigate to="/login" replace />;

  const cancel = async (b) => {
    if (!window.confirm(`Cancel your booking for ${b.costumeName} (${b.startDate} to ${b.endDate})?`)) return;
    try {
      const updated = await cancelBooking(b.id);
      setBookings((list) => list.map((x) => (x.id === b.id ? updated : x)));
    } catch (e) { setError(e.message); }
  };

  return (
    <main className="page">
      <div className="container">
        <h1 className="page-title">Hello, {user.name.split(' ')[0]}</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'bookings'} className={tab === 'bookings' ? 'on' : ''} onClick={() => setTab('bookings')}>My bookings</button>
          <button role="tab" aria-selected={tab === 'wishlist'} className={tab === 'wishlist' ? 'on' : ''} onClick={() => setTab('wishlist')}>Wishlist{saved ? ` (${saved.length})` : ''}</button>
        </div>
        {error && <p className="form-error">{error}</p>}

        {tab === 'bookings' && (
          bookings === null ? <p>Loading…</p> :
          bookings.length === 0
            ? <p className="empty">You have no bookings yet. <Link to="/browse">Browse costumes</Link> and pick your dates.</p>
            : (
              <ul className="booking-list">
                {bookings.map((b) => (
                  <li key={b.id} className="booking">
                    <img src={assetUrl(b.src)} alt="" />
                    <div className="booking__main">
                      <h3><Link to={`/costumes/${b.costumeId}`}>{b.costumeName}</Link></h3>
                      <p>Size {b.size} &middot; {b.startDate} to {b.endDate} ({b.days} day{b.days > 1 ? 's' : ''})</p>
                      {b.estimatedTotal && <p>Estimated &#8377;{b.estimatedTotal}</p>}
                      {b.depositStatus === 'paid' && b.depositAmount && (
                        <p style={{ color: '#1d6b2b', fontSize: '0.88rem' }}>&#10003; Deposit &#8377;{b.depositAmount} paid</p>
                      )}
                      {b.depositStatus === 'awaiting' && (
                        <p style={{ color: '#6b4a00', fontSize: '0.88rem' }}>
                          &#9203; Deposit pending &mdash;{' '}
                          <Link to={`/costumes/${b.costumeId}`}>pay now</Link>
                        </p>
                      )}
                      {b.depositStatus === 'failed' && (
                        <p style={{ color: '#9b1c2c', fontSize: '0.88rem' }}>
                          &#9888; Deposit not collected &mdash;{' '}
                          <Link to={`/costumes/${b.costumeId}`}>retry or contact us</Link>
                        </p>
                      )}
                      {b.notes && <p className="booking__notes">&ldquo;{b.notes}&rdquo;</p>}
                    </div>
                    <div className="booking__side">
                      <span className={`badge badge--${b.status}`}>{b.status}</span>
                      {['pending', 'confirmed'].includes(b.status) && b.startDate >= todayLocal() && (
                        <button className="link-btn" onClick={() => cancel(b)}>Cancel</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
        )}

        {tab === 'wishlist' && (
          saved === null ? <p>Loading…</p> :
          saved.length === 0
            ? <p className="empty">Nothing saved yet. Tap the heart on any costume to keep it here.</p>
            : <div className="costume-grid">{saved.map((c) => <CostumeCard key={c.id} costume={c} />)}</div>
        )}
      </div>
    </main>
  );
}
