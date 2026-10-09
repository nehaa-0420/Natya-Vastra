// Bookings use whole days (YYYY-MM-DD, both ends inclusive).
// "Today" is taken in India time so a late-evening booking isn't rejected as "yesterday".
const BUSINESS_TZ = 'Asia/Kolkata';
const MAX_RENTAL_DAYS = 30;

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function eachDay(start, end) {
  const days = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

// Returns an error message, or null when the range is fine.
function validateRange(start, end, { allowPast = false } = {}) {
  if (!isDate(start) || !isDate(end)) return 'Please choose valid start and end dates.';
  if (end < start) return 'The end date cannot be before the start date.';
  if (!allowPast && start < today()) return 'The start date cannot be in the past.';
  if (eachDay(start, end).length > MAX_RENTAL_DAYS) {
    return `Rentals can be booked for up to ${MAX_RENTAL_DAYS} days at a time.`;
  }
  return null;
}

module.exports = { today, isDate, eachDay, validateRange, MAX_RENTAL_DAYS };
