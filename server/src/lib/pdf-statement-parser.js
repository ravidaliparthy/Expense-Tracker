'use strict';
const { PDFParse } = require('pdf-parse');

const MONTH_MAP = {
  january: '01', jan: '01',
  february: '02', feb: '02',
  march: '03', mar: '03',
  april: '04', apr: '04',
  may: '05',
  june: '06', jun: '06',
  july: '07', jul: '07',
  august: '08', aug: '08',
  september: '09', sep: '09', sept: '09',
  october: '10', oct: '10',
  november: '11', nov: '11',
  december: '12', dec: '12'
};

function standardizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  const clean = rawDate.trim();

  // Match: 22 September 2026 or 22 Sep 2026
  const textMonth = clean.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (textMonth) {
    const d = textMonth[1].padStart(2, '0');
    const m = MONTH_MAP[textMonth[2].toLowerCase()] || '01';
    const y = textMonth[3];
    return `${y}-${m}-${d}`;
  }

  // Match: September 22, 2026
  const monthFirst = clean.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthFirst) {
    const m = MONTH_MAP[monthFirst[1].toLowerCase()] || '01';
    const d = monthFirst[2].padStart(2, '0');
    const y = monthFirst[3];
    return `${y}-${m}-${d}`;
  }

  // Match: DD/MM/YYYY or DD-MM-YYYY
  const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // Match: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  return new Date().toISOString().slice(0, 10);
}

function guessCategory(merchant, isIncome, userCategories = []) {
  const m = (merchant || '').toLowerCase();
  const catNames = userCategories.map((c) => ({ name: c.name, lower: c.name.toLowerCase() }));

  const findCat = (...keywords) => {
    for (const kw of keywords) {
      const match = catNames.find((c) => c.lower.includes(kw));
      if (match) return match.name;
    }
    return null;
  };

  if (isIncome) {
    const incomeCat = findCat('salary', 'income', 'freelance', 'bonus', 'credit');
    if (incomeCat) return incomeCat;
  }

  if (/(institute|college|school|university|coaching|exam|academy|classes|tuition|education)/.test(m)) {
    const found = findCat('education', 'studies', 'fees', 'tuition');
    if (found) return found;
  }

  if (/(rice|store|grocery|groceries|supermarket|mart|food|cafe|restaurant|bakery|swiggy|zomato|blinkit|zepto|instamart|bazaar|provisions)/.test(m)) {
    const found = findCat('food', 'groceries', 'dining');
    if (found) return found;
  }

  if (/(hospital|pharma|chemist|clinic|lab|doctor|med|health|dental|optical)/.test(m)) {
    const found = findCat('health', 'medical', 'wellness');
    if (found) return found;
  }

  if (/(petrol|fuel|oil|uber|ola|rapido|metro|transit|travel|flight|irctc|bus|train)/.test(m)) {
    const found = findCat('travel', 'transport', 'fuel');
    if (found) return found;
  }

  if (/(electric|power|bescom|cesc|water|gas|broadband|wifi|recharge|jio|airtel|vi|bill|utility)/.test(m)) {
    const found = findCat('utilities', 'bills', 'electricity');
    if (found) return found;
  }

  if (/(amazon|flipkart|myntra|ajio|meesho|zara|h&m|cloth|shopping|store)/.test(m)) {
    const found = findCat('shopping', 'clothing', 'retail');
    if (found) return found;
  }

  if (/(netflix|spotify|prime|hotstar|bookmyshow|cinema|movie|theatre|entertainment)/.test(m)) {
    const found = findCat('entertainment', 'leisure', 'fun');
    if (found) return found;
  }

  // Fallback: prefer General / Other / Miscellaneous if available
  const generalCat = userCategories.find((c) => /general|other|misc|uncategorized/i.test(c.name));
  if (generalCat) return generalCat.name;

  const defaultExpense = userCategories.find((c) => !c.name.toLowerCase().includes('salary') && !c.name.toLowerCase().includes('freelance'));
  return defaultExpense ? defaultExpense.name : (userCategories[0]?.name || 'General');
}

/**
 * Parses extracted text from a statement PDF (supports UPI History & Bank Statements).
 */
