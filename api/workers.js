/**
 * GET /api/workers
 *
 * Returns active workers WITHOUT phone numbers.
 * Response: [{ id, name, job, whatsapp }, ...]
 * Cached at Vercel edge for 60 seconds.
 */

const { getActiveWorkers } = require('../lib/sheets');

module.exports = async function handler(req, res) {
  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const workers = await getActiveWorkers();
    // Edge caching header (also set in vercel.json, but belt-and-suspenders)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(workers);
  } catch (err) {
    console.error('GET /api/workers error:', err.message);
    return res.status(500).json({ error: 'Failed to load workers. Please try again.' });
  }
};
