'use strict';
const { PDFParse } = require('pdf-parse');
const { sanitizeNotes } = require('./sanitize');

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

/**
 * Sanitizes raw text string to prevent control character injection or HTML tags.
 */
function sanitizeText(str, maxLen = 120) {
  if (!str) return '';
  return String(str)
    .replace(/[\x00-\x1F\x7F<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function standardizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  const clean = rawDate.trim();

  // Match: Sep 13, 2026 or September 13, 2026
  const monthFirst = clean.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthFirst) {
    const m = MONTH_MAP[monthFirst[1].toLowerCase()] || '01';
    const d = monthFirst[2].padStart(2, '0');
    const y = monthFirst[3];
    return `${y}-${m}-${d}`;
  }

  // Match: 13 Sep 2026 or 13 September 2026
  const dayFirst = clean.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (dayFirst) {
    const d = dayFirst[1].padStart(2, '0');
    const m = MONTH_MAP[dayFirst[2].toLowerCase()] || '01';
    const y = dayFirst[3];
    return `${y}-${m}-${d}`;
  }

  // Match: DD/MM/YYYY or DD-MM-YYYY
  const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // Match: YYYY-MM-DD
  const ymd = clean.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
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

  if (/(institute|college|school|university|coaching|exam|academy|classes|tuition|education|study)/.test(m)) {
    const found = findCat('education', 'studies', 'fees', 'tuition');
    if (found) return found;
  }

  if (/(rice|store|grocery|groceries|supermarket|mart|food|cafe|restaurant|bakery|swiggy|zomato|blinkit|zepto|instamart|bazaar|provisions|tiffin|kitchen|hotel)/.test(m)) {
    const found = findCat('food', 'groceries', 'dining');
    if (found) return found;
  }

  if (/(hospital|pharma|chemist|clinic|lab|doctor|med|health|dental|optical|diagnostics)/.test(m)) {
    const found = findCat('health', 'medical', 'wellness');
    if (found) return found;
  }

  if (/(petrol|fuel|oil|uber|ola|rapido|metro|transit|travel|flight|irctc|bus|train|cab|auto|railway)/.test(m)) {
    const found = findCat('travel', 'transport', 'fuel');
    if (found) return found;
  }

  if (/(electric|power|bescom|cesc|water|gas|broadband|wifi|recharge|jio|airtel|vi|bill|utility|cylinder)/.test(m)) {
    const found = findCat('utilities', 'bills', 'electricity');
    if (found) return found;
  }

  if (/(amazon|flipkart|myntra|ajio|meesho|zara|h&m|cloth|shopping|store|apparel)/.test(m)) {
    const found = findCat('shopping', 'clothing', 'retail');
    if (found) return found;
  }

  if (/(netflix|spotify|prime|hotstar|bookmyshow|cinema|movie|theatre|entertainment|pvr|inox)/.test(m)) {
    const found = findCat('entertainment', 'leisure', 'fun');
    if (found) return found;
  }

  const generalCat = userCategories.find((c) => /general|other|misc|uncategorized/i.test(c.name));
  if (generalCat) return generalCat.name;

  const defaultExpense = userCategories.find((c) => !c.name.toLowerCase().includes('salary') && !c.name.toLowerCase().includes('freelance'));
  return defaultExpense ? defaultExpense.name : (userCategories[0]?.name || 'General');
}

/**
 * Universal Statement Parser:
 * Supports PhonePe PDF statements, Bank Statement PDFs, UPI history tables, and spreadsheets.
 */
function parseStatementText(text, userCategories = []) {
  if (!text || typeof text !== 'string') return [];

  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results = [];

  // ==========================================================
  // Strategy 1: PhonePe Multi-Line Transaction Block Parsing
  // ==========================================================
  const dateLineRegex = /^(?:[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)?$/;

  const blockStartIndices = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    // Ignore header date range lines like "Sep 13, 2026 - Oct 13, 2026"
    if (/\b(?:to|-)\b/i.test(l) && /\b[A-Za-z]{3,9}\s+\d{1,2}.*(?:to|-).*\d{4}/i.test(l)) continue;
    if (/statement|transaction\s+details|date\s+transaction/i.test(l)) continue;

    if (dateLineRegex.test(l)) {
      blockStartIndices.push(i);
    }
  }

  if (blockStartIndices.length > 0) {
    for (let b = 0; b < blockStartIndices.length; b++) {
      const startIdx = blockStartIndices[b];
      const endIdx = (b + 1 < blockStartIndices.length) ? blockStartIndices[b + 1] : Math.min(rawLines.length, startIdx + 12);
      const blockLines = rawLines.slice(startIdx, endIdx);

      const rawDate = blockLines[0];
      const isoDate = standardizeDate(rawDate);

      let merchant = '';
      let rawType = '';
      let rawAmount = '';
      let txnId = '';
      let utrNo = '';
      let accountRef = '';
      let timeStr = '';

      for (let j = 1; j < blockLines.length; j++) {
        const line = blockLines[j];

        // Check for time: e.g. "04:27 PM" or "21:06"
        if (/^\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?$/.test(line)) {
          timeStr = line;
          continue;
        }

        // Check for description: "Received from ..." or "Paid to ..."
        if (/^(?:Received\s+from|Paid\s+to)\s+/i.test(line)) {
          merchant = line;
          if (/^Received\s+from/i.test(line)) rawType = 'Credit';
          if (/^Paid\s+to/i.test(line)) rawType = 'Debit';
          continue;
        }

        // Check for Txn ID
        const txnMatch = line.match(/Transaction\s+ID\s*[:\s]\s*([A-Za-z0-9]+)/i);
        if (txnMatch) {
          txnId = txnMatch[1];
          continue;
        }

        // Check for UTR
        const utrMatch = line.match(/UTR\s+No\s*[:\s]\s*([A-Za-z0-9]+)/i);
        if (utrMatch) {
          utrNo = utrMatch[1];
          continue;
        }

        // Check for Account
        const accMatch = line.match(/(?:Credited\s+to|Debited\s+from)\s*(XX\w+|\w+)/i);
        if (accMatch) {
          accountRef = accMatch[1];
          if (/Credited/i.test(line)) rawType = 'Credit';
          if (/Debited/i.test(line)) rawType = 'Debit';
          continue;
        }

        // Check for Type
        if (/\b(?:Credit|Debit)\b/i.test(line)) {
          const typeMatch = line.match(/\b(Credit|Debit)\b/i);
          if (typeMatch) rawType = typeMatch[1];
        }

        // Check for Amount
        if (/(?:INR|₹|\$)\s*[-+]?\d+(?:,\d{3})*(?:\.\d{1,2})?/i.test(line) || /[-+]?\d+\.\d{2}/.test(line)) {
          const amtMatch = line.match(/(?:INR|₹|\$)?\s*([-+]?\d+(?:,\d{3})*(?:\.\d{1,2})?)/i);
          if (amtMatch) rawAmount = amtMatch[1];
        }
      }

      const numAmt = parseFloat((rawAmount || '').replace(/[^\d.-]/g, ''));
      if (!isNaN(numAmt) && numAmt > 0 && merchant) {
        const isIncome = rawType.toLowerCase() === 'credit' || /received\s+from/i.test(merchant);
        const kind = isIncome ? 'income' : 'expense';
        const tag = isIncome ? 'saving' : 'need';

        let cleanName = merchant
          .replace(/^Received\s+from\s+/i, '')
          .replace(/^Paid\s+to\s+/i, '')
          .trim();
        if (!cleanName) cleanName = merchant;

        cleanName = sanitizeText(cleanName, 80);
        const category = guessCategory(cleanName, kind === 'income', userCategories);

        const notesParts = [];
        if (merchant) notesParts.push(merchant);
        if (accountRef) notesParts.push(`Acc: ${accountRef}`);
        if (txnId) notesParts.push(`Txn: ${txnId}`);
        if (utrNo) notesParts.push(`UTR: ${utrNo}`);
        if (timeStr) notesParts.push(`Time: ${timeStr}`);

        results.push({
          date: isoDate,
          amountCents: Math.round(numAmt * 100),
          merchant: cleanName,
          bankRef: accountRef || '',
          status: 'SUCCESS',
          kind,
          tag,
          category,
          notes: sanitizeText(notesParts.join(' · '), 160),
          selected: true
        });
      }
    }
  }

  // If Strategy 1 captured rows, return them!
  if (results.length > 0) {
    return results;
  }

  // ==========================================================
  // Strategy 2: Tabular Single-Line / Bank / UPI Parsing
  // ==========================================================
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (/^(transaction history|name\s+bank|powered by|page\s+\d+|statement period|account number|date\s+transaction)/i.test(line)) {
      continue;
    }
    if (/\b(?:to|-)\b/i.test(line) && /\b[A-Za-z]{3,9}\s+\d{1,2}.*(?:to|-).*\d{4}/i.test(line)) {
      continue;
    }

    // Tabular layout (Image 3):
    // "2026-09-04 21:06 Received from DSV T260904210602017 769364855210 Credit XXXXXX4194 1000"
    const tabMatch = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+(.*?)\s+(Credit|Debit)\s+([X\w]+)\s+(\d+(?:\.\d+)?)$/i);
    if (tabMatch) {
      const rawDate = tabMatch[1];
      const rawTime = tabMatch[2];
      const descPart = tabMatch[3];
      const typePart = tabMatch[4];
      const accPart = tabMatch[5];
      const numAmt = parseFloat(tabMatch[6]);

      if (!isNaN(numAmt) && numAmt > 0) {
        const isIncome = typePart.toLowerCase() === 'credit';
        const kind = isIncome ? 'income' : 'expense';
        const tag = isIncome ? 'saving' : 'need';

        let cleanMerchant = descPart
          .replace(/[TS]\d{15,25}/gi, '')
          .replace(/\b\d{10,14}\b/g, '')
          .replace(/^Received\s+from\s+/i, '')
          .replace(/^Paid\s+to\s+/i, '')
          .trim();

        if (!cleanMerchant) cleanMerchant = descPart.slice(0, 40);
        cleanMerchant = sanitizeText(cleanMerchant, 80);
        const category = guessCategory(cleanMerchant, kind === 'income', userCategories);

        results.push({
          date: standardizeDate(rawDate),
          amountCents: Math.round(numAmt * 100),
          merchant: cleanMerchant,
          bankRef: accPart,
          status: 'SUCCESS',
          kind,
          tag,
          category,
          notes: sanitizeNotes(`${descPart} · Acc: ${accPart} · Time: ${rawTime}`, 160) || '',
          selected: true
        });
        continue;
      }
    }

    // Earlier UPI layout:
    // "Indian Institute of HDFC 4194 -2000.00 22 September 2026 SUCCESS"
    const dateMatch = line.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2})\b/);
    if (dateMatch) {
      const rawDate = dateMatch[1];
      const dateIdx = dateMatch.index;
      const beforeDate = line.slice(0, dateIdx).trim();
      const afterDate = line.slice(dateIdx + rawDate.length).trim();

      const amtMatch = beforeDate.match(/([-+]?\s*(?:₹|\$|USD|INR)?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*$/);
      if (amtMatch) {
        const rawAmt = amtMatch[1].replace(/[^\d.-]/g, '');
        const numAmt = parseFloat(rawAmt);
        if (!isNaN(numAmt) && numAmt !== 0) {
          const textBeforeAmt = beforeDate.slice(0, amtMatch.index).trim();
          if (textBeforeAmt) {
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

            const cleanMerchant = sanitizeText((merchant || 'UPI Transaction').replace(/^[-*•\s]+|[-*•\s]+$/g, ''), 80);
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
              notes: sanitizeNotes(bankRef ? `Ref: ${bankRef} · Status: ${status}` : `Status: ${status}`, 160) || '',
              selected: true
            });
            continue;
          }
        }
      }
    }
  }

  return results;
}

/**
 * Extracts and parses transaction records from a PDF buffer or Uint8Array.
 * Enforces strict security constraints: buffer size limits, memory safety.
 */
async function parsePdfBuffer(buffer, userCategories = []) {
  if (!buffer) return [];
  const maxBytes = 15 * 1024 * 1024; // 15MB security limit
  if (buffer.length > maxBytes) {
    throw new Error('PDF file exceeds maximum allowed size of 15MB.');
  }

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
  guessCategory,
  sanitizeText
};
