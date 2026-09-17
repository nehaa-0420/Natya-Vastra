// Change this once the backend is deployed somewhere other than localhost.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const getCategories = () => request('/api/categories');
export const getGallery = () => request('/api/gallery');
export const submitEnquiry = (payload) =>
  request('/api/enquiries', { method: 'POST', body: JSON.stringify(payload) });
