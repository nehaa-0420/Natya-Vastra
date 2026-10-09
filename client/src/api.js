// Change VITE_API_BASE (in client/.env) once the backend is deployed.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

// Photos uploaded by the admin are served by the API; the original photos ship with the site.
export const assetUrl = (p) => (p && p.startsWith('/uploads') ? API_BASE + p : p);

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
    throw new Error("Can't reach the server. Please check that the backend is running.");
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
