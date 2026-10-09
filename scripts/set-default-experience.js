/**
 * One-time setup: add the "Experience" column (G) to the Workers tab and
 * fill 5 for every worker that has no value yet. Safe to run again — it
 * never overwrites a value that is already there.
 *
 *   node --env-file=.env scripts/set-default-experience.js
 */

const { google } = require('googleapis');

const DEFAULT = 5;

function privateKey(raw = '') {
  const k = raw.replace(/"/g, '').replace(/\\n/g, '\n');
  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';
  if (!k.includes(begin)) return k;
  const body = k.replace(begin, '').replace(end, '').replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
  return `${begin}\n${body}\n${end}\n`;
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey(process.env.GOOGLE_PRIVATE_KEY),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Workers!A1:G' });
  const rows = res.data.values || [];
  if (rows.length === 0) throw new Error('Workers tab is empty');

  // Column G for every row: header first, then each worker
  let filled = 0;
  const column = rows.map((row, i) => {
    if (i === 0) return [row[6] || 'Experience'];
    if (!row[0]) return [row[6] || ''];        // blank row — leave it
    if (row[6] !== undefined && row[6] !== '') return [row[6]];
    filled++;
    return [DEFAULT];
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Workers!G1:G${rows.length}`,
    valueInputOption: 'RAW',
    requestBody: { values: column },
  });

  console.log(`Experience column ready. Set ${filled} worker(s) to ${DEFAULT}; ${rows.length - 1 - filled} already had a value.`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
