'use strict';
/**
 * Money helpers — amounts are INTEGER CENTS everywhere in storage & math.
 * Floating point dollars only appear at the JSON boundary.
 */

/** '12.34' | 12.34 | '12' → 1234 */
function toCents(value) {
  if (typeof value === 'number') return Math.round(value * 100);
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    const err = new Error(`Invalid amount: ${value}`);
    err.status = 400;
    throw err;
  }
  const [whole, frac = ''] = s.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}

/** 1234 → 12.34 (number, safe for JSON display) */
function fromCents(cents) {
  return cents / 100;
}

/** 1234 → '1,234.00' */
function formatCents(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

module.exports = { toCents, fromCents, formatCents };
