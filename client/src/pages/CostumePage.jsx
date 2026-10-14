import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { assetUrl, createBooking, getAvailability, getCostume } from '../api.js';
import { payDeposit } from '../lib/razorpay.js';
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
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [avail, setAvail] = useState(null);
  const [availError, setAvailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsDetails, setShowTermsDetails] = useState(false);

  // Multi-size selection: Map of { [size]: quantity }
  const [sizeQuantities, setSizeQuantities] = useState({});

  // Payment states
  const [booking, setBooking] = useState(null);          // created booking
  const [paying, setPaying] = useState(false);
  const [paidBooking, setPaidBooking] = useState(null);  // after verified payment
  const [payError, setPayError] = useState('');

  useEffect(() => {
    setCostume(null);
    setLoadError('');
    setSizeQuantities({});
    getCostume(id).then(setCostume).catch((e) => setLoadError(e.message));
  }, [id]);

  const datesReady = start && end && end >= start;
  useEffect(() => {
    setAvail(null);
    setAvailError('');
    if (!datesReady) return undefined;
    let stale = false;
    getAvailability(id, start, end)
      .then((r) => { if (!stale) setAvail(r); })
      .catch((e) => { if (!stale) setAvailError(e.message); });
    return () => { stale = true; };
  }, [id, start, end, datesReady]);

  // Available size options for this costume
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

  // Helper to adjust quantity for a size
  const updateQuantity = (sz, delta) => {
    setError('');
    const current = sizeQuantities[sz] || 0;
    const maxAllowed = remainingFor(sz) != null ? remainingFor(sz) : 99;
    const next = Math.max(0, Math.min(maxAllowed, current + delta));

    setSizeQuantities((prev) => {
      const copy = { ...prev };
      if (next === 0) {
        delete copy[sz];
      } else {
        copy[sz] = next;
      }
      return copy;
    });
  };

  const setDirectQuantity = (sz, val) => {
    setError('');
    const parsed = parseInt(val, 10);
    const maxAllowed = remainingFor(sz) != null ? remainingFor(sz) : 99;
    if (isNaN(parsed) || parsed <= 0) {
      setSizeQuantities((prev) => {
        const copy = { ...prev };
        delete copy[sz];
        return copy;
      });
      return;
    }
    const cleanVal = Math.min(maxAllowed, parsed);
    setSizeQuantities((prev) => ({ ...prev, [sz]: cleanVal }));
  };

  // Total quantity and items array
  const totalPieces = useMemo(() => {
    return Object.values(sizeQuantities).reduce((sum, qty) => sum + qty, 0);
  }, [sizeQuantities]);

  const selectedItems = useMemo(() => {
    return Object.entries(sizeQuantities)
      .map(([sz, qty]) => ({ size: Number(sz), quantity: qty }))
      .filter((item) => item.quantity > 0)
      .sort((a, b) => a.size - b.size);
  }, [sizeQuantities]);

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
  const estimate = costume.rentPrice && days && totalPieces ? costume.rentPrice * days * totalPieces : null;
  const depositAmount = estimate ? Math.ceil(estimate / 2) : null;

  const waText = `Namaste! I'm interested in the ${title} costume (${costume.categoryName}). Could you share availability and details?`;
  const bookingWaText = booking
    ? `Hi! I just placed booking request #${booking.id} for the ${title} costume (${booking.sizeSummary || `size ${booking.size}`}), from ${booking.startDate} to ${booking.endDate}.`
    : '';

  const onHeart = async () => {
    const ok = await toggleWishlist(costume.id);
    if (!ok) navigate('/login', { state: { from: location } });
  };

  // ── Trigger Razorpay payment ──────────────────────────────────────────
  const startPayment = async (bk) => {
    setPayError('');
    setPaying(true);
    try {
      const paid = await payDeposit(bk.id);
      setPaidBooking(paid);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  };

  // ── Submit multi-size booking ─────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!user) {
      return navigate('/login', { state: { from: location } });
    }
    if (!datesReady) {
      return setError('Please choose your rental start and end dates.');
    }
    if (selectedItems.length === 0) {
      return setError('Please select at least one size and quantity.');
    }
    if (!acceptedTerms) {
      return setError('Please review and check the box to accept the Rental Terms and Conditions.');
    }

    setSubmitting(true);
    try {
      const bk = await createBooking({
        costumeId: costume.id,
        items: selectedItems,
        startDate: start,
        endDate: end,
        notes,
        acceptedTerms: true
      });
      setBooking(bk);
      // Online payment is unlocked once the administrator confirms the booking.
    } catch (err) {
      setError(err.message);
      if (datesReady) {
        getAvailability(id, start, end).then(setAvail).catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render Booking Panel ──────────────────────────────────────────────
  const renderPanel = () => {
    // 1. Saree & Special Order Costumes (Enquiry / WhatsApp only)
    if (!costume.bookable) {
      return (
        <div className="panel" role="region" aria-label="Costume Enquiry">
          <h2>Special Order / Custom Fitting</h2>
          <p>
            This exquisite costume ({costume.categoryName}) is custom-fitted or arranged personally.
            Message our store master on WhatsApp to check measurements, saree draping requirements, and pricing.
          </p>
          <a
            className="btn btn-primary"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`}
          >
            Enquire on WhatsApp
          </a>
        </div>
      );
    }

    // 2. Deposit Paid Successfully
    if (paidBooking) {
      return (
        <div className="panel panel--ok animate-fade-in" role="status">
          <h2>Deposit Paid — Booking Confirmed! ✅</h2>
          <p>
            Booking <strong>#{paidBooking.id}</strong> ·{' '}
            <strong>{paidBooking.sizeSummary || `Size ${paidBooking.size}`}</strong>{' '}
            ({paidBooking.totalQuantity || 1} piece{(paidBooking.totalQuantity || 1) > 1 ? 's' : ''})
          </p>
          <div className="booking-deadline-pill">
            <span>📅 Rental Dates: <strong>{paidBooking.startDate} to {paidBooking.endDate} ({paidBooking.days} day{paidBooking.days > 1 ? 's' : ''})</strong></span>
            <span>⏰ Return Deadline: <strong>{paidBooking.returnDeadline ? paidBooking.returnDeadline.replace('T', ' at ') : `${paidBooking.endDate} at 8:00 PM`}</strong></span>
          </div>
          <p style={{ marginTop: '0.75rem' }}>
            Your 50% deposit of <strong>₹{paidBooking.depositAmount}</strong> has been received.
            The remaining balance is payable upon costume collection at our store.
          </p>
          <div className="panel-actions" style={{ marginTop: '1rem' }}>
            <Link to="/account" className="btn btn-primary">
              View in My Account
            </Link>
            <a
              className="btn btn-outline"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(bookingWaText)}`}
            >
              Message us on WhatsApp
            </a>
          </div>
        </div>
      );
    }

    // 3. Booking Created — Awaiting Administrator Confirmation
    if (booking) {
      return (
        <div className="panel animate-fade-in" role="status">
          <h2>Booking Request #{booking.id} Received! ⏳</h2>
          <p>
            Your request for <strong>{booking.sizeSummary || `Size ${booking.size}`}</strong>{' '}
            ({booking.totalQuantity || 1} piece{(booking.totalQuantity || 1) > 1 ? 's' : ''}) for{' '}
            <strong>{booking.startDate} to {booking.endDate}</strong> has been submitted.
          </p>
          <div className="booking-deadline-pill">
            <span>📅 Rental Dates: <strong>{booking.startDate} to {booking.endDate}</strong></span>
            <span>⏰ Return Deadline: <strong>{booking.returnDeadline ? booking.returnDeadline.replace('T', ' at ') : `${booking.endDate} at 8:00 PM`}</strong></span>
          </div>

          <div className="deposit-action-card" style={{ marginTop: '1rem', background: '#fcf8ee', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <h4 style={{ margin: '0 0 0.35rem', color: 'var(--maroon)' }}>Next Step: Administrator Review &amp; Confirmation</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-on-paper)', lineHeight: 1.5 }}>
              Our store staff will review your requested dates and inventory. Once confirmed, your 50% deposit (<strong>₹{booking.depositAmount || 0}</strong>) will be unlocked for online payment under <strong>My Account</strong> via Razorpay.
            </p>
            <div className="panel-actions" style={{ marginTop: '0.9rem' }}>
              <Link to="/account" className="btn btn-primary">
                View Booking in My Account
              </Link>
              <a
                className="btn btn-outline"
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(bookingWaText)}`}
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      );
    }

    // 4. Default: Multi-Size & Multi-Piece Booking Form
    return (
      <form className="panel booking-form" onSubmit={submit}>
        <h2>Book this costume</h2>

        {/* Date Range Selection */}
        <div className="form-row">
          <label className="field">
            <span>Rental Start Date</span>
            <input
              type="date"
              min={todayLocal()}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end && e.target.value > end) setEnd('');
              }}
              required
            />
          </label>
          <label className="field">
            <span>Rental End Date</span>
            <input
              type="date"
              min={start || todayLocal()}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </label>
        </div>

        {availError && <p className="form-error">{availError}</p>}

        {/* Multi-Size & Quantity Selection Interface */}
        <div className="size-selector-section">
          <div className="size-selector-header">
            <span>Select Sizes &amp; Quantities</span>
            {!datesReady && <small className="form-hint">Choose dates above to check live stock</small>}
          </div>

          <div className="size-qty-table" role="region" aria-label="Size and quantity selection">
            {sizeOptions.map((sz) => {
              const remaining = datesReady ? remainingFor(sz) : null;
              const isAvailable = remaining === null || remaining > 0;
              const qty = sizeQuantities[sz] || 0;

              return (
                <div
                  key={sz}
                  className={`size-qty-row ${qty > 0 ? 'size-qty-row--selected' : ''} ${!isAvailable ? 'size-qty-row--disabled' : ''}`}
                >
                  <div className="size-qty-row__label">
                    <strong>Size {sz}</strong>
                    {datesReady && (
                      <span className={`stock-indicator ${remaining > 0 ? 'stock-indicator--in' : 'stock-indicator--out'}`}>
                        {remaining > 0 ? `${remaining} in stock` : 'Booked'}
                      </span>
                    )}
                  </div>

                  <div className="size-qty-stepper">
                    <button
                      type="button"
                      className="stepper-btn stepper-btn--minus"
                      onClick={() => updateQuantity(sz, -1)}
                      disabled={qty === 0 || !isAvailable}
                      aria-label={`Decrease quantity for Size ${sz}`}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      max={remaining != null ? remaining : 99}
                      value={qty}
                      onChange={(e) => setDirectQuantity(sz, e.target.value)}
                      disabled={!isAvailable}
                      className="stepper-input"
                      aria-label={`Quantity for Size ${sz}`}
                    />
                    <button
                      type="button"
                      className="stepper-btn stepper-btn--plus"
                      onClick={() => updateQuantity(sz, 1)}
                      disabled={!isAvailable || (remaining != null && qty >= remaining)}
                      aria-label={`Increase quantity for Size ${sz}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {costume.pooled && (
            <p className="form-hint" style={{ marginTop: '0.6rem' }}>
              💡 This design has pooled sizing from {costume.sizeMin}&quot; to {costume.sizeMax}&quot;. You can request pieces across any size within the range.
            </p>
          )}
        </div>

        {/* Selected Pieces Summary Banner */}
        {totalPieces > 0 && (
          <div className="selected-summary-card animate-fade-in">
            <div className="selected-summary-header">
              <span>Selected Breakdown:</span>
              <strong>{totalPieces} piece{totalPieces > 1 ? 's' : ''} total</strong>
            </div>
            <div className="selected-chips">
              {selectedItems.map((item) => (
                <span key={item.size} className="selected-chip">
                  Size {item.size} × {item.quantity}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Measurements & Special Notes */}
        <label className="field">
          <span>Dancer Notes (Ages, heights, specific measurements)</span>
          <textarea
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 2 dancers for arangetram recital, height 5'1 and 5'3"
          />
        </label>

        {/* Real-time Pricing Estimate */}
        {estimate && datesReady && (
          <div className="estimate-box animate-fade-in">
            <div className="estimate-row">
              <span>Costume Rental:</span>
              <span>{totalPieces} piece{totalPieces > 1 ? 's' : ''} × {days} day{days > 1 ? 's' : ''} × ₹{costume.rentPrice}</span>
            </div>
            <div className="estimate-row estimate-row--total">
              <strong>Total Estimated Rental:</strong>
              <strong>₹{estimate}</strong>
            </div>
            <div className="estimate-row estimate-row--deposit">
              <span>Deposit payable now (50%):</span>
              <strong style={{ color: 'var(--gold-dark)' }}>₹{depositAmount}</strong>
            </div>
            <div className="estimate-deadline">
              ⏰ Return Deadline: <strong>{end} by 8:00 PM</strong>
            </div>
          </div>
        )}

        {/* Rental Terms and Conditions section */}
        <div className="terms-container">
          <div className="terms-header">
            <h4>📜 Rental Terms &amp; Conditions</h4>
            <button
              type="button"
              className="terms-toggle-btn"
              onClick={() => setShowTermsDetails(!showTermsDetails)}
              aria-expanded={showTermsDetails}
            >
              {showTermsDetails ? 'Hide details ▲' : 'Read terms ▼'}
            </button>
          </div>

          <div className="terms-summary">
            <ul>
              <li><strong>Standard rental:</strong> ₹650/day per costume (special saree sets: ₹1,500/order).</li>
              <li><strong>Return deadline:</strong> 8:00 PM on the scheduled end date.</li>
              <li><strong>Late penalty:</strong> Flat ₹250 applied if returned past 8:00 PM.</li>
              <li><strong>Damage assessment:</strong> Inspected by administrator; never automatically deducted.</li>
            </ul>
          </div>

          {showTermsDetails && (
            <div className="terms-full-text animate-fade-in">
              <p>By checking the box below, you agree to the complete Natya Vastra Rental Policy:</p>
              <ol>
                <li>Costumes must be returned in the condition received, allowing for normal stage wear.</li>
                <li>Any suspected damage will be documented with photos and discussed before any charge is confirmed.</li>
                <li>Late returns past 8:00 PM incur a ₹250 penalty (total ₹900 for a standard costume).</li>
                <li>Both customers and store staff can raise formal complaint tickets for dispute resolution.</li>
              </ol>
            </div>
          )}

          <label className="terms-checkbox-label">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
            />
            <span>I have reviewed and agree to the <strong>Natya Vastra Rental Policy &amp; Terms</strong></span>
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={submitting || !datesReady || totalPieces === 0}
        >
          {submitting ? 'Holding your costumes…' : `Book ${totalPieces > 0 ? `${totalPieces} Piece${totalPieces > 1 ? 's' : ''}` : 'Costume'}`}
        </button>
      </form>
    );
  };

  return (
    <main className="page costume-detail-page">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link to="/browse">Catalog</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>

        <div className="detail">
          {/* Costume Photograph & Badges */}
          <div className="detail__img-wrap">
            <div className="detail__img">
              <img
                src={assetUrl(costume.src || costume.imagePath)}
                alt={title}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '/assets/images/costume-001.jpg';
                }}
              />
              <button
                type="button"
                className={`heart ${saved ? 'heart--on' : ''}`}
                onClick={onHeart}
                aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                ♥
              </button>
            </div>
            {costume.pooled && (
              <div className="detail__pooled-tag">
                <span>Flexible Pooled Sizing</span>
              </div>
            )}
          </div>

          {/* Costume Specifications & Booking Flow */}
          <div className="detail__info">
            <span className="detail__cat">{costume.categoryName}</span>
            <h1 className="page-title">{title}</h1>
            <p className="detail__price">
              {costume.rentPrice ? `₹${costume.rentPrice} / day` : 'Price on request'}
            </p>

            <div className="detail__desc">
              <p>
                Authentic classical dance attire crafted for stage performances, recitals, and examinations.
                Features traditional zari embellishments, pleated fan borders, and reinforced stitching.
              </p>
            </div>

            <div className="detail__spec-chips">
              <span className="spec-chip">
                📏 {costume.pooled ? `Sizes ${costume.sizeMin}″ to ${costume.sizeMax}″` : `Available sizes: ${sizeOptions.join(', ')}″`}
              </span>
              <span className="spec-chip">
                ✨ Condition: Inspected &amp; Sanitized
              </span>
            </div>

            {renderPanel()}
          </div>
        </div>
      </div>
    </main>
  );
}
