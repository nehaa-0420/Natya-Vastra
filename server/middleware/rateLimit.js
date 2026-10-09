// Small in-memory limiter: at most `max` requests per `windowMs` for each IP.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  };
}
module.exports = { rateLimit };
