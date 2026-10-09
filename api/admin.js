/**
 * POST /api/admin
 *
 * Password-protected CRUD for workers and jobs.
 * Every request must include { password, action, ...data }.
 * Failed logins are rate-limited (5 per 15 min per IP).
 */

const sheets = require('../lib/sheets');
const { buildStats } = require('../lib/analytics');

/** Years of experience from the form; empty or invalid → the default (5). */
function toExperience(value) {
  const n = Number(value);
  return value !== '' && Number.isInteger(n) && n >= 0 && n <= 60 ? n : sheets.DEFAULT_EXPERIENCE;
}
const { adminLogin } = require('../lib/ratelimit');

module.exports = async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  if (!body || !body.password) {
    return res.status(400).json({ error: 'Password required' });
  }

  // ── Rate-limit failed login attempts ──
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  // ── Check password ──
  if (body.password !== process.env.ADMIN_PASSWORD) {
    const loginCheck = adminLogin.check(ip);
    if (!loginCheck.allowed) {
      return res
        .status(429)
        .json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
    return res.status(401).json({ error: 'Wrong password' });
  }

  const { action } = body;

  try {
    switch (action) {
      // ─── Worker CRUD ───

      case 'getWorkers': {
        const workers = await sheets.getAllWorkers();
        return res.status(200).json(workers);
      }

      case 'addWorker': {
        const { name, phone, job, whatsapp, experience } = body;

        // Validate required fields
        if (!name || !phone || !job) {
          return res.status(400).json({ error: 'Name, phone, and job are required.' });
        }
        // Phone must be exactly 10 digits
        if (!/^\d{10}$/.test(phone)) {
          return res
            .status(400)
            .json({ error: 'Phone must be exactly 10 digits (no +91).' });
        }

        const id = await sheets.addWorker({
          name: name.trim().substring(0, 100),
          phone: phone.trim(),
          job: job.trim().substring(0, 50),
          whatsapp: whatsapp === true || whatsapp === 'Yes',
          experience: toExperience(experience),
        });

        return res.status(201).json({ success: true, id });
      }

      case 'updateWorker': {
        const { id, name, phone, job, active, whatsapp, experience } = body;
        if (!id) {
          return res.status(400).json({ error: 'Worker ID is required.' });
        }
        if (phone && !/^\d{10}$/.test(phone)) {
          return res
            .status(400)
            .json({ error: 'Phone must be exactly 10 digits.' });
        }

        const updated = await sheets.updateWorker(id, {
          name: (name || '').trim().substring(0, 100),
          phone: (phone || '').trim(),
          job: (job || '').trim().substring(0, 50),
          active: active === true || active === 'Yes',
          whatsapp: whatsapp === true || whatsapp === 'Yes',
          experience: toExperience(experience),
        });

        if (!updated) {
          return res.status(404).json({ error: 'Worker not found.' });
        }
        return res.status(200).json({ success: true });
      }

      case 'deleteWorker': {
        const { id } = body;
        if (!id) {
          return res.status(400).json({ error: 'Worker ID is required.' });
        }

        const deleted = await sheets.deleteWorker(id);
        if (!deleted) {
          return res.status(404).json({ error: 'Worker not found.' });
        }
        return res.status(200).json({ success: true });
      }

      // ─── Job CRUD ───

      case 'getJobs': {
        const jobs = await sheets.getJobs();
        return res.status(200).json(jobs);
      }

      case 'addJob': {
        const { jobName } = body;
        if (!jobName || !jobName.trim()) {
          return res.status(400).json({ error: 'Job name is required.' });
        }
        await sheets.addJob(jobName.trim().substring(0, 50));
        return res.status(201).json({ success: true });
      }

      case 'deleteJob': {
        const { jobName } = body;
        if (!jobName) {
          return res.status(400).json({ error: 'Job name is required.' });
        }
        const deleted = await sheets.deleteJob(jobName);
        if (!deleted) {
          return res.status(404).json({ error: 'Job not found.' });
        }
        return res.status(200).json({ success: true });
      }

      // ─── Analytics ───

      case 'getStats': {
        const days = Math.min(Math.max(parseInt(body.days, 10) || 7, 1), 90);
        const [events, workers] = await Promise.all([sheets.getEvents(), sheets.getAllWorkers()]);
        return res.status(200).json(buildStats(events, workers, days));
      }

      // ─── Auth check (just verifies password) ───

      case 'login': {
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    console.error('POST /api/admin error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
