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

function getSheets() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Fix for Vercel/.env: replace literal "\n" and remove any surrounding quotes
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '')
        .replace(/\\n/g, '\n')
        .replace(/"/g, ''),
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
// Columns: A = ID | B = Name | C = Phone | D = Job | E = Active | F = WhatsApp

/**
 * Read every row from the Workers tab (including inactive).
 * Returns full data — only used internally and by admin.
 */
async function getAllWorkersRaw() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: 'Workers!A2:F', // skip header row
  });

  return (res.data.values || []).map((row) => ({
    id:       row[0] || '',
    name:     row[1] || '',
    phone:    row[2] || '',
    job:      row[3] || '',
    active:   (row[4] || 'No').trim().toLowerCase() === 'yes',
    whatsapp: (row[5] || 'No').trim().toLowerCase() === 'yes',
  }));
}

/**
 * PUBLIC — Active workers WITHOUT phone numbers (cached 60s).
 * This is what customers see.
 */
async function getActiveWorkers() {
  const now = Date.now();
  if (workersCache && now - workersCacheTime < CACHE_TTL) {
    return workersCache;
  }

  const all = await getAllWorkersRaw();
  workersCache = all
    .filter((w) => w.active)
    .map(({ id, name, job, whatsapp }) => ({ id, name, job, whatsapp }));
  workersCacheTime = now;
  return workersCache;
}

/**
 * ADMIN — All workers including inactive, with phone numbers.
 */
async function getAllWorkers() {
  const all = await getAllWorkersRaw();
  return all.map(({ id, name, phone, job, active, whatsapp }) => ({
    id, name, phone, job, active, whatsapp,
  }));
}

/**
 * Get a single worker's phone number by ID (only if active).
 * Returns { phone, whatsapp, job } or null.
 */
async function getWorkerPhone(id) {
  const all = await getAllWorkersRaw();
  const worker = all.find((w) => w.id === id && w.active);
  if (!worker) return null;
  return { phone: worker.phone, whatsapp: worker.whatsapp, job: worker.job };
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
async function addWorker({ name, phone, job, whatsapp }) {
  const sheets = getSheets();
  const id = generateId();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: 'Workers!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, name, phone, job, 'Yes', whatsapp ? 'Yes' : 'No']],
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
async function updateWorker(id, { name, phone, job, active, whatsapp }) {
  const row = await findWorkerRow(id);
  if (row < 2) return false; // not found or is the header

  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: `Workers!A${row}:F${row}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[id, name, phone, job, active ? 'Yes' : 'No', whatsapp ? 'Yes' : 'No']],
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

// ─── Exports ───

module.exports = {
  getActiveWorkers,
  getAllWorkers,
  getWorkerPhone,
  addWorker,
  updateWorker,
  deleteWorker,
  getJobs,
  addJob,
  deleteJob,
  clearCache,
};
