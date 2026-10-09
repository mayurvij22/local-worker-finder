/**
 * GET /api/cleanup
 *
 * Runs once a day (see "crons" in vercel.json).
 * Deletes bookings older than 7 days from the "Bookings" sheet.
 *
 * If you set a CRON_SECRET environment variable in Vercel, Vercel sends it
 * automatically with the daily call and everyone else is turned away.
 */

const { deleteOldBookings } = require('../lib/sheets');

const KEEP_DAYS = 7;

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const deleted = await deleteOldBookings(KEEP_DAYS);
    return res.status(200).json({ success: true, deleted });
  } catch (err) {
    console.error('GET /api/cleanup error:', err.message);
    return res.status(500).json({ error: 'Cleanup failed.' });
  }
};
