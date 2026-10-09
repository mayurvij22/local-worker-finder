/**
 * POST /api/track
 *
 * Records a customer action for the admin Analytics tab.
 * Body: { type: 'visit' | 'category' | 'call' | 'whatsapp', value?, workerId? }
 * ("reveal" is logged by /api/number itself, so it can't be faked here.)
 * Rate-limited: 30 per minute per IP. Answers 204 even when logging fails,
 * so tracking never breaks the page.
 */

const { getActiveWorkers, getJobs, logEvent } = require('../lib/sheets');
const { trackPerMinute } = require('../lib/ratelimit');

const TYPES = new Set(['visit', 'category', 'call', 'whatsapp']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (!trackPerMinute.check(ip).allowed) return res.status(204).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const type = body && body.type;
  if (!TYPES.has(type)) return res.status(400).json({ error: 'Invalid event' });

  try {
    if (type === 'visit') {
      await logEvent({ type });
    } else if (type === 'category') {
      // Only accept real job names (cached list), so the sheet can't be filled with junk
      const jobs = await getJobs();
      if (jobs.includes(body.value)) await logEvent({ type, value: body.value });
    } else {
      const worker = (await getActiveWorkers()).find((w) => w.id === body.workerId);
      if (worker) await logEvent({ type, value: worker.job, workerId: worker.id, workerName: worker.name });
    }
  } catch (err) {
    console.error('POST /api/track error:', err.message);
  }
  return res.status(204).end();
};
