// Configurable API base URL for deployment on Vercel connecting to Render.
// If VITE_API_BASE is set (e.g. 'https://natya-vastra-api.onrender.com'), use it;
// otherwise fall back to local development server ('http://localhost:4000').
const rawBase = (import.meta.env.VITE_API_BASE || 'http://localhost:4000').trim().replace(/\/+$/, '');
export const API_BASE = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;

// Photos uploaded by admin or users are served by the backend; catalog photos ship with the frontend static bundle.
export const assetUrl = (p) => {
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (p.startsWith('/uploads')) return API_BASE + p;
  return p;
};

const KEY = 'nv_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: payload });
  } catch {
    throw new Error("Can't reach the server. Please check that the backend is running and CORS allows this domain.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

// catalog
export const getCategories = () => request('/api/categories');
export const getGallery = () => request('/api/gallery');
export const searchCostumes = (params) => request(`/api/costumes${qs(params)}`);
export const getCostume = (id) => request(`/api/costumes/${id}`);
export const getAvailability = (id, start, end) => request(`/api/costumes/${id}/availability${qs({ start, end })}`);
export const submitEnquiry = (payload) => request('/api/enquiries', { method: 'POST', body: payload });

// accounts
export const register = (body) => request('/api/auth/register', { method: 'POST', body });
export const login = (body) => request('/api/auth/login', { method: 'POST', body });
export const getMe = () => request('/api/auth/me');

// bookings + wishlist
export const createBooking = (body) => request('/api/bookings', { method: 'POST', body });
export const getMyBookings = () => request('/api/bookings/mine');
export const cancelBooking = (id) => request(`/api/bookings/${id}/cancel`, { method: 'POST' });
export const getWishlist = () => request('/api/wishlist');
export const addWishlist = (id) => request(`/api/wishlist/${id}`, { method: 'POST' });
export const removeWishlist = (id) => request(`/api/wishlist/${id}`, { method: 'DELETE' });

// admin
export const adminStats = () => request('/api/admin/stats');
export const adminBookings = (status = '') => request(`/api/admin/bookings${qs({ status })}`);
export const adminSetBookingStatus = (id, status) => request(`/api/admin/bookings/${id}`, { method: 'PATCH', body: { status } });
export const adminCostumes = () => request('/api/admin/costumes');
export const adminCreateCostume = (form) => request('/api/admin/costumes', { method: 'POST', form });
export const adminUpdateCostume = (id, body) => request(`/api/admin/costumes/${id}`, { method: 'PUT', body });
export const adminEnquiries = () => request('/api/admin/enquiries');

// payments (Razorpay)
export const createPaymentOrder = (bookingId) => request('/api/payments/orders', { method: 'POST', body: { bookingId } });
export const verifyPayment = (body) => request('/api/payments/verify', { method: 'POST', body });
export const failPayment = (orderId) => request(`/api/payments/${orderId}/fail`, { method: 'POST' });


// AI costume assistant
export const askAssistant = (messages) => request('/api/assistant', { method: 'POST', body: { messages } });

// complaints (customer)
export const submitComplaint = (form) => request('/api/complaints', { method: 'POST', form });
export const getMyComplaints = () => request('/api/complaints/mine');
export const getComplaint = (id) => request(`/api/complaints/${id}`);

// damage reports (customer)
export const getMyDamageReports = () => request('/api/damage-reports/mine');
export const getDamageReport = (id) => request(`/api/damage-reports/${id}`);
export const respondDamageReport = (id, response) => request(`/api/damage-reports/${id}/respond`, { method: 'POST', body: { response } });

// admin inspections & damage reports
export const adminGetInspections = () => request('/api/admin/inspections');
export const adminGetBookingInspection = (bookingId) => request(`/api/admin/inspections/booking/${bookingId}`);
export const adminSaveInspection = (body) => request('/api/admin/inspections', { method: 'POST', body });
export const adminSubmitDamageReport = (inspectionId, body) => request(`/api/admin/inspections/${inspectionId}/damage-report`, { method: 'POST', body });
export const adminCorrectPenalty = (inspectionId, body) => request(`/api/admin/inspections/${inspectionId}/correct-penalty`, { method: 'POST', body });
export const adminGetDamageReports = () => request('/api/admin/damage-reports');
export const adminRetryDamageReportEmail = (id) => request(`/api/admin/damage-reports/${id}/retry-email`, { method: 'POST' });
export const adminUploadEvidence = (form) => request('/api/admin/upload-evidence', { method: 'POST', form });

// admin complaints
export const adminGetComplaints = (params = {}) => request(`/api/admin/complaints${qs(params)}`);
export const adminGetComplaint = (id) => request(`/api/admin/complaints/${id}`);
export const adminAddComplaintNote = (id, note) => request(`/api/admin/complaints/${id}/notes`, { method: 'POST', body: { note } });
export const adminUpdateComplaint = (id, body) => request(`/api/admin/complaints/${id}`, { method: 'PATCH', body });
export const adminRetryComplaintEmail = (id) => request(`/api/admin/complaints/${id}/retry-email`, { method: 'POST' });
export const adminGetAuditLogs = () => request('/api/admin/audit-logs');
