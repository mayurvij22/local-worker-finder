/**
 * POST /api/booking
 *
 * Saves a customer booking to the "Bookings" sheet and returns a WhatsApp
 * link (wa.me) that opens a ready-typed message to the shop owner.
 *
 * Input (JSON): customerName, customerPhone, address, jobCategory, workerName
 * Rate limit: 10 bookings per IP per hour.
 */

const { getActiveWorkers, getJobs, addBooking } = require('../lib/sheets');
const { bookingPerHour } = require('../lib/ratelimit');

// Shop owner's WhatsApp number (10 digits, no +91). Change it here if it ever changes.
const SHOP_WHATSAPP = '8208104775';

/** Trim, remove control characters, collapse spaces, and cap the length */
function clean(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  // ── Rate limit by IP ──
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const limit = bookingPerHour.check(ip);
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Too many bookings. Please try again later or call the shop.',
      error_hi: 'बहुत ज़्यादा बुकिंग। कृपया बाद में कोशिश करें या दुकान में कॉल करें।',
    });
  }

  // ── Read and clean the input ──
  const body = req.body || {};
  const customerName = clean(body.customerName, 100);
  const customerPhone = String(body.customerPhone || '').replace(/\D/g, '');
  const address = clean(body.address, 300);
  const jobCategory = clean(body.jobCategory, 50);
  const workerName = clean(body.workerName, 100);

  if (!customerName || !customerPhone || !address || !jobCategory || !workerName) {
    return res.status(400).json({
      error: 'All fields are required.',
      error_hi: 'सभी जानकारी भरना ज़रूरी है।',
    });
  }
  if (!/^\d{10}$/.test(customerPhone)) {
    return res.status(400).json({
      error: 'Phone number must be exactly 10 digits.',
      error_hi: 'फ़ोन नंबर ठीक 10 अंकों का होना चाहिए।',
    });
  }

  try {
    // The worker and job must really exist (stops junk / made-up bookings)
    const [workers, jobs] = await Promise.all([getActiveWorkers(), getJobs()]);
    const worker = workers.find((w) => w.name === workerName);
    if (!worker || (!jobs.includes(jobCategory) && !worker.jobs.includes(jobCategory))) {
      return res.status(400).json({
        error: 'This worker or job is no longer available. Please refresh the page.',
        error_hi: 'यह कारीगर या काम उपलब्ध नहीं है। कृपया पेज रीफ़्रेश करें।',
      });
    }

    await addBooking({ customerName, customerPhone, address, jobCategory, workerName });

    // Message for the shop owner, opened by the customer via WhatsApp
    const message =
      `🔔 *नवीन बुकिंग*\n\n` +
      `👤 *ग्राहक:* ${customerName}\n` +
      `📞 *मोबाईल:* ${customerPhone}\n` +
      `📍 *पत्ता:* ${address}\n` +
      `🛠️ *काम:* ${jobCategory}\n` +
      `👷 *कारागीर:* ${workerName}\n\n` +
      `कृपया ग्राहकाशी संपर्क साधून काम निश्चित करावे. धन्यवाद! 🙏`;
    const whatsappUrl =
      `https://wa.me/91${SHOP_WHATSAPP}?text=${encodeURIComponent(message)}`;

    return res.status(201).json({ success: true, whatsappUrl });
  } catch (err) {
    console.error('POST /api/booking error:', err.message);
    return res.status(500).json({
      error: 'Could not save your booking. Please try again or call the shop.',
      error_hi: 'बुकिंग सेव नहीं हो सकी। कृपया दोबारा कोशिश करें या दुकान में कॉल करें।',
    });
  }
};
