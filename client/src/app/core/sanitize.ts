/**
 * Client-side sanitization and validation for notes.
 * Guarantees notes are strictly plain text and numbers (no HTML, images, or scripts).
 */

export function isValidPlainTextNotes(val: string | null | undefined): boolean {
  if (!val) return true;
  // Strictly disallow angle brackets (< >) to prevent any HTML/XML/SVG/tags
  if (/[<>]/.test(val)) return false;
  // Disallow javascript/vbscript protocols
  if (/(?:javascript|vbscript)\s*:/i.test(val)) return false;
  // Disallow data:image
  if (/data\s*:\s*image/i.test(val)) return false;
  // Disallow markdown image syntax ![alt](url)
  if (/!\[.*?\]\(.*?\)/.test(val)) return false;
  // Disallow event handlers like onerror=, onload=
  if (/\bon\w+\s*=/i.test(val)) return false;

  return true;
}

export function sanitizeNotes(val: string | null | undefined, maxLen = 10000): string {
  if (!val) return '';
  let str = String(val);

  // 1. Remove non-printable control characters
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Remove markdown images
  str = str.replace(/!\[.*?\]\(.*?\)/g, '');

  // 3. Remove any HTML tags or brackets
  str = str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');

  // 4. Remove script protocols
  str = str.replace(/javascript\s*:/gi, '');
  str = str.replace(/vbscript\s*:/gi, '');
  str = str.replace(/data\s*:\s*image[^;,\s]*/gi, '');

  // 5. Remove event handlers
  str = str.replace(/\bon\w+\s*=/gi, '');

  str = str.trim();
  return str.slice(0, maxLen);
}