function parseStatementText(text, userCategories = []) {
  if (!text || typeof text !== 'string') return [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Filter out obvious header/footer metadata or date range subtitles
    if (/^(transaction history|name\s+bank|powered by|page\s+\d+|statement period|account number)/i.test(line)) {
      continue;
    }
    // Filter out date ranges like "20 September 2026 to 23 September 2026"
    if (/\bto\b.*\d{4}/i.test(line) && /\b\d{4}\b/.test(line.slice(0, 20))) {
      continue;
    }

    // 1. Check for single-line UPI format:
    // "Indian Institute of HDFC 4194 -2000.00 22 September 2026 SUCCESS"
    const dateMatch = line.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2})\b/);
    if (dateMatch) {
      const rawDate = dateMatch[1];
      const dateIdx = dateMatch.index;
      const beforeDate = line.slice(0, dateIdx).trim();
      const afterDate = line.slice(dateIdx + rawDate.length).trim();

      // Look for amount immediately before date
      const amtMatch = beforeDate.match(/([-+]?\s*(?:₹|\$|USD|INR)?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*$/);
      if (amtMatch) {
        const rawAmt = amtMatch[1].replace(/[^\d.-]/g, '');
        const numAmt = parseFloat(rawAmt);
        if (!isNaN(numAmt) && numAmt !== 0) {
          const textBeforeAmt = beforeDate.slice(0, amtMatch.index).trim();
          if (textBeforeAmt) {
            // Check for bank ref: e.g. HDFC 4194
            const bankMatch = textBeforeAmt.match(/\b([A-Za-z]+\s+\d{3,6})\s*$/);
            let merchant = textBeforeAmt;
            let bankRef = '';
            if (bankMatch) {
              bankRef = bankMatch[1];
              merchant = textBeforeAmt.slice(0, bankMatch.index).trim();
            }
            if (!merchant && bankRef) {
              merchant = bankRef;
              bankRef = '';
            }

            const isIncome = numAmt > 0 && (afterDate.toLowerCase().includes('credit') || !line.includes('-'));
            const kind = (numAmt < 0 || line.includes('-' + Math.abs(numAmt).toFixed(2))) ? 'expense' : (isIncome ? 'income' : 'expense');
            const absAmt = Math.abs(numAmt);
            const date = standardizeDate(rawDate);
            const status = afterDate ? afterDate.slice(0, 30) : 'SUCCESS';

            // Clean merchant name
            const cleanMerchant = (merchant || 'UPI Transaction').replace(/^[-*•\s]+|[-*•\s]+$/g, '').slice(0, 100);
            const category = guessCategory(cleanMerchant, kind === 'income', userCategories);

            results.push({
              date,
              amountCents: Math.round(absAmt * 100),
              merchant: cleanMerchant,
              bankRef,
              status,
              kind,
              tag: kind === 'income' ? 'saving' : 'need',
              category,
              notes: bankRef ? `Ref: ${bankRef} · Status: ${status}` : `Status: ${status}`,
              selected: true
            });
            continue;
          }
        }
      }
    }

    // 2. Check for Bank Statement format with Date at start:
    // "22/09/2026 Indian Institute of -2000.00 SUCCESS"
    const startMatch = line.match(/^(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(.*)/);
    if (startMatch) {
      const rawDate = startMatch[1];
      const rest = startMatch[2];
      const amtMatch = rest.match(/([-+]?\s*(?:₹|\$|USD|INR)?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
      if (amtMatch) {
        const rawAmt = amtMatch[1].replace(/[^\d.-]/g, '');
        const numAmt = parseFloat(rawAmt);
        if (!isNaN(numAmt) && numAmt !== 0) {
          const merchant = rest.slice(0, amtMatch.index).trim() || 'Bank Transaction';
          const isExpense = numAmt < 0 || /dr|debit/i.test(rest);
          const kind = isExpense ? 'expense' : 'income';
          const absAmt = Math.abs(numAmt);
          const date = standardizeDate(rawDate);
          const cleanMerchant = merchant.slice(0, 100);
          const category = guessCategory(cleanMerchant, kind === 'income', userCategories);

          results.push({
            date,
            amountCents: Math.round(absAmt * 100),
            merchant: cleanMerchant,
            bankRef: '',
            status: 'COMPLETED',
            kind,
            tag: kind === 'income' ? 'saving' : 'need',
            category,
            notes: 'Imported from statement PDF',
            selected: true
          });
          continue;
        }
      }
    }
  }

  return results;
}

/**
 * Extracts and parses transaction records from a PDF buffer or Uint8Array.
 */
async function parsePdfBuffer(buffer, userCategories = []) {
  let uint8;
  if (Buffer.isBuffer(buffer)) {
    uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else if (buffer instanceof Uint8Array && buffer.constructor.name === 'Uint8Array') {
    uint8 = buffer;
  } else {
    uint8 = new Uint8Array(buffer);
  }
  const parser = new PDFParse(uint8);
  await parser.load();
  const res = await parser.getText();
  const text = res?.text || '';
  return parseStatementText(text, userCategories);
}

module.exports = {
  parsePdfBuffer,
  parseStatementText,
  standardizeDate,
  guessCategory
};
