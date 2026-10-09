/**
 * sheets.js — Google Sheets API helper
 *
 * All read/write operations for the Workers and Jobs tabs.
 * Uses a service account for authentication.
 * Includes a 60-second in-memory cache for public reads.
 */

const { google } = require('googleapis');

// ─── Auth & Client (cached across warm serverless invocations) ───

let sheetsClient = null;

function formatPrivateKey(key) {
  if (!key) return '';
  let k = key.replace(/"/g, '').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';
  
  if (k.includes(begin) && k.includes(end)) {
    let base64 = k.replace(begin, '').replace(end, '').replace(/\s+/g, '');
    let chunks = [];
    for (let i = 0; i < base64.length; i += 64) {
      chunks.push(base64.substring(i, i + 64));
    }
    return `${begin}\n${chunks.join('\n')}\n${end}\n`;
  }
  return k;
}

function getSheets() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/** Shortcut — the Sheet ID from env */
const SHEET_ID = () => process.env.GOOGLE_SHEET_ID;

// ─── In-Memory Cache ───

let workersCache = null;
let workersCacheTime = 0;
let jobsCache = null;
let jobsCacheTime = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

/** Call after any write operation to bust the cache */
function clearCache() {
  workersCache = null;
  jobsCache = null;
}

// ─── Workers Tab ───
// Columns: A = ID | B = Name | C = Experience | D = JobCategories | E = Active
// JobCategories is comma-separated, e.g. "Electrician, Plumber"

/** "Electrician, Plumber" → ["Electrician", "Plumber"] */
function splitJobs(text) {
  return String(text || '')
    .split(',')
    .map((j) => j.trim())
    .filter(Boolean);
}

/**
 * Read every row from the Workers tab (including inactive).
 */
async function getAllWorkersRaw() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: 'Workers!A2:E', // skip header row
  });

  return (res.data.values || []).map((row) => ({
    id:         row[0] || '',
    name:       row[1] || '',
    experience: Number(row[2]) || 0,
    jobs:       splitJobs(row[3]),
    active:     (row[4] || 'No').trim().toLowerCase() === 'yes',
  }));
}

/**
 * PUBLIC — Active workers (cached 60s). This is what customers see.
 */
async function getActiveWorkers() {
  const now = Date.now();
  if (workersCache && now - workersCacheTime < CACHE_TTL) {
    return workersCache;
  }

  const all = await getAllWorkersRaw();
  workersCache = all
    .filter((w) => w.active)
    .map(({ id, name, experience, jobs }) => ({ id, name, experience, jobs }));
  workersCacheTime = now;
  return workersCache;
}

/**
 * ADMIN — All workers including inactive.
 */
async function getAllWorkers() {
  return getAllWorkersRaw();
}

/** Generate a short unique ID like "W1A2B3C" */
function generateId() {
  return (
    'W' +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).substring(2, 5).toUpperCase()
  );
}

/** Add a new worker row */
async function addWorker({ name, experience, jobs }) {
  const sheets = getSheets();
  const id = generateId();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: 'Workers!A:E',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, name, experience, jobs.join(', '), 'Yes']],
    },
  });

  clearCache();
  return id;
}

/**
 * Find the 1-indexed row number for a worker by ID.
 * Row 1 is the header, data starts at row 2.
 */
async function findWorkerRow(id) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: 'Workers!A:A',
  });

  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) return i + 1; // 1-indexed
  }
  return -1;
}

