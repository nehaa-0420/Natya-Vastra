import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  assetUrl, cancelBooking, getMyBookings, getWishlist,
  getMyComplaints, getMyDamageReports, submitComplaint, respondDamageReport
} from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import CostumeCard from '../components/CostumeCard.jsx';
import { payDeposit } from '../lib/razorpay.js';

const todayLocal = () => new Date().toLocaleDateString('en-CA');

const COMPLAINT_CATEGORIES = [
  { id: 'late_return_fee', label: 'Late-return fee' },
  { id: 'damage_report', label: 'Damage report' },
  { id: 'payment', label: 'Payment issue' },
  { id: 'booking_cancellation', label: 'Booking or cancellation' },
  { id: 'missing_item', label: 'Missing costume or accessory' },
  { id: 'delivery_collection', label: 'Delivery or collection' },
  { id: 'website_problem', label: 'Website problem' },
  { id: 'other', label: 'Other rental issue' }
];

export default function AccountPage() {
  const { user, ready, wishlist } = useAuth();
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState(null);
  const [saved, setSaved] = useState(null);
  const [complaints, setComplaints] = useState(null);
  const [damageReports, setDamageReports] = useState(null);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState(null);

  // Complaint form state
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [compCategory, setCompCategory] = useState('late_return_fee');
  const [compSubject, setCompSubject] = useState('');
  const [compDesc, setCompDesc] = useState('');
  const [compFile, setCompFile] = useState(null);
  const [compPhone, setCompPhone] = useState('');
  const [compEmail, setCompEmail] = useState('');
  const [submittingComp, setSubmittingComp] = useState(false);
  const [compSuccess, setCompSuccess] = useState(null);

  // Damage report dispute modal/state
  const [disputeReportId, setDisputeReportId] = useState(null);
  const [disputeText, setDisputeText] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyBookings().then(setBookings).catch((e) => setError(e.message));
    getMyComplaints().then(setComplaints).catch(() => {});
    getMyDamageReports().then(setDamageReports).catch(() => {});
    setCompPhone(user.phone || '');
    setCompEmail(user.email || '');
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

  const pay = async (b) => {
    setError('');
    setPayingId(b.id);
    try {
      const updated = await payDeposit(b.id);
      setBookings((list) => list.map((x) => (x.id === b.id ? updated : x)));
    } catch (e) {
      setError(e.message);
      getMyBookings().then(setBookings).catch(() => {});
    } finally {
      setPayingId(null);
    }
  };

  const openComplaintForBooking = (b) => {
    setSelectedBookingId(String(b.id));
    setCompSubject(`Issue with Booking #${b.id} (${b.costumeName})`);
    setTab('report_problem');
  };

  const handleComplaintSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCompSuccess(null);
    setSubmittingComp(true);

    try {
      const fd = new FormData();
      if (selectedBookingId) fd.append('bookingId', selectedBookingId);
      fd.append('category', compCategory);
      fd.append('subject', compSubject);
      fd.append('description', compDesc);
      fd.append('contactPhone', compPhone);
      fd.append('contactEmail', compEmail);
      if (compFile) fd.append('attachment', compFile);

      const created = await submitComplaint(fd);
      setCompSuccess(created);
      setCompSubject('');
      setCompDesc('');
      setCompFile(null);
      // Refresh list
      getMyComplaints().then(setComplaints).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingComp(false);
    }
  };

  const handleDisputeSubmit = async (reportId) => {
    if (!disputeText.trim()) return;
    setSubmittingDispute(true);
    try {
      await respondDamageReport(reportId, disputeText);
      setDisputeReportId(null);
      setDisputeText('');
      getMyDamageReports().then(setDamageReports).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingDispute(false);
    }
  };

  return (
    <main className="page">
      <div className="container">
        <h1 className="page-title">Hello, {user.name.split(' ')[0]}</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'bookings'} className={tab === 'bookings' ? 'on' : ''} onClick={() => setTab('bookings')}>
            My bookings{bookings ? ` (${bookings.length})` : ''}
          </button>
          <button role="tab" aria-selected={tab === 'complaints'} className={tab === 'complaints' ? 'on' : ''} onClick={() => setTab('complaints')}>
            My complaints{complaints ? ` (${complaints.length})` : ''}
          </button>
          <button role="tab" aria-selected={tab === 'damage_reports'} className={tab === 'damage_reports' ? 'on' : ''} onClick={() => setTab('damage_reports')}>
            Damage reports{damageReports ? ` (${damageReports.length})` : ''}
          </button>
          <button role="tab" aria-selected={tab === 'report_problem'} className={tab === 'report_problem' ? 'on' : ''} onClick={() => setTab('report_problem')}>
            Report a problem
          </button>
          <button role="tab" aria-selected={tab === 'wishlist'} className={tab === 'wishlist' ? 'on' : ''} onClick={() => setTab('wishlist')}>
            Wishlist{saved ? ` (${saved.length})` : ''}
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}

        {/* ── Tab: My Bookings ──────────────────────────────── */}
        {tab === 'bookings' && (
          bookings === null ? <p>Loading…</p> :
          bookings.length === 0
            ? <p className="empty">You have no bookings yet. <Link to="/browse">Browse costumes</Link> and pick your dates.</p>
            : (
              <ul className="booking-list">
                {bookings.map((b) => (
                  <li key={b.id} className="booking-card-pro">
                    <div className="booking-card-pro__header">
                      <div className="booking-card-pro__header-left">
                        <span className="booking-card-pro__ref">Booking #{b.id}</span>
                        <h3 className="booking-card-pro__title">
                          <Link to={`/costumes/${b.costumeId}`}>{b.costumeName}</Link>
                        </h3>
                      </div>
                      <div className="booking-card-pro__header-right">
                        <span className={`badge badge--${b.status}`}>{b.status}</span>
                        {['pending', 'confirmed'].includes(b.status) && b.startDate >= todayLocal() && (
                          <button className="link-btn booking-card-pro__cancel" onClick={() => cancel(b)}>Cancel</button>
                        )}
                      </div>
                    </div>

                    <div className="booking-card-pro__body">
                      <img
                        src={assetUrl(b.src)}
                        alt={b.costumeName}
                        className="booking-card-pro__image"
                        onError={(e) => { e.currentTarget.src = '/assets/images/costume-001.jpg'; }}
                      />
                      <div className="booking-card-pro__details">
                        <div className="booking-card-pro__meta-grid">
                          <div className="booking-card-pro__meta-item">
                            <span className="meta-label">Costume Details:</span>
                            <strong>{b.sizeSummary || `Size ${b.size}`}</strong> ({b.totalQuantity || 1} piece{(b.totalQuantity || 1) > 1 ? 's' : ''})
                          </div>
                          <div className="booking-card-pro__meta-item">
                            <span className="meta-label">Rental Duration:</span>
                            <span>📅 {b.startDate} to {b.endDate} (<strong>{b.days} day{b.days > 1 ? 's' : ''}</strong>)</span>
                          </div>
                          <div className="booking-card-pro__meta-item">
                            <span className="meta-label">Return Deadline:</span>
                            <span>⏰ {b.returnDeadline ? b.returnDeadline.replace('T', ' by ') : `${b.endDate} by 8:00 PM`}</span>
                          </div>
                          {b.actualReturnTime && (
                            <div className="booking-card-pro__meta-item">
                              <span className="meta-label">Recorded Return:</span>
                              <span>{b.actualReturnTime.replace('T', ' at ')}</span>
                            </div>
                          )}
                        </div>

                        {b.items && b.items.length > 1 && (
                          <div className="selected-chips" style={{ margin: '0.4rem 0' }}>
                            {b.items.map((it) => (
                              <span key={it.size} className="selected-chip" style={{ fontSize: '0.78rem', padding: '0.15rem 0.55rem' }}>
                                Size {it.size} × {it.quantity}
                              </span>
                            ))}
                          </div>
                        )}

                        {b.isLate && (
                          <div className="late-fee-pill" style={{ margin: '0.4rem 0' }}>
                            ⚠️ <strong>Returned late:</strong> ₹250 penalty recorded (Rental ₹{b.rentalPrice || 650} + Penalty ₹250 = Total ₹{b.totalAmount || 900})
                          </div>
                        )}

                        {b.damageCharge > 0 && (
                          <p style={{ color: '#b7791f', fontSize: '0.88rem', margin: '0.3rem 0' }}>
                            Approved damage charge: ₹{b.damageCharge}
                          </p>
                        )}

                        {b.notes && <p className="booking__notes" style={{ margin: '0.4rem 0', color: 'var(--text-muted)' }}>&ldquo;{b.notes}&rdquo;</p>}
                      </div>
                    </div>

                    {/* Deposit / Payment Status & Action */}
                    {b.status === 'confirmed' && b.depositStatus !== 'paid' && (b.depositAmount || b.rentalPrice) && (
                      <div className="booking-payment-box animate-fade-in">
                        <div className="booking-payment-box__info">
                          <span className="badge badge--ok" style={{ marginBottom: '0.35rem', display: 'inline-block' }}>✓ Confirmed by Store Admin</span>
                          <div className="booking-payment-box__amount">
                            50% Deposit Due: ₹{b.depositAmount || Math.ceil((b.rentalPrice || 650) / 2)}
                          </div>
                          <small className="booking-payment-box__breakdown">
                            Total rental: ₹{b.estimatedTotal || b.rentalPrice || 650} ({b.totalQuantity || 1} piece(s) × {b.days} day(s)) · Balance ₹{(b.estimatedTotal || b.rentalPrice || 650) - (b.depositAmount || Math.ceil((b.rentalPrice || 650) / 2))} payable at pickup
                          </small>
                        </div>
                        <div className="booking-payment-box__action">
                          <button
                            type="button"
                            className="btn btn-primary btn-pay-now"
                            disabled={payingId === b.id}
                            onClick={() => pay(b)}
                          >
                            {payingId === b.id ? 'Opening Checkout…' : `💳 Pay ₹${b.depositAmount || Math.ceil((b.rentalPrice || 650) / 2)} Now`}
                          </button>
                        </div>
                        {b.depositStatus === 'failed' && (
                          <p className="form-error booking-payment-box__error">
                            Previous payment attempt was cancelled or interrupted. Click Pay Now above to complete payment.
                          </p>
                        )}
                      </div>
                    )}

                    {b.depositStatus === 'paid' && (
                      <div className="booking-paid-box">
                        ✓ <strong>50% Deposit (₹{b.depositAmount || Math.ceil((b.rentalPrice || 650) / 2)}) Paid & Verified</strong> · Balance ₹{(b.totalAmount || b.estimatedTotal || b.rentalPrice || 650) - (b.depositAmount || Math.ceil((b.rentalPrice || 650) / 2))} payable upon costume pickup
                      </div>
                    )}

                    {b.status === 'pending' && (
                      <div className="booking-pending-box">
                        <span style={{ fontWeight: 600, color: '#92400e' }}>⏳ Request Under Review</span>
                        <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                          Awaiting administrator confirmation. Online 50% deposit payment{b.depositAmount ? ` (₹${b.depositAmount})` : ''} will unlock here as soon as our store confirms your booking.
                        </p>
                      </div>
                    )}

                    <div className="booking-card-pro__footer">
                      <button className="link-btn" style={{ fontSize: '0.82rem', color: '#c53030' }} onClick={() => openComplaintForBooking(b)}>
                        ⚠️ Report problem with this booking
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
        )}

        {/* ── Tab: My Complaints ────────────────────────────── */}
        {tab === 'complaints' && (
          complaints === null ? <p>Loading complaints…</p> :
          complaints.length === 0
            ? <div className="empty-card">
                <p>You have not submitted any complaints or problem reports.</p>
                <button className="btn btn-outline" onClick={() => setTab('report_problem')}>Submit a report</button>
              </div>
            : (
              <ul className="complaint-list">
                {complaints.map((c) => (
                  <li key={c.complaintRef} className="complaint-card">
                    <div className="complaint-card__header">
                      <div>
                        <span className="complaint-ref">{c.complaintRef}</span>
                        {c.bookingRef && <span className="complaint-booking">Booking {c.bookingRef}</span>}
                        <span className="complaint-cat-chip">{c.category.replace(/_/g, ' ')}</span>
                      </div>
                      <span className={`badge badge--${c.status.toLowerCase()}`}>{c.status}</span>
                    </div>

                    <h3 className="complaint-subject">{c.subject}</h3>
                    <p className="complaint-desc">{c.description}</p>
                    {c.attachmentUrl && (
                      <p className="complaint-attachment">
                        📎 <a href={assetUrl(c.attachmentUrl)} target="_blank" rel="noreferrer">View attached evidence</a>
                      </p>
                    )}

                    {c.adminResponse && (
                      <div className="admin-response-box">
                        <strong>Shop Response:</strong>
                        <p>{c.adminResponse}</p>
                      </div>
                    )}

                    {c.resolution && (
                      <div className="resolution-box">
                        <strong>Resolution:</strong> {c.resolution}
                        {c.actionTaken && <span> · Action taken: {c.actionTaken}</span>}
                      </div>
                    )}

                    <div className="complaint-card__footer">
                      <small>Submitted on {new Date(c.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )
        )}

        {/* ── Tab: Damage Reports ───────────────────────────── */}
        {tab === 'damage_reports' && (
          damageReports === null ? <p>Loading damage reports…</p> :
          damageReports.length === 0
            ? <p className="empty">No damage reports on file for your account.</p>
            : (
              <ul className="damage-report-list">
                {damageReports.map((dr) => (
                  <li key={dr.reportRef} className="damage-card">
                    <div className="damage-card__header">
                      <div>
                        <span className="complaint-ref">{dr.reportRef}</span>
                        <span className="complaint-booking">Booking {dr.bookingRef}</span>
                      </div>
                      <span className={`badge badge--${dr.status.toLowerCase()}`}>{dr.status}</span>
                    </div>

                    <h3>{dr.costumeName} &middot; Condition: <em>{dr.condition.replace(/_/g, ' ')}</em></h3>
                    <p>{dr.description}</p>

                    <div className="proposed-charge-callout">
                      <strong>Proposed Assessment: &#8377;{dr.proposedCharge}</strong>
                      <small>(This is a proposed charge for review, not an automatic deduction.)</small>
                    </div>

                    {dr.evidencePhotos && dr.evidencePhotos.length > 0 && (
                      <div className="evidence-grid">
                        {dr.evidencePhotos.map((p, idx) => (
                          <a key={idx} href={assetUrl(p)} target="_blank" rel="noreferrer">
                            <img src={assetUrl(p)} alt="Damage evidence" className="evidence-thumb" />
                          </a>
                        ))}
                      </div>
                    )}

                    {dr.customerResponse ? (
                      <div className="admin-response-box" style={{ borderColor: '#3182ce' }}>
                        <strong>Your Response / Remarks:</strong>
                        <p>{dr.customerResponse}</p>
                      </div>
                    ) : (
                      <div style={{ marginTop: '1rem' }}>
                        {disputeReportId === dr.reportRef ? (
                          <div className="dispute-form">
                            <textarea
                              rows={3}
                              placeholder="Explain your perspective or provide details if you disagree with this assessment…"
                              value={disputeText}
                              onChange={(e) => setDisputeText(e.target.value)}
                            />
                            <div className="panel-actions">
                              <button
                                className="btn btn-primary"
                                disabled={submittingDispute || !disputeText.trim()}
                                onClick={() => handleDisputeSubmit(dr.reportRef)}
                              >
                                {submittingDispute ? 'Submitting…' : 'Submit remarks'}
                              </button>
                              <button className="btn btn-outline" onClick={() => setDisputeReportId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className="link-btn" onClick={() => { setDisputeReportId(dr.reportRef); setDisputeText(''); }}>
                            💬 Disagree or have questions? Submit response
                          </button>
                        )}
                      </div>
                    )}

                    <div className="complaint-card__footer" style={{ marginTop: '1rem' }}>
                      <small>Inspected by administrator on {dr.inspectionDate}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )
        )}

        {/* ── Tab: Report a Problem / Complaint Form ────────── */}
        {tab === 'report_problem' && (
          <div className="complaint-form-wrapper">
            <h2>Report a Problem / Submit a Complaint</h2>
            <p className="form-hint">
              Have an issue with a booking, late return fee, payment, or costume damage?
              Let us know and our store manager will review it promptly.
            </p>

            {compSuccess && (
              <div className="panel panel--ok" role="status">
                <h3>Complaint Received ✅</h3>
                <p>
                  Your reference number is <strong>{compSuccess.complaintRef}</strong>.
                  A confirmation email has been dispatched. You can track this under &ldquo;My complaints&rdquo;.
                </p>
                <button className="btn btn-primary" onClick={() => { setCompSuccess(null); setTab('complaints'); }}>
                  View my complaints
                </button>
              </div>
            )}

            {!compSuccess && (
              <form className="panel" onSubmit={handleComplaintSubmit}>
                <label className="field">
                  <span>Related booking (optional)</span>
                  <select value={selectedBookingId} onChange={(e) => setSelectedBookingId(e.target.value)}>
                    <option value="">General issue / No booking</option>
                    {bookings && bookings.map((b) => (
                      <option key={b.id} value={b.id}>
                        Booking #{b.id} — {b.costumeName} ({b.startDate} to {b.endDate})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Category</span>
                  <select value={compCategory} onChange={(e) => setCompCategory(e.target.value)} required>
                    {COMPLAINT_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Subject</span>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    placeholder="Brief summary of the problem"
                    value={compSubject}
                    onChange={(e) => setCompSubject(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Detailed description</span>
                  <textarea
                    rows={4}
                    required
                    maxLength={3000}
                    placeholder="Describe what occurred, dates, return details or dispute reason in detail…"
                    value={compDesc}
                    onChange={(e) => setCompDesc(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Supporting photo or attachment (optional, max 5 MB)</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => setCompFile(e.target.files[0] || null)}
                  />
                  <small className="form-hint">Accepted formats: JPG, PNG, WebP images or PDF document.</small>
                </label>

                <div className="form-row">
                  <label className="field">
                    <span>Contact Phone</span>
                    <input
                      type="tel"
                      value={compPhone}
                      onChange={(e) => setCompPhone(e.target.value)}
                      placeholder="Your phone / WhatsApp"
                    />
                  </label>
                  <label className="field">
                    <span>Contact Email</span>
                    <input
                      type="email"
                      required
                      value={compEmail}
                      onChange={(e) => setCompEmail(e.target.value)}
                    />
                  </label>
                </div>

                <button className="btn btn-primary" disabled={submittingComp}>
                  {submittingComp ? 'Submitting…' : 'Submit complaint'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Tab: Wishlist ─────────────────────────────────── */}
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
