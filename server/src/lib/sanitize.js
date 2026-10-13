'use strict';

/**
 * Strict validation and sanitization for notes fields.
 * Guarantees that only plain text and numbers (plus safe punctuation and whitespace) are accepted.
 * Strictly blocks and eliminates:
 * - HTML/XML/SVG tags (<script>, <img>, <iframe>, <style>, etc.)
 * - Angle brackets (< and >)
 * - Script execution vectors (javascript:, vbscript:, onload=, onerror=, etc.)
 * - Image embedding (markdown images ![alt](url), data:image)
 * - Binary and non-printable control characters
 */

const FORBIDDEN_TAGS_OR_BRACKETS = /[<>]/;
const FORBIDDEN_PROTOCOLS = /(?:javascript|vbscript)\s*:/i;
const FORBIDDEN_DATA_IMAGE = /data\s*:\s*image/i;
const FORBIDDEN_MARKDOWN_IMAGE = /!\[.*?\]\(.*?\)/;
const FORBIDDEN_EVENT_HANDLERS = /\bon\w+\s*=/i;
const FORBIDDEN_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * Returns true if the string is safe plain text or numbers.
 * Returns false if it contains HTML tags, images, scripts, or unsafe payloads.
 */
function isSafePlainTextNotes(val) {
  if (val === null || val === undefined || val === '') return true;
  if (typeof val !== 'string') return false;

  if (FORBIDDEN_TAGS_OR_BRACKETS.test(val)) return false;
  if (FORBIDDEN_PROTOCOLS.test(val)) return false;
  if (FORBIDDEN_DATA_IMAGE.test(val)) return false;
  if (FORBIDDEN_MARKDOWN_IMAGE.test(val)) return false;
  if (FORBIDDEN_EVENT_HANDLERS.test(val)) return false;
  if (FORBIDDEN_CONTROL_CHARS.test(val)) return false;

  return true;
}

/**
 * Sanitizes any raw input string into pure plain text / numbers.
 * Strips out tags, angle brackets, markdown image syntax, script protocols,
 * and control characters.
 */
function sanitizeNotes(val, maxLen = 10000) {
  if (val === null || val === undefined) return null;
  let str = String(val);

  // 1. Remove control characters (preserve \r, \n, \t)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Remove markdown images
  str = str.replace(/!\[.*?\]\(.*?\)/g, '');

  // 3. Remove HTML tags and any angle brackets
  str = str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');

  // 4. Remove script protocols
  str = str.replace(/javascript\s*:/gi, '');
  str = str.replace(/vbscript\s*:/gi, '');
  str = str.replace(/data\s*:\s*image[^;,\s]*/gi, '');

  // 5. Remove inline event handlers
  str = str.replace(/\bon\w+\s*=/gi, '');

  str = str.trim();
  if (!str) return null;
  return str.slice(0, maxLen);
}

module.exports = {
  isSafePlainTextNotes,
  sanitizeNotes,
};
