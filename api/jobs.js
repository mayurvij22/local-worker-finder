/**
 * GET /api/jobs
 *
 * Returns the list of job categories.
 * Cached at Vercel edge for 60 seconds.
 */

const { getJobs } = require('../lib/sheets');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jobs = await getJobs();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(jobs);
  } catch (err) {
    console.error('GET /api/jobs error:', err.message);
    return res.status(500).json({ error: 'Failed to load jobs.' });
  }
};
