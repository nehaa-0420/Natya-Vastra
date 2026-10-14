import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  adminBookings, adminCostumes, adminCreateCostume, adminEnquiries, adminSetBookingStatus,
  adminStats, adminUpdateCostume, assetUrl, getCategories,
  adminGetBookingInspection, adminSaveInspection, adminSubmitDamageReport,
  adminCorrectPenalty, adminGetComplaints, adminGetComplaint, adminAddComplaintNote,
  adminUpdateComplaint, adminRetryComplaintEmail, adminGetDamageReports,
  adminRetryDamageReportEmail, adminUploadEvidence
} from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { costumeTitle } from '../components/CostumeCard.jsx';

const STATUSES = ['pending', 'confirmed', 'returned', 'cancelled'];
const COMPLAINT_STATUSES = ['OPEN', 'IN_REVIEW', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'];
const COMPLAINT_CATEGORIES = [
  'late_return_fee', 'damage_report', 'payment', 'booking_cancellation',
  'missing_item', 'delivery_collection', 'website_problem', 'other'
];

const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
};

export default function AdminPage() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState('bookings');
  const [stats, setStats] = useState(null);
  const [inspectBooking, setInspectBooking] = useState(null);

  const refreshStats = useCallback(() => adminStats().then(setStats).catch(() => {}), []);
  useEffect(() => { if (user?.role === 'admin') refreshStats(); }, [user, refreshStats]);

  if (!ready) return <main className="page"><div className="container"><p>Loading…</p></div></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: { pathname: '/admin' } }} />;
  if (user.role !== 'admin') {
    return <main className="page"><div className="container"><p className="form-error">This page is for the shop admin only.</p></div></main>;
  }

  const cards = stats && [
    { label: 'Pending bookings', value: stats.pendingBookings, icon: '⏳', badge: stats.pendingBookings > 0 ? 'Needs Review' : null, alert: stats.pendingBookings > 0 },
    { label: 'Confirmed bookings', value: stats.confirmedBookings, icon: '📅', badge: null, alert: false },
    { label: 'Open complaints', value: stats.openComplaints || 0, icon: '⚠️', badge: (stats.openComplaints || 0) > 0 ? 'Urgent' : null, alert: (stats.openComplaints || 0) > 0 },
    { label: 'Damage reports', value: stats.damageReports || 0, icon: '🛡️', badge: null, alert: false },
    { label: 'Costumes listed', value: stats.costumes, icon: '👗', badge: null, alert: false },
    { label: 'Registered customers', value: stats.customers, icon: '👥', badge: null, alert: false },
    { label: 'Customer enquiries', value: stats.enquiries, icon: '💬', badge: null, alert: false }
  ];

  return (
    <main className="page">
      <div className="container">
        <h1 className="page-title">Shop dashboard</h1>
        {cards && (
          <div className="stat-grid-pro">
            {cards.map((c) => (
              <div className={`stat-card-pro ${c.alert ? 'stat-card-pro--alert' : ''}`} key={c.label}>
                <div className="stat-card-pro__top">
                  <span className="stat-card-pro__icon" aria-hidden="true">{c.icon}</span>
                  {c.badge && <span className="stat-card-pro__badge">{c.badge}</span>}
                </div>
                <strong className="stat-card-pro__value">{c.value}</strong>
                <span className="stat-card-pro__label">{c.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="tabs" role="tablist">
          {[
            ['bookings', 'Bookings'],
            ['complaints', `Complaints & Reports${stats?.openComplaints ? ` (${stats.openComplaints})` : ''}`],
            ['damage_reports', `Damage reports${stats?.damageReports ? ` (${stats.damageReports})` : ''}`],
            ['costumes', 'Costumes & stock'],
            ['enquiries', 'Enquiries']
          ].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'bookings' && <BookingsTab onInspect={(b) => setInspectBooking(b)} onChange={refreshStats} />}
        {tab === 'complaints' && <ComplaintsTab onUpdate={refreshStats} />}
        {tab === 'damage_reports' && <DamageReportsTab onUpdate={refreshStats} />}
        {tab === 'costumes' && <CostumesTab onChange={refreshStats} />}
        {tab === 'enquiries' && <EnquiriesTab />}

        {inspectBooking && (
          <InspectionModal
            booking={inspectBooking}
            onClose={() => setInspectBooking(null)}
            onSaved={() => { setInspectBooking(null); refreshStats(); }}
          />
        )}
      </div>
    </main>
  );
}

// ── Bookings Tab ──────────────────────────────────────────────────────────

function BookingsTab({ onInspect, onChange }) {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setRows(null);
    adminBookings(status).then(setRows).catch((e) => setError(e.message));
  }, [status]);

  useEffect(() => { load(); }, [load]);

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
        <label className="filters__field"><span>Filter by Status</span>
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
            <thead>
              <tr>
                <th>Costume</th>
                <th>Customer</th>
                <th>Sizes &amp; Pieces</th>
                <th>Dates &amp; Deadline</th>
                <th>Deposit &amp; Fees</th>
                <th>Status</th>
                <th>Return Inspection</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div className="cell-costume">
                      <img src={assetUrl(b.src)} alt="" />
                      <div>
                        <strong>{b.costumeName}</strong>
                        <small>Booking #{b.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div><strong>{b.user.name}</strong></div>
                    <small>{b.user.email}</small>
                    {b.user.phone && (
                      <div>
                        <small>
                          <a href={waLink(b.user.phone)} target="_blank" rel="noreferrer" style={{ color: '#0F4C4A', fontWeight: 500 }}>
                            💬 {b.user.phone}
                          </a>
                        </small>
                      </div>
                    )}
                  </td>
                  <td>
                    <div><strong>{b.sizeSummary || `Size ${b.size}`}</strong></div>
                    <span className="badge" style={{ marginTop: '0.25rem', background: '#F1E9DA' }}>
                      {b.totalQuantity || 1} piece{(b.totalQuantity || 1) > 1 ? 's' : ''}
                    </span>
                  </td>
                  <td>
                    <div>{b.startDate} → {b.endDate}</div>
                    <small>Return Due: {b.returnDeadline ? b.returnDeadline.slice(0, 16).replace('T', ' at ') : `${b.endDate} 20:00`}</small>
                    {b.actualReturnTime && (
                      <div style={{ marginTop: '0.2rem' }}>
                        <small style={{ color: b.isLate ? '#b71c1c' : '#1b5e20', fontWeight: 600 }}>
                          {b.isLate ? '⚠️ Returned Late:' : '✓ Returned:'} {b.actualReturnTime.slice(0, 16).replace('T', ' ')}
                        </small>
                      </div>
                    )}
                  </td>
                  <td>
                    {b.depositStatus === 'paid' && <span className="badge badge--ok">Deposit Paid</span>}
                    {b.depositStatus === 'awaiting' && <span className="badge badge--pending">Deposit Awaiting</span>}
                    {b.depositStatus === 'failed' && <span className="badge badge--cancelled">Deposit Failed</span>}
                    {b.isLate && (
                      <div><span className="badge badge--cancelled" style={{ marginTop: '0.25rem' }}>+ ₹250 Late Fee</span></div>
                    )}
                    {b.totalAmount ? <div style={{ marginTop: '0.25rem' }}><small><strong>Total: ₹{b.totalAmount}</strong></small></div> : null}
                  </td>
                  <td>
                    <select
                      aria-label={`Status of booking ${b.id}`}
                      className={`status-select badge--${b.status}`}
                      value={b.status}
                      onChange={(e) => change(b, e.target.value)}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => onInspect(b)}>
                      {b.status === 'returned' ? '📋 View / Edit Inspection' : '🔍 Inspect Return'}
                    </button>
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

// ── Costume Return Inspection Modal ───────────────────────────────────────

function InspectionModal({ booking, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingDmg, setSubmittingDmg] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable fields
  const [actualTime, setActualTime] = useState('');
  const [condition, setCondition] = useState('good');
  const [damageDesc, setDamageDesc] = useState('');
  const [proposedCharge, setProposedCharge] = useState(0);
  const [approvedCharge, setApprovedCharge] = useState(0);
  const [adminNotes, setAdminNotes] = useState('');
  const [inspectionStatus, setInspectionStatus] = useState('completed');
  const [evidencePhotos, setEvidencePhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Track pieces returned per size: { [size]: number }
  const [returnedCounts, setReturnedCounts] = useState({});

  // Penalty manual waiver / correction state
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionPenalty, setCorrectionPenalty] = useState(0);
  const [correctionReason, setCorrectionReason] = useState('');

  useEffect(() => {
    adminGetBookingInspection(booking.id)
      .then((insp) => {
        setData(insp);
        const nowLocal = new Date().toISOString().slice(0, 16);
        setActualTime(insp.actualReturnTime ? insp.actualReturnTime.slice(0, 16) : nowLocal);
        setCondition(insp.costumeCondition || 'good');
        setDamageDesc(insp.damageDescription || '');
        setProposedCharge(insp.proposedDamageCharge || 0);
        setApprovedCharge(insp.approvedDamageCharge || 0);
        setAdminNotes(insp.adminNotes || '');
        setInspectionStatus(insp.inspectionStatus || 'completed');
        setEvidencePhotos(insp.evidencePhotos || []);
        setCorrectionPenalty(insp.latePenalty || 0);

        // Initialize returned counts per size
        const initialCounts = {};
        if (insp.items && insp.items.length) {
          insp.items.forEach((item) => {
            initialCounts[item.size] = item.returnedQuantity != null ? item.returnedQuantity : item.quantity;
          });
        }
        setReturnedCounts(initialCounts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [booking.id]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('evidence', file);
      const res = await adminUploadEvidence(fd);
      setEvidencePhotos((prev) => [...prev, res.url]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      // Build items array with returnedQuantity
      const updatedItems = (data?.items || []).map((i) => ({
        size: i.size,
        quantity: i.quantity,
        returnedQuantity: returnedCounts[i.size] != null ? Number(returnedCounts[i.size]) : i.quantity
      }));

      const saved = await adminSaveInspection({
        bookingId: booking.id,
        actualReturnTime: actualTime ? `${actualTime}:00` : null,
        costumeCondition: condition,
        damageDescription: damageDesc,
        evidencePhotos,
        proposedDamageCharge: Number(proposedCharge) || 0,
        approvedDamageCharge: Number(approvedCharge) || 0,
        adminNotes,
        inspectionStatus,
        items: updatedItems
      });
      setData(saved);
      setSuccess('Inspection saved successfully.');
      setTimeout(() => onSaved(), 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitDamageReport = async () => {
    if (!data?._id && !data?.bookingId) return;
    if (condition === 'good') {
      if (!window.confirm('Condition is set to "good". Submit damage report anyway?')) return;
    }
    setSubmittingDmg(true);
    setError('');
    try {
      const idToUse = data._id || data.bookingId;
      const rep = await adminSubmitDamageReport(idToUse, {
        description: damageDesc || 'Damage recorded during costume return.',
        proposedCharge: Number(proposedCharge) || 0
      });
      setSuccess(`Damage report ${rep.reportRef} submitted and dispatched to customer!`);
      setData((prev) => ({ ...prev, damageReportSubmitted: true, damageReportRef: rep.reportRef }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingDmg(false);
    }
  };

  const handleCorrectPenalty = async () => {
    if (!correctionReason.trim()) {
      return setError('Reason is required to correct penalty for audit log.');
    }
    setError('');
    try {
      const idToUse = data._id || data.bookingId;
      const updated = await adminCorrectPenalty(idToUse, {
        newPenalty: Number(correctionPenalty) || 0,
        actualReturnTime: actualTime ? `${actualTime}:00` : null,
        reason: correctionReason
      });
      setData(updated);
      setShowCorrection(false);
      setSuccess('Late fee corrected and audit record logged.');
    } catch (err) {
      setError(err.message);
    }
  };

  // Financial calculations
  const baseRental = data?.originalRentalPrice || (booking.rentalPrice || 650);
  const lateFee = Number(data?.latePenalty || 0);
  const dmgFee = Number(approvedCharge || 0);
  const calculatedTotal = baseRental + lateFee + dmgFee;
  const depositPaid = booking.depositStatus === 'paid' ? (booking.depositAmount || Math.ceil(baseRental / 2)) : 0;
  const balanceRemaining = Math.max(0, calculatedTotal - depositPaid);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card inspection-modal-pro" onClick={(e) => e.stopPropagation()}>
        {/* Sticky Header */}
        <div className="modal-header">
          <div>
            <h2>Costume Return Inspection</h2>
            <span className="modal-header-sub">Booking #{booking.id} · {data?.customerName || booking.user?.name}</span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">&times;</button>
        </div>

        {loading ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <p>Loading inspection record…</p>
          </div>
        ) : (
          <div className="modal-body inspection-modal-body">
            {error && <p className="form-error" role="alert">{error}</p>}
            {success && <p className="form-success" role="status">{success}</p>}

            {/* SECTION 1: BOOKING SUMMARY */}
            <div className="inspection-section">
              <div className="inspection-section-title">
                <span className="section-step-num">1</span>
                <h3>Booking Summary</h3>
              </div>
              <div className="inspection-summary-card">
                <div className="summary-col">
                  <div className="summary-field">
                    <span className="summary-field-label">Customer Details</span>
                    <strong>{data?.customerName || booking.user?.name}</strong>
                    <small>{data?.customerEmail || booking.user?.email}</small>
                    {data?.customerPhone && (
                      <small><a href={waLink(data.customerPhone)} target="_blank" rel="noreferrer" style={{ color: '#0F4C4A' }}>💬 {data.customerPhone}</a></small>
                    )}
                  </div>
                  <div className="summary-field" style={{ marginTop: '0.6rem' }}>
                    <span className="summary-field-label">Costume Design</span>
                    <strong>{data?.costumeName || booking.costumeName}</strong>
                    <small>Total pieces: {data?.costumeQuantity || 1} item(s)</small>
                  </div>
                </div>

                <div className="summary-col">
                  <div className="summary-field">
                    <span className="summary-field-label">Scheduled Rental Period</span>
                    <strong>{booking.startDate} → {booking.endDate}</strong>
                    <small>Agreed Return Deadline: <strong>{data?.expectedReturnTime ? data.expectedReturnTime.replace('T', ' at ') : `${booking.endDate} at 8:00 PM`}</strong></small>
                  </div>
                  <div className="summary-field" style={{ marginTop: '0.6rem' }}>
                    <span className="summary-field-label">Deposit Status</span>
                    <span className={`badge badge--${booking.depositStatus === 'paid' ? 'ok' : 'pending'}`}>
                      {booking.depositStatus === 'paid' ? `Paid (₹${depositPaid})` : 'Awaiting Payment'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Multi-piece items breakdown table */}
              {data?.items && data.items.length > 0 && (
                <div className="inspection-items-table-wrap">
                  <span className="summary-field-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
                    Items &amp; Quantities in this Booking:
                  </span>
                  <table className="inspection-items-table">
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th>Issued Qty</th>
                        <th>Returned Qty</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => {
                        const retCount = returnedCounts[item.size] != null ? returnedCounts[item.size] : item.quantity;
                        const isAllReturned = retCount >= item.quantity;
                        return (
                          <tr key={item.size}>
                            <td><strong>Size {item.size}</strong></td>
                            <td>{item.quantity} piece{item.quantity > 1 ? 's' : ''}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max={item.quantity}
                                value={retCount}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(item.quantity, parseInt(e.target.value, 10) || 0));
                                  setReturnedCounts((prev) => ({ ...prev, [item.size]: val }));
                                }}
                                className="item-return-input"
                              />
                            </td>
                            <td>
                              <span className={`badge ${isAllReturned ? 'badge--ok' : 'badge--pending'}`}>
                                {isAllReturned ? 'All Returned' : `${item.quantity - retCount} Missing/Pending`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SECTION 2: RETURN DETAILS */}
            <div className="inspection-section">
              <div className="inspection-section-title">
                <span className="section-step-num">2</span>
                <h3>Return Details &amp; Timeliness</h3>
              </div>

              <div className="form-row">
                <label className="field">
                  <span>Actual Return Date &amp; Time</span>
                  <input
                    type="datetime-local"
                    value={actualTime}
                    onChange={(e) => setActualTime(e.target.value)}
                    required
                  />
                  <small className="form-hint">Standard shop return deadline is 8:00 PM on the scheduled end date.</small>
                </label>

                <div className="field">
                  <span>Return Timeliness &amp; Automatic Late Fee</span>
                  <div className={`return-status-pill ${data?.isLate ? 'return-status-pill--late' : 'return-status-pill--ontime'}`}>
                    <span className="status-icon">{data?.isLate ? '⚠️' : '✓'}</span>
                    <div>
                      <strong>{data?.isLate ? 'Returned Late (After 8:00 PM)' : 'Returned On Time'}</strong>
                      <div>
                        {data?.isLate
                          ? `₹${data.latePenalty || 250} flat late penalty applied per policy`
                          : '₹0 late fee incurred'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Late penalty manual waiver / correction */}
              <div className="penalty-correction-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <small>Need to waive or adjust the late penalty for special store circumstances?</small>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setShowCorrection(!showCorrection)}
                  >
                    {showCorrection ? 'Hide correction form' : '✏️ Adjust late penalty & audit log'}
                  </button>
                </div>

                {showCorrection && (
                  <div className="correction-form-card animate-fade-in">
                    <div className="form-row">
                      <label className="field">
                        <span>Adjusted Penalty Amount (₹)</span>
                        <input
                          type="number"
                          min="0"
                          value={correctionPenalty}
                          onChange={(e) => setCorrectionPenalty(e.target.value)}
                        />
                      </label>
                      <label className="field" style={{ flex: 2 }}>
                        <span>Staff Audit Reason (Required)</span>
                        <input
                          type="text"
                          placeholder="e.g. Flight delay verified / Shop closed early on Diwali"
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          required
                        />
                      </label>
                    </div>
                    <button type="button" className="btn btn-sm btn-primary" onClick={handleCorrectPenalty} style={{ alignSelf: 'flex-start' }}>
                      Save Penalty Adjustment
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: DAMAGE ASSESSMENT */}
            <div className="inspection-section">
              <div className="inspection-section-title">
                <span className="section-step-num">3</span>
                <h3>Damage Assessment &amp; Condition</h3>
              </div>

              <div className="form-row">
                <label className="field">
                  <span>Overall Costume Condition</span>
                  <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                    <option value="good">Good (Normal stage wear &amp; tear)</option>
                    <option value="minor_damage">Minor damage (Small seam tear, light washable stain)</option>
                    <option value="major_damage">Major damage (Heavy tear, zari unravel, fabric burn)</option>
                    <option value="missing_parts">Missing accessories / parts / bells</option>
                    <option value="other">Other issue observed</option>
                  </select>
                </label>

                <label className="field">
                  <span>Supporting Evidence Photos</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                  />
                  {uploading && <small>Uploading evidence photo…</small>}
                </label>
              </div>

              {evidencePhotos.length > 0 && (
                <div className="evidence-preview-row">
                  {evidencePhotos.map((url, i) => (
                    <div key={i} className="evidence-thumb-wrap">
                      <img src={assetUrl(url)} alt="Damage Evidence" className="evidence-thumb" />
                    </div>
                  ))}
                </div>
              )}

              <label className="field" style={{ marginTop: '0.6rem' }}>
                <span>Damage &amp; Defect Description</span>
                <textarea
                  rows={2}
                  placeholder="Describe exact tear locations, missing ornaments, or defects observed during inspection…"
                  value={damageDesc}
                  onChange={(e) => setDamageDesc(e.target.value)}
                />
              </label>

              <div className="form-row" style={{ marginTop: '0.6rem' }}>
                <label className="field">
                  <span>Proposed Damage Charge (₹)</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={proposedCharge}
                    onChange={(e) => setProposedCharge(e.target.value)}
                  />
                  <small className="form-hint">Initial estimate for customer review &amp; discussion (never auto-debited).</small>
                </label>

                <label className="field">
                  <span>Approved Damage Charge (₹)</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={approvedCharge}
                    onChange={(e) => setApprovedCharge(e.target.value)}
                  />
                  <small className="form-hint">Final authorized amount agreed with customer and added to invoice.</small>
                </label>
              </div>
            </div>

            {/* SECTION 4: INSPECTION & FINANCIAL SUMMARY */}
            <div className="inspection-section">
              <div className="inspection-section-title">
                <span className="section-step-num">4</span>
                <h3>Inspection Result &amp; Financial Summary</h3>
              </div>

              <div className="form-row">
                <label className="field">
                  <span>Inspection Status</span>
                  <select value={inspectionStatus} onChange={(e) => setInspectionStatus(e.target.value)}>
                    <option value="completed">Completed (Costume returned to store stock)</option>
                    <option value="requires_follow_up">Requires follow-up / Customer discussion</option>
                    <option value="pending">Pending inspection</option>
                  </select>
                </label>

                <label className="field">
                  <span>Internal Staff Notes (Private)</span>
                  <input
                    type="text"
                    placeholder="Staff notes visible only in admin dashboard"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                  />
                </label>
              </div>

              {condition !== 'good' && !data?.damageReportSubmitted && (
                <div className="damage-report-dispatch-bar animate-fade-in">
                  <div>
                    <strong>Need to file a formal damage notice?</strong>
                    <div>This creates an official report ticket (with evidence photos) and alerts the customer via email.</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-warning"
                    disabled={submittingDmg || saving}
                    onClick={handleSubmitDamageReport}
                  >
                    {submittingDmg ? 'Dispatching Notice…' : '⚠️ Submit Damage Report & Email Customer'}
                  </button>
                </div>
              )}

              {data?.damageReportSubmitted && (
                <div className="panel panel--ok" style={{ marginTop: '0.75rem', padding: '0.75rem' }}>
                  ✓ Official Damage Report <strong>{data.damageReportRef}</strong> submitted and notified to customer.
                </div>
              )}
            </div>

            <div className="inspection-section inspection-section--fee" style={{ marginTop: '0.2rem' }}>
              <div className="inspection-section-title" style={{ borderBottom: 'none', marginBottom: 0 }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Fee Breakdown &amp; Balance Calculation
                </h4>
              </div>

              <div className="fee-breakdown-grid">
                <div className="fee-item">
                  <span className="fee-label">Original Rental</span>
                  <strong className="fee-val">₹{baseRental}</strong>
                  <small>{data?.costumeQuantity || 1} piece(s)</small>
                </div>
                <div className="fee-item">
                  <span className="fee-label">Late Return Penalty</span>
                  <strong className="fee-val" style={{ color: lateFee > 0 ? '#b71c1c' : 'inherit' }}>
                    + ₹{lateFee}
                  </strong>
                  <small>{lateFee > 0 ? 'Flat late fee applied' : 'Returned on time'}</small>
                </div>
                <div className="fee-item">
                  <span className="fee-label">Approved Damage Charge</span>
                  <strong className="fee-val" style={{ color: dmgFee > 0 ? '#b71c1c' : 'inherit' }}>
                    + ₹{dmgFee}
                  </strong>
                  <small>{dmgFee > 0 ? 'Authorized repair fee' : 'No damage fees'}</small>
                </div>
                <div className="fee-item fee-item--total">
                  <span className="fee-label">Total Booking Fee</span>
                  <strong className="fee-val">₹{calculatedTotal}</strong>
                  <small>Sum of all fees</small>
                </div>
                <div className="fee-item fee-item--balance">
                  <span className="fee-label">Remaining Balance Due</span>
                  <strong className="fee-val" style={{ color: 'var(--maroon)' }}>
                    ₹{balanceRemaining}
                  </strong>
                  <small>{depositPaid > 0 ? `(₹${depositPaid} deposit deducted)` : '(No deposit paid)'}</small>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Action Footer */}
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancel / Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || loading}
            onClick={handleSave}
          >
            {saving ? 'Saving Inspection Record…' : '✓ Save Inspection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Complaints Tab ────────────────────────────────────────────────────────

function ComplaintsTab({ onUpdate }) {
  const [complaints, setComplaints] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [error, setError] = useState('');
  const [selectedComp, setSelectedComp] = useState(null);

  const load = useCallback(() => {
    adminGetComplaints({ q: search, status: statusFilter, category: catFilter })
      .then(setComplaints)
      .catch((e) => setError(e.message));
  }, [search, statusFilter, catFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <section>
      <div className="results-bar filters-wrap">
        <label className="filters__field">
          <span>Search</span>
          <input
            type="search"
            placeholder="Search ref, customer, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="filters__field">
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="filters__field">
          <span>Category</span>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">All categories</option>
            {COMPLAINT_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {complaints === null ? <p>Loading complaints…</p> : complaints.length === 0 ? (
        <p className="empty">No complaints match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Category</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c.complaintRef}>
                  <td><strong>{c.complaintRef}</strong>{c.bookingRef ? <small>Booking {c.bookingRef}</small> : null}</td>
                  <td>{c.customerName}<small>{c.customerEmail}</small></td>
                  <td><span className="complaint-cat-chip">{c.category.replace(/_/g, ' ')}</span></td>
                  <td>{c.subject}</td>
                  <td><span className={`badge badge--${c.status.toLowerCase()}`}>{c.status}</span></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedComp(c)}>
                      Review &amp; Respond
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedComp && (
        <ComplaintDetailModal
          complaint={selectedComp}
          onClose={() => setSelectedComp(null)}
          onChanged={() => { load(); onUpdate(); }}
        />
      )}
    </section>
  );
}

// ── Complaint Detail & Management Modal ───────────────────────────────────

function ComplaintDetailModal({ complaint, onClose, onChanged }) {
  const [data, setData] = useState(complaint);
  const [status, setStatus] = useState(complaint.status);
  const [adminResponse, setAdminResponse] = useState(complaint.adminResponse || '');
  const [resolution, setResolution] = useState(complaint.resolution || '');
  const [actionTaken, setActionTaken] = useState(complaint.actionTaken || '');
  const [internalNote, setInternalNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const refresh = () => {
    adminGetComplaint(data.complaintRef).then(setData).catch(() => {});
  };

  const handleUpdate = async () => {
    setUpdating(true); setError(''); setMsg('');
    try {
      const updated = await adminUpdateComplaint(data.complaintRef, {
        status,
        adminResponse,
        resolution,
        actionTaken
      });
      setData(updated);
      setMsg('Complaint updated and notification dispatched to customer.');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!internalNote.trim()) return;
    setAddingNote(true); setError('');
    try {
      const updated = await adminAddComplaintNote(data.complaintRef, internalNote.trim());
      setData(updated);
      setInternalNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingNote(false);
    }
  };

  const handleRetryEmail = async () => {
    setRetryingEmail(true); setError(''); setMsg('');
    try {
      await adminRetryComplaintEmail(data.complaintRef);
      setMsg('Email sent successfully.');
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setRetryingEmail(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card complaint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Complaint {data.complaintRef}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error" role="alert">{error}</p>}
          {msg && <p className="form-success">{msg}</p>}

          <div className="complaint-meta-grid">
            <div><strong>Customer:</strong> {data.customerName} ({data.customerEmail})</div>
            <div><strong>Phone:</strong> {data.customerPhone || 'N/A'}</div>
            <div><strong>Category:</strong> {data.category.replace(/_/g, ' ')}</div>
            <div><strong>Booking:</strong> {data.bookingRef || 'None'}</div>
          </div>

          <div className="complaint-content-box">
            <h3>{data.subject}</h3>
            <p>{data.description}</p>
            {data.attachmentUrl && (
              <p>📎 <a href={assetUrl(data.attachmentUrl)} target="_blank" rel="noreferrer">Open Customer Attachment</a></p>
            )}
          </div>

          {/* Email delivery status */}
          {data.emailDeliveryStatus === 'failed' && (
            <div className="email-alert-fail">
              ⚠️ Email delivery to customer failed: {data.emailDeliveryError || 'SMTP error'}.{' '}
              <button className="link-btn" disabled={retryingEmail} onClick={handleRetryEmail}>
                {retryingEmail ? 'Retrying…' : 'Retry sending email now'}
              </button>
            </div>
          )}

          <hr />

          {/* Response & Resolution Form */}
          <h3>Update Status &amp; Response</h3>
          <div className="form-row">
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {['RESOLVED', 'CLOSED'].includes(data.status) && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ alignSelf: 'flex-end', marginBottom: '1rem' }}
                onClick={() => setStatus('OPEN')}
              >
                🔄 Reopen Complaint
              </button>
            )}
          </div>

          <label className="field">
            <span>Customer-Facing Response</span>
            <textarea
              rows={3}
              placeholder="Response sent to the customer by email and displayed in their account…"
              value={adminResponse}
              onChange={(e) => setAdminResponse(e.target.value)}
            />
          </label>

          <div className="form-row">
            <label className="field">
              <span>Resolution Summary</span>
              <input
                type="text"
                placeholder="e.g. ₹250 late fee waived in full"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Action Taken</span>
              <input
                type="text"
                placeholder="e.g. Penalty reset to 0 in system"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
              />
            </label>
          </div>

          <button className="btn btn-primary" disabled={updating} onClick={handleUpdate}>
            {updating ? 'Saving…' : 'Save Status & Dispatch Email to Customer'}
          </button>

          <hr />

          {/* Private Internal Notes (Strictly hidden from customers) */}
          <div className="internal-notes-section">
            <h4>🔒 Internal Admin Notes (Private — never sent to customer)</h4>
            {data.internalNotes && data.internalNotes.length > 0 ? (
              <ul className="internal-notes-list">
                {data.internalNotes.map((n, i) => (
                  <li key={i} className="internal-note-item">
                    <p>{n.note}</p>
                    <small>Added by {n.adminEmail} on {new Date(n.createdAt).toLocaleString('en-IN')}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="form-hint">No internal notes yet.</p>}

            <form onSubmit={handleAddNote} className="add-note-form">
              <input
                type="text"
                placeholder="Add confidential internal note…"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
              />
              <button className="btn btn-sm btn-outline" disabled={addingNote}>
                {addingNote ? 'Saving…' : 'Add private note'}
              </button>
            </form>
          </div>

          <hr />

          {/* Status change history */}
          <h4>📜 Status History &amp; Actions</h4>
          {data.statusHistory && data.statusHistory.length > 0 && (
            <ul className="history-timeline">
              {data.statusHistory.map((h, i) => (
                <li key={i}>
                  <strong>{h.action || `${h.fromStatus} → ${h.toStatus}`}</strong>
                  <span> by {h.changedBy} on {new Date(h.createdAt).toLocaleString('en-IN')}</span>
                  {h.comment && <p className="history-comment">&ldquo;{h.comment}&rdquo;</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Damage Reports Tab ────────────────────────────────────────────────────

function DamageReportsTab({ onUpdate }) {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [retryingId, setRetryingId] = useState(null);

  const load = useCallback(() => {
    adminGetDamageReports().then(setReports).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const retryEmail = async (report) => {
    setRetryingId(report.reportRef);
    try {
      await adminRetryDamageReportEmail(report.reportRef);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {reports === null ? <p>Loading damage reports…</p> : reports.length === 0 ? (
        <p className="empty">No damage reports recorded.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Booking</th>
                <th>Customer</th>
                <th>Costume</th>
                <th>Condition</th>
                <th>Proposed Charge</th>
                <th>Status</th>
                <th>Email Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.reportRef}>
                  <td><strong>{r.reportRef}</strong></td>
                  <td>Booking {r.bookingRef}</td>
                  <td>{r.customerName}<small>{r.customerEmail}</small></td>
                  <td>{r.costumeName}</td>
                  <td>{r.condition.replace(/_/g, ' ')}</td>
                  <td><strong>₹{r.proposedCharge}</strong></td>
                  <td><span className={`badge badge--${r.status.toLowerCase()}`}>{r.status}</span></td>
                  <td>
                    {r.emailDeliveryStatus === 'sent' && <span className="badge badge--ok">sent ✓</span>}
                    {r.emailDeliveryStatus === 'failed' && (
                      <div>
                        <span className="badge badge--cancelled">failed</span>
                        <button className="link-btn" disabled={retryingId === r.reportRef} onClick={() => retryEmail(r)}>
                          {retryingId === r.reportRef ? 'Sending…' : 'Retry'}
                        </button>
                      </div>
                    )}
                    {r.emailDeliveryStatus === 'pending' && <span className="badge badge--pending">pending</span>}
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

// ── Costumes Tab ──────────────────────────────────────────────────────────

function CostumesTab({ onChange }) {
  const [costumes, setCostumes] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
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
            <thead>
              <tr><th>Costume</th><th>Category</th><th>Rent / day</th><th>Stock</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {costumes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="cell-costume">
                      <img src={assetUrl(c.src)} alt="" />
                      <span>{costumeTitle(c)}{c.label ? <small>{c.label}</small> : null}</span>
                    </div>
                  </td>
                  <td>{c.categoryName}</td>
                  <td>{c.rentPrice ? `₹${c.rentPrice}` : <span style={{ opacity: 0.5 }}>on request</span>}</td>
                  <td>{c.pooled ? `pooled ${c.sizeMin}–${c.sizeMax}″ (${c.total} pcs)` : `${c.total} pcs in ${c.sizes.length} sizes`}</td>
                  <td>{c.active ? <span className="badge badge--ok">active</span> : <span className="badge">hidden</span>}</td>
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
  const [rentPrice, setRentPrice] = useState(costume?.rentPrice ?? '');
  const [active, setActive] = useState(costume ? costume.active : true);
  const [image, setImage] = useState(null);
  const [pooled, setPooled] = useState(costume ? costume.pooled : false);
  const [sizeMin, setSizeMin] = useState(costume?.sizeMin ?? '');
  const [sizeMax, setSizeMax] = useState(costume?.sizeMax ?? '');
  const [pooledQty, setPooledQty] = useState(costume?.pooled ? costume.total : 1);
  const [sizes, setSizes] = useState(() => (costume && !costume.pooled ? costume.sizes.map((s) => ({ size: s.size, qty: s.count })) : []));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const addSizeRow = () => setSizes((s) => [...s, { size: '', qty: 1 }]);
  const updateSize = (idx, patch) => setSizes((s) => s.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeSize = (idx) => setSizes((s) => s.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const stockPayload = pooled ? [{ size: 0, qty: Number(pooledQty) }] : sizes;
      if (isNew) {
        if (!image) throw new Error('Please choose a photo of the costume.');
        const form = new FormData();
        form.append('image', image);
        form.append('categoryId', categoryId);
        form.append('name', name);
        form.append('label', label);
        form.append('rentPrice', rentPrice);
        form.append('sizes', JSON.stringify(stockPayload));
        if (pooled) { form.append('sizeMin', sizeMin); form.append('sizeMax', sizeMax); }
        await adminCreateCostume(form);
      } else {
        await adminUpdateCostume(costume.id, {
          name, label, categoryId, rentPrice, active,
          sizes: stockPayload,
          ...(pooled && { sizeMin, sizeMax })
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel costume-editor" onSubmit={submit}>
      <h3>{isNew ? 'Add costume' : `Edit: ${costumeTitle(costume)}`}</h3>
      {error && <p className="form-error">{error}</p>}
      {isNew && (
        <label className="field">
          <span>Costume photo</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files[0])} required />
        </label>
      )}
      <div className="form-row">
        <label className="field">
          <span>Name (optional)</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classic Red &amp; Gold" />
        </label>
        <label className="field">
          <span>Label / code (optional)</span>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. FROCK-01" />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Rent per day (₹, blank = on request)</span>
          <input type="number" min="0" step="50" value={rentPrice} onChange={(e) => setRentPrice(e.target.value)} placeholder="e.g. 650" />
        </label>
      </div>
      {!isNew && (
        <label className="checkbox-field">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Active (visible in customer catalog)</span>
        </label>
      )}
      <div className="editor-stock">
        <h4>Sizes &amp; stock</h4>
        <label className="checkbox-field">
          <input type="checkbox" checked={pooled} onChange={(e) => setPooled(e.target.checked)} />
          <span>Pooled stock (single inventory pool across a size range)</span>
        </label>
        {pooled ? (
          <div className="form-row">
            <label className="field">
              <span>Smallest size (inches)</span>
              <input type="number" min="16" max="60" value={sizeMin} onChange={(e) => setSizeMin(e.target.value)} required />
            </label>
            <label className="field">
              <span>Largest size (inches)</span>
              <input type="number" min="16" max="60" value={sizeMax} onChange={(e) => setSizeMax(e.target.value)} required />
            </label>
            <label className="field">
              <span>Total pieces</span>
              <input type="number" min="0" value={pooledQty} onChange={(e) => setPooledQty(e.target.value)} required />
            </label>
          </div>
        ) : (
          <div>
            {sizes.map((row, i) => (
              <div key={i} className="form-row size-row">
                <label className="field">
                  <span>Size (inches)</span>
                  <input type="number" min="16" max="60" value={row.size} onChange={(e) => updateSize(i, { size: e.target.value })} required />
                </label>
                <label className="field">
                  <span>Count</span>
                  <input type="number" min="0" value={row.qty} onChange={(e) => updateSize(i, { qty: e.target.value })} required />
                </label>
                <button type="button" className="link-btn remove-btn" onClick={() => removeSize(i)}>&times; Remove</button>
              </div>
            ))}
            <button type="button" className="link-btn" onClick={addSizeRow}>+ Add another size</button>
          </div>
        )}
      </div>
      <div className="panel-actions">
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save costume'}</button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Enquiries Tab ─────────────────────────────────────────────────────────

function EnquiriesTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { adminEnquiries().then(setRows).catch((e) => setError(e.message)); }, []);

  return (
    <section>
      {error && <p className="form-error">{error}</p>}
      {rows === null ? <p>Loading enquiries…</p> : rows.length === 0 ? <p className="empty">No enquiries yet.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Name</th><th>Contact</th><th>Costume</th><th>Message</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{e.created_at?.slice(0, 10)}</td>
                  <td><strong>{e.name}</strong></td>
                  <td>
                    {e.email && <div><a href={`mailto:${e.email}`}>{e.email}</a></div>}
                    {e.phone && <div><a href={waLink(e.phone)} target="_blank" rel="noreferrer">{e.phone} · WhatsApp</a></div>}
                  </td>
                  <td>{e.costume_type || '—'}</td>
                  <td>{e.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