/** Update an existing worker's data */
async function updateWorker(id, { name, experience, jobs, active }) {
  const row = await findWorkerRow(id);
  if (row < 2) return false; // not found or is the header

  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: `Workers!A${row}:E${row}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, name, experience, jobs.join(', '), active ? 'Yes' : 'No']],
    },
  });

  clearCache();
  return true;
}

/** Delete a worker row entirely */
async function deleteWorker(id) {
  const row = await findWorkerRow(id);
  if (row < 2) return false;

  const sheets = getSheets();

  // We need the internal sheetId (gid) to delete a row
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID(),
    fields: 'sheets.properties',
  });

  const workersSheet = meta.data.sheets.find(
    (s) => s.properties.title === 'Workers'
  );
  if (!workersSheet) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: workersSheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: row - 1, // 0-indexed for batchUpdate
              endIndex: row,
            },
          },
        },
      ],
    },
  });

  clearCache();
  return true;
}

// ─── Jobs Tab ───
// Column: A = JobName

/** Get all job names (cached 60s) */
async function getJobs() {
  const now = Date.now();
  if (jobsCache && now - jobsCacheTime < CACHE_TTL) {
    return jobsCache;
  }

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: 'Jobs!A2:A', // skip header
  });

  jobsCache = (res.data.values || []).map((row) => row[0]).filter(Boolean);
  jobsCacheTime = now;
  return jobsCache;
}

/** Add a new job category */
async function addJob(jobName) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: 'Jobs!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [[jobName]] },
  });
  clearCache();
}

/** Delete a job category row */
async function deleteJob(jobName) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: 'Jobs!A:A',
  });

  const rows = res.data.values || [];
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === jobName) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex < 1) return false; // not found or is header

  // Get internal sheetId for the Jobs tab
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID(),
    fields: 'sheets.properties',
  });
  const jobsSheet = meta.data.sheets.find(
    (s) => s.properties.title === 'Jobs'
  );
  if (!jobsSheet) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: jobsSheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex, // 0-indexed
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });

  clearCache();
  return true;
}

// ─── Bookings Tab ───
// Columns: A = ID | B = CustomerName | C = CustomerPhone | D = Address
//          E = JobCategory | F = WorkerName | G = Timestamp | H = Status

const BOOKING_HEADERS = [
  'ID', 'CustomerName', 'CustomerPhone', 'Address',
  'JobCategory', 'WorkerName', 'Timestamp', 'Status',
];

/** Find a tab's internal sheetId (needed for deleting rows). Returns null if no such tab. */
async function getSheetId(title) {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID(),
    fields: 'sheets.properties',
  });
  const tab = meta.data.sheets.find((s) => s.properties.title === title);
  return tab ? tab.properties.sheetId : null;
}

let bookingsReady = false;

/** Create the Bookings tab (with header row) the first time it is needed. */
async function ensureBookingsSheet() {
  if (bookingsReady) return;

  if ((await getSheetId('Bookings')) === null) {
    const sheets = getSheets();
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID(),
        requestBody: { requests: [{ addSheet: { properties: { title: 'Bookings' } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID(),
        range: 'Bookings!A1:H1',
        valueInputOption: 'RAW',
        requestBody: { values: [BOOKING_HEADERS] },
      });
    } catch (err) {
      // Two requests created the tab at the same moment — that's fine
      if (!/already exists/i.test(err.message)) throw err;
    }
  }
  bookingsReady = true;
}

/** Save a new booking. Returns the booking ID. */
async function addBooking({ customerName, customerPhone, address, jobCategory, workerName }) {
  await ensureBookingsSheet();
  const id = 'B' + generateId().substring(1);

  await getSheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: 'Bookings!A:H',
    valueInputOption: 'RAW', // RAW = text is never treated as a formula
    requestBody: {
      values: [[
        id, customerName, customerPhone, address,
        jobCategory, workerName, new Date().toISOString(), 'New',
      ]],
    },
  });
  return id;
}

/** Delete bookings older than `days` days. Returns how many rows were removed. */
async function deleteOldBookings(days) {
  const sheetId = await getSheetId('Bookings');
  if (sheetId === null) return 0; // nothing booked yet

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: 'Bookings!G:G', // Timestamp column
  });

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = res.data.values || [];
  const requests = [];

  // Go bottom-to-top so earlier deletions don't shift the rows still to delete
  for (let i = rows.length - 1; i >= 1; i--) { // i = 0 is the header
    const time = new Date(rows[i][0]).getTime();
    if (!isNaN(time) && time < cutoff) {
      requests.push({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
        },
      });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID(),
      requestBody: { requests },
    });
  }
  return requests.length;
}

// ─── Exports ───

module.exports = {
  getActiveWorkers,
  getAllWorkers,
  addBooking,
  deleteOldBookings,
  addWorker,
  updateWorker,
  deleteWorker,
  getJobs,
  addJob,
  deleteJob,
  clearCache,
};
