/**
 * ratelimit.js — Simple in-memory rate limiter
 * 
 * No Redis needed. Stores request counts in a Map.
 * Counts reset when the serverless function cold-starts,
 * which is perfectly fine for a small shop app.
 */

// Clean up expired entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * Create a rate limiter with a given time window and max requests.
 * @param {object} options
 * @param {number} options.windowMs  — Time window in milliseconds
 * @param {number} options.maxRequests — Max requests allowed per window
 * @returns {{ check: (ip: string) => { allowed: boolean, remaining: number, retryAfter?: number } }}
 */
function createLimiter({ windowMs, maxRequests }) {
  const store = new Map();

  // Periodically remove expired entries so the Map doesn't grow forever
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Don't let the cleanup timer keep the process alive
  if (timer.unref) timer.unref();

  return {
    check(ip) {
      const now = Date.now();
      const record = store.get(ip);

      // First request from this IP, or their window has expired
      if (!record || now > record.resetAt) {
        store.set(ip, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1 };
      }

      // They've hit the limit
      if (record.count >= maxRequests) {
        const retryAfter = Math.ceil((record.resetAt - now) / 1000);
        return { allowed: false, remaining: 0, retryAfter };
      }

      // Still within limit — increment and allow
      record.count++;
      return { allowed: true, remaining: maxRequests - record.count };
    },
  };
}

// --- Pre-configured limiters used across the app ---

// Phone number lookups: 10 per minute, 30 per day
const numberPerMinute = createLimiter({ windowMs: 60 * 1000, maxRequests: 10 });
const numberPerDay = createLimiter({ windowMs: 24 * 60 * 60 * 1000, maxRequests: 30 });

// Admin login failures: 5 per 15 minutes
const adminLogin = createLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 });

module.exports = { numberPerMinute, numberPerDay, adminLogin };
