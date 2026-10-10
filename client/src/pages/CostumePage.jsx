import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  assetUrl, createBooking, createPaymentOrder, failPayment,
  getAvailability, getCostume, verifyPayment
} from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { costumeTitle } from '../components/CostumeCard.jsx';

const WA_NUMBER = '919900599872';
const todayLocal = () => new Date().toLocaleDateString('en-CA');
const dayCount = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

// ── Open the Razorpay checkout modal ─────────────────────────────────────
function openRazorpay({ order, onSuccess, onDismiss }) {
  if (typeof window.Razorpay === 'undefined') {
    onDismiss('Razorpay could not be loaded. Please try again or contact us.');
    return;
  }
  const rzp = new window.Razorpay({
    key: order.keyId,
    amount: order.amountPaise,
    currency: order.currency,
    order_id: order.orderId,
    name: 'Natya Vastra',
    description: `Deposit for booking #${order.bookingId}`,
    prefill: {
      name: order.customerName,
      email: order.customerEmail,
      contact: order.customerPhone
    },
    theme: { color: '#8B4513' },
    handler: onSuccess,
    modal: { ondismiss: () => onDismiss(null) }
  });
  rzp.open();
}

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

  // Payment states
  const [booking, setBooking] = useState(null);      // just-created booking
  const [payOrder, setPayOrder] = useState(null);    // Razorpay order details
  const [paidBooking, setPaidBooking] = useState(null); // after successful verify
  const [payError, setPayError] = useState('');

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
    return (
      <main className="page">
        <div className="container">
          <p className="form-error">{loadError}</p>
          <Link to="/browse" className="link-btn">← Back to all costumes</Link>
        </div>
      </main>
    );
  }
  if (!costume) return <main className="page"><div className="container"><p>Loading…</p></div></main>;

  const title = costumeTitle(costume);
  const saved = wishlist.has(costume.id);
  const days = datesReady ? dayCount(start, end) : 0;
  const estimate = costume.rentPrice && days ? costume.rentPrice * days : null;
  const waText = `Namaste! I'm interested in the ${title} costume (${costume.categoryName}). Could you share availability and pricing?`;
  const bookingWaText = booking
    ? `Hi! I just requested booking #${booking.id} for the ${title} costume, size ${booking.size}, ${booking.startDate} to ${booking.endDate}.`
    : '';

  const onHeart = async () => {
    const ok = await toggleWishlist(costume.id);
    if (!ok) navigate('/login', { state: { from: location } });
  };

  // ── Step 2: open Razorpay modal for a given booking ─────────────────────
  const startPayment = async (bk) => {
    setPayError('');
    let order;
    try {
      order = await createPaymentOrder(bk.id);
      setPayOrder(order);
    } catch (err) {
      setPayError(err.message);
      return;
    }

    openRazorpay({
      order,
      onSuccess: async (response) => {
        try {
          const paid = await verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          setPaidBooking(paid);
          setPayOrder(null);
        } catch (err) {
          setPayError(err.message);
        }
      },
      onDismiss: async (msg) => {
        // Payment window closed — mark attempt as failed but keep booking
        try { await failPayment(order.orderId); } catch { /* ignore */ }
        setPayOrder(null);
        if (msg) setPayError(msg);
        else setPayError('Payment was not completed. You can retry below or contact us on WhatsApp.');
      }
    });
  };

  // ── Step 1: submit booking form ──────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!size) return setError('Please choose a size.');
    if (!datesReady) return setError('Please choose your start and end dates.');
    setSubmitting(true);
    try {
      const bk = await createBooking({
        costumeId: costume.id, size: Number(size),
        startDate: start, endDate: end, notes
      });
      setBooking(bk);
      if (bk.rentPrice) {
        await startPayment(bk);
      }
      // No rent price → booking panel shows WhatsApp CTA automatically
    } catch (err) {
      setError(err.message);
      getAvailability(id, start, end).then(setAvail).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const renderPanel = () => {
    if (!costume.bookable) {
      return (
        <div className="panel">
          <h2>Ask us about this one</h2>
          <p>This costume is arranged personally rather than booked online. Message us and we will confirm sizes and price.</p>
          <a className="btn btn-primary" target="_blank" rel="noreferrer"
             href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`}>
            Enquire on WhatsApp
          </a>
        </div>
      );
    }

    if (paidBooking) {
      return (
        <div className="panel panel--ok" role="status">
          <h2>Deposit paid — you&rsquo;re all set! ✅</h2>
          <p>
            Booking <strong>#{paidBooking.id}</strong> · size <strong>{paidBooking.size}</strong>{' '}
            · <strong>{paidBooking.startDate}</strong> to <strong>{paidBooking.endDate}</strong>{' '}
            ({paidBooking.days} day{paidBooking.days > 1 ? 's' : ''}).{' '}
            Your deposit of <strong>₹{paidBooking.depositAmount}</strong> has been received.
            We will confirm the booking shortly. See it under <Link to="/account">My account</Link>.
          </p>
          <a className="btn btn-primary" target="_blank" rel="noreferrer"
             href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(bookingWaText)}`}>
            Message us on WhatsApp
          </a>
        </div>
      );
    }

    // Booking exists but no rent price → WhatsApp handoff
    if (booking && !booking.rentPrice) {
      return (
        <div className="panel panel--ok" role="status">
          <h2>Booking request received</h2>
          <p>
            Thank you! We have held <strong>size {booking.size}</strong> for{' '}
            <strong>{booking.startDate}</strong> to <strong>{booking.endDate}</strong>{' '}
            ({booking.days} day{booking.days > 1 ? 's' : ''}).
            This costume is priced on request — please message us to confirm the rental amount
            and finalise your booking. You can also track it under <Link to="/account">My account</Link>.
          </p>
          <a className="btn btn-primary" target="_blank" rel="noreferrer"
             href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(bookingWaText)}`}>
            Confirm pricing on WhatsApp
          </a>
        </div>
      );
    }

    // Payment failed / dismissed — allow retry
    if (booking && payError && !payOrder) {
      return (
        <div className="panel" role="status">
          <h2>Payment not completed</h2>
          <p>
            Your booking <strong>#{booking.id}</strong> is saved, but the deposit was not collected.
            You can pay now or contact us on WhatsApp to arrange payment.
          </p>
          {payError && <p className="form-error">{payError}</p>}
          <div className="panel-actions">
            <button className="btn btn-primary" onClick={() => startPayment(booking)}>
              Retry deposit — ₹{booking.depositAmount}
            </button>
            <a className="btn btn-outline" target="_blank" rel="noreferrer"
               href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(bookingWaText)}`}>
              Contact us on WhatsApp
            </a>
          </div>
        </div>
      );
    }

    // Awaiting payment (modal should be open)
    if (booking && payOrder) {
      return (
        <div className="panel" role="status">
          <h2>Complete your deposit</h2>
          <p>
            Booking <strong>#{booking.id}</strong> created. Please complete the deposit of{' '}
            <strong>₹{booking.depositAmount}</strong> (50% of estimated rental) to hold your costume.
          </p>
          {payError && <p className="form-error" role="alert">{payError}</p>}
          <button className="btn btn-primary" onClick={() => startPayment(booking)}>
            Pay ₹{booking.depositAmount} deposit
          </button>
          <p className="form-hint">If the payment window closed, click above to reopen it.</p>
        </div>
      );
    }

    // Default: booking form
    return (
      <form className="panel" onSubmit={submit}>
        <h2>Book this costume</h2>
        <div className="form-row">
          <label className="field">
            <span>From</span>
            <input
              type="date" min={todayLocal()} value={start}
              onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd(''); }}
              required
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="date" min={start || todayLocal()} value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </label>
        </div>

        <label className="field">
          <span>Size (inches)</span>
          <select value={size} onChange={(e) => setSize(e.target.value)} required>
            <option value="">Choose a size</option>
            {sizeOptions.map((s) => {
              const left = remainingFor(s);
              return (
                <option key={s} value={s} disabled={left === 0}>
                  {s}{left === 0 ? ' — booked for these dates' : ''}
                </option>
              );
            })}
          </select>
        </label>
        {costume.pooled && (
          <p className="form-hint">Tell us your exact measurements in the notes and we will check the fit.</p>
        )}

        {availError && <p className="form-error">{availError}</p>}
        {size && datesReady && chosenRemaining !== null && (
          <p className={chosenRemaining > 0 ? 'avail avail--ok' : 'avail avail--no'} aria-live="polite">
            {chosenRemaining > 0
              ? `Good news — size ${size} is free for these dates (${chosenRemaining} left).`
              : `Size ${size} is already booked for some of these dates.`}
          </p>
        )}

        <label className="field">
          <span>Notes (occasion, measurements)</span>
          <textarea
            rows={3} maxLength={500} value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Arangetram on 14th, height 4'8&quot;"
          />
        </label>

        {estimate && (
          <p className="estimate">
            {days} day{days > 1 ? 's' : ''} × ₹{costume.rentPrice} = <strong>₹{estimate}</strong>{' '}
            <span>(deposit: ₹{Math.ceil(estimate / 2)} · balance paid on collection)</span>
          </p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}

        {user ? (
          <button className="btn btn-primary" disabled={submitting || chosenRemaining === 0}>
            {submitting ? 'Sending…' : costume.rentPrice ? 'Book & pay deposit' : 'Request booking'}
          </button>
        ) : (
          <Link className="btn btn-primary" to="/login" state={{ from: location }}>Log in to book</Link>
        )}
        <p className="form-hint">
          {costume.rentPrice
            ? 'A 50% deposit is collected now. The remaining balance is paid when you collect the costume.'
            : 'Your request holds the costume for you. We confirm every booking personally.'}
        </p>
      </form>
    );
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
            <p className="detail__price">
              {costume.rentPrice ? `₹${costume.rentPrice} per day` : 'Rent price on request'}
            </p>

            {costume.sizeMin && (
              <p>
                Available in sizes {costume.sizeMin}–{costume.sizeMax} inches
                {costume.total ? ` · ${costume.total} pieces in total` : ''}.
              </p>
            )}
            {costume.sizes.length > 0 && (
              <ul className="chips">
                {costume.sizes.map((s) => (
                  <li key={s.size}><strong>{s.size}</strong> × {s.count}</li>
                ))}
              </ul>
            )}

            <button className="btn btn-outline detail__heart" onClick={onHeart} aria-pressed={saved}>
              {saved ? '♥ Saved to wishlist' : '♡ Save to wishlist'}
            </button>

            {renderPanel()}
          </div>
        </div>
      </div>
    </main>
  );
}
