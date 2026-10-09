/**
 * analytics.js — turn raw Events rows into the numbers shown on the admin
 * Analytics tab. Days are grouped in India time (IST, UTC+5:30).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "2026-10-09" for a timestamp, in IST */
const dayKey = (ms) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * @param {Array<{time, type, value, workerId, workerName}>} events
 * @param {Array<{id, name}>} workers  current workers (for up-to-date names)
 * @param {number} days                how many days back, including today
 */
function buildStats(events, workers, days, now = Date.now()) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now - i * DAY_MS));
  const firstDay = keys[0];

  const daily = new Map(keys.map((date) => [date, { date, visits: 0, reveals: 0 }]));
  const totals = { visit: 0, reveal: 0, call: 0, whatsapp: 0 };
  const byWorker = new Map();
  const byCategory = new Map();

  for (const e of events) {
    const ms = Date.parse(e.time);
    if (Number.isNaN(ms)) continue;
    const key = dayKey(ms);
    if (key < firstDay) continue; // YYYY-MM-DD strings compare correctly

    if (e.type in totals) totals[e.type]++;

    const day = daily.get(key);
    if (day && e.type === 'visit') day.visits++;
    if (day && e.type === 'reveal') day.reveals++;

    if ((e.type === 'reveal' || e.type === 'call' || e.type === 'whatsapp') && e.workerId) {
      const w = byWorker.get(e.workerId) ||
        { id: e.workerId, name: e.workerName, reveal: 0, call: 0, whatsapp: 0 };
      w[e.type]++;
      byWorker.set(e.workerId, w);
    }

    if (e.type === 'category' && e.value) {
      byCategory.set(e.value, (byCategory.get(e.value) || 0) + 1);
    }
  }

  const names = new Map(workers.map((w) => [w.id, w.name]));
  const topWorkers = [...byWorker.values()]
    .map((w) => ({ ...w, name: names.get(w.id) || w.name || w.id }))
    .sort((a, b) => (b.reveal + b.call + b.whatsapp) - (a.reveal + a.call + a.whatsapp))
    .slice(0, 10);

  const topCategories = [...byCategory.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { days: [...daily.values()], totals, workers: topWorkers, categories: topCategories };
}

module.exports = { buildStats };
