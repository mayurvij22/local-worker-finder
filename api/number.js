/**
 * GET /api/number?id=X
 *
 * Returns a single worker's phone number.
 * Rate-limited: 10 per minute + 30 per day per IP.
 * Never cached.
 */

const { getWorkerPhone } = require('../lib/sheets');
const { numberPerMinute, numberPerDay } = require('../lib/ratelimit');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate the ID parameter ──
  const id = req.query.id;
  if (!id || typeof id !== 'string' || id.length > 20) {
    return res.status(400).json({ error: 'Invalid worker ID' });
  }

  // ── Rate limiting by IP ──
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const minuteCheck = numberPerMinute.check(ip);
  if (!minuteCheck.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute and try again.',
      error_hi: 'बहुत ज़्यादा अनुरोध। कृपया एक मिनट बाद दोबारा कोशिश करें।',
      retryAfter: minuteCheck.retryAfter,
    });
  }

  const dayCheck = numberPerDay.check(ip);
  if (!dayCheck.allowed) {
    return res.status(429).json({
      error: 'Daily limit reached. Please come back tomorrow.',
      error_hi: 'आज की सीमा पूरी हो गई। कृपया कल दोबारा आएं।',
      retryAfter: dayCheck.retryAfter,
    });
  }

  // ── Fetch the phone number ──
  try {
    const worker = await getWorkerPhone(id);
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json(worker);
  } catch (err) {
    console.error('GET /api/number error:', err.message);
    return res.status(500).json({ error: 'Failed to load number. Please try again.' });
  }
};
