import { Injectable } from '@angular/core';
import { Category, PaymentSource, TransactionKind, TransactionTag } from './models';

export interface ParsedTransaction {
  amount: number;
  kind: TransactionKind;
  merchant: string;
  notes: string;
  date: string;
  time?: string;
  tag: TransactionTag;
  categoryGuess: string;
  source?: PaymentSource;
}

@Injectable({ providedIn: 'root' })
export class SmartEntryService {
  private readonly DEFAULTS_KEY = 'et.lastUsedDefaults';

  getLastDefaults(): { categoryId: number | null; kind: TransactionKind; tag: TransactionTag } {
    try {
      const raw = localStorage.getItem(this.DEFAULTS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { categoryId: null, kind: 'expense', tag: 'need' };
  }

  saveDefaults(categoryId: number | null, kind: TransactionKind, tag: TransactionTag): void {
    try {
      localStorage.setItem(this.DEFAULTS_KEY, JSON.stringify({ categoryId, kind, tag }));
    } catch {}
  }

  /**
   * Parse Indian Bank/UPI SMS or natural language string:
   * e.g. "Sent Rs 450 to Swiggy on UPI", "Debited INR 1,299 at Netflix", "Paid 200 for coffee"
   */
  parseInput(input: string, availableCategories?: (Category | string)[]): ParsedTransaction | null {
    if (!input || !input.trim()) return null;
    const text = input.trim();
    const lower = text.toLowerCase();

    // 1. Determine Kind (Debit vs Credit)
    const isCredit = /(credited|deposited|received|refund|salary|income|added)/i.test(text) &&
                     !/(debited|paid|sent to|spent)/i.test(text);
    const kind: TransactionKind = isCredit ? 'income' : 'expense';

    // 2. Extract Amount
    // Matches Rs. 450, Rs 450.50, INR 1,299.00, ₹450, $50, 450.00
    let amount = 0;
    const amtMatch = text.match(/(?:(?:rs\.?|inr|₹|\$)\s*([\d,]+(?:\.\d{1,2})?))|(?:(?:spent|paid|sent|amount|debited by|credited by)\s*(?:rs\.?|inr|₹|\$)?\s*([\d,]+(?:\.\d{1,2})?))/i) ||
                     text.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:rs|inr|rupees)\b/i) ||
                     text.match(/\b\d+(?:\.\d{1,2})?\b/);

    if (amtMatch) {
      const valStr = (amtMatch[1] || amtMatch[2] || amtMatch[0]).replace(/,/g, '');
      const parsed = parseFloat(valStr);
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
      }
    }

    // 3. Extract Merchant / Recipient
    let merchant = '';
    const merchMatch = text.match(/(?:to|at|info:|vpa|merchant:)\s+([A-Za-z0-9\s&'-]{2,30}?)(?=\s+(?:on|via|ref|upi|using|for|avlbl|bal|\.|$))/i) ||
                       text.match(/(?:for)\s+([A-Za-z0-9\s&'-]{2,25}?)(?=\s+(?:on|at|via|\.|$))/i);
    if (merchMatch && merchMatch[1]) {
      merchant = merchMatch[1].trim();
    } else {
      const cleaned = text
        .replace(/(?:rs\.?|inr|₹|\$|debited|credited|paid|sent|via|upi|ref|ac|a\/c|bal|available|balance|on|at|for)\b/gi, '')
        .replace(/[\d,.]+/g, '')
        .trim();
      if (cleaned.length >= 2) {
        merchant = cleaned.slice(0, 30);
      }
    }

    if (!merchant) {
      merchant = isCredit ? 'Direct Credit' : 'Quick Payment';
    }

    // 4. Extract Category & 50/30/20 Tag
    const catNames: string[] = (availableCategories || []).map((c) =>
      typeof c === 'string' ? c : c.name
    );
    const systemCats = ['Food', 'Travel', 'Shopping', 'Utilities', 'Health', 'Entertainment', 'Salary', 'Freelance', 'Bonus'];
    const allKnownCats = Array.from(new Set([...catNames, ...systemCats]));

    let categoryGuess = 'Food';
    let tag: TransactionTag = 'need';

    // A. Check for explicit purpose / category phrase (e.g. "for Travel", "towards Rent", "category: Health", "cat Shopping")
    const purposeMatch = text.match(/(?:for|towards|under|as|category:?|cat:?)\s+([A-Za-z0-9\s&'-]{2,30}?)(?=\s+(?:on|via|ref|upi|using|to|at|avlbl|bal)|[.,!?;]|$|\s*$)/i);
    let matchedFromPurpose = false;

    if (purposeMatch && purposeMatch[1]) {
      const pStr = purposeMatch[1].trim().toLowerCase();

      // Check exact / partial category name match
      const exactCat = allKnownCats.find((c) => {
        const cLower = c.toLowerCase();
        return cLower === pStr || pStr.split(/\s+/).includes(cLower);
      });

      if (exactCat) {
        categoryGuess = exactCat;
        matchedFromPurpose = true;
        if (/travel|utilities|health/i.test(exactCat)) tag = 'need';
        else if (/shopping|entertainment/i.test(exactCat)) tag = 'want';
        else if (/salary|saving/i.test(exactCat)) tag = 'saving';
      } else if (/(groceries|grocery|food|lunch|dinner|breakfast|snack|snacks|meal|coffee|tea|cafe|restaurant|burger|pizza|biryani|bakery|fruits|vegetables|dining)/i.test(pStr)) {
        categoryGuess = 'Food';
        tag = /(groceries|fruits|vegetables)/i.test(pStr) ? 'need' : 'want';
        matchedFromPurpose = true;
      } else if (/(travel|flight|flights|airline|plane|train|metro|bus|cab|taxi|uber|ola|rapido|fuel|petrol|diesel|gas|toll|parking|hotel|trip|commute)/i.test(pStr)) {
        categoryGuess = 'Travel';
        tag = 'need';
        matchedFromPurpose = true;
      } else if (/(shopping|clothes|clothing|shoes|apparel|electronics|gadget|mall|books|gift|order|store)/i.test(pStr)) {
        categoryGuess = 'Shopping';
        tag = 'want';
        matchedFromPurpose = true;
      } else if (/(utilities|utility|bill|bills|rent|electricity|power|water|wifi|broadband|internet|recharge|mobile|phone|maintenance|emi)/i.test(pStr)) {
        categoryGuess = 'Utilities';
        tag = 'need';
        matchedFromPurpose = true;
      } else if (/(health|medicine|medicines|pharmacy|doctor|hospital|clinic|gym|fitness|dental|medical|care|tests|lab)/i.test(pStr)) {
        categoryGuess = 'Health';
        tag = 'need';
        matchedFromPurpose = true;
      } else if (/(entertainment|movie|movies|cinema|theatre|film|netflix|spotify|hotstar|prime|game|gaming|show|concert|events|party)/i.test(pStr)) {
        categoryGuess = 'Entertainment';
        tag = 'want';
        matchedFromPurpose = true;
      } else if (/(salary|freelance|bonus|stipend|wages|income|payout|dividend)/i.test(pStr)) {
        categoryGuess = 'Salary';
        tag = 'saving';
        matchedFromPurpose = true;
      }
    }

    // B. If not matched from explicit purpose phrase, check if text explicitly mentions any known category
    if (!matchedFromPurpose) {
      let detectedCatFromText: string | null = null;
      for (const c of allKnownCats) {
        const cLower = c.toLowerCase();
        const reg = new RegExp(`\\b${cLower}\\b`, 'i');
        if (reg.test(lower)) {
          detectedCatFromText = c;
          break;
        }
      }

      if (detectedCatFromText) {
        categoryGuess = detectedCatFromText;
        if (/travel|utilities|health/i.test(detectedCatFromText)) tag = 'need';
        else if (/shopping|entertainment/i.test(detectedCatFromText)) tag = 'want';
        else if (/salary|saving/i.test(detectedCatFromText)) tag = 'saving';
      } else if (isCredit) {
        categoryGuess = 'Salary';
        tag = 'saving';
      } else if (/(swiggy|zomato|starbucks|mcdonald|kfc|pizza|burger|lunch|dinner|cafe|restaurant|food|groceries|blinkit|zepto|instamart|dmart)/i.test(lower)) {
        categoryGuess = 'Food';
        tag = /(groceries|blinkit|zepto|instamart|dmart)/i.test(lower) ? 'need' : 'want';
      } else if (/(uber|ola|rapido|metro|fuel|petrol|diesel|flight|airline|train|irctc|travel|bus|toll)/i.test(lower)) {
        categoryGuess = 'Travel';
        tag = 'need';
      } else if (/(amazon|flipkart|myntra|zara|shopping|mall|clothes|shoes)/i.test(lower)) {
        categoryGuess = 'Shopping';
        tag = 'want';
      } else if (/(electricity|power|bescom|water|gas|wifi|broadband|airtel|jio|recharge|bill|rent|emi|maintenance)/i.test(lower)) {
        categoryGuess = 'Utilities';
        tag = 'need';
      } else if (/(pharmacy|apollo|hospital|doctor|medicine|clinic|health|gym|cult)/i.test(lower)) {
        categoryGuess = 'Health';
        tag = 'need';
      } else if (/(netflix|spotify|prime|hotstar|cinema|pvr|inox|movie|gaming|steam|entertainment)/i.test(lower)) {
        categoryGuess = 'Entertainment';
        tag = 'want';
      } else if (/(sip|mutual fund|zerodha|groww|stocks|investment|savings|deposit)/i.test(lower)) {
        categoryGuess = 'Salary';
        tag = 'saving';
      }
    }

    // 5. Extract Time & Date if present (fallback to random daytime time)
    let extractedTime = '';
    const timeMatch = text.match(/(?:at|time:?)\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)/i) ||
                      text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm]))\b/i) ||
                      text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
    if (timeMatch) {
      const raw = (timeMatch[1] || timeMatch[0]).trim();
      const m12 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/i);
      if (m12) {
        let hrs = parseInt(m12[1], 10);
        const mins = m12[2];
        const secs = m12[3] || '00';
        const ap = m12[4].toUpperCase();
        if (ap === 'PM' && hrs < 12) hrs += 12;
        if (ap === 'AM' && hrs === 12) hrs = 0;
        extractedTime = `${String(hrs).padStart(2, '0')}:${mins}:${secs}`;
      } else {
        const m24 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (m24) {
          extractedTime = `${m24[1].padStart(2, '0')}:${m24[2]}:${m24[3] || '00'}`;
        }
      }
    }

    if (!extractedTime) {
      const h = 8 + Math.floor(Math.random() * 14);
      const m = Math.floor(Math.random() * 60);
      const s = Math.floor(Math.random() * 60);
      extractedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    let parsedDate = '';
    const dmyMatch = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
    if (dmyMatch) {
      let yr = dmyMatch[3];
      if (yr.length === 2) yr = '20' + yr;
      const mo = dmyMatch[2].padStart(2, '0');
      const da = dmyMatch[1].padStart(2, '0');
      parsedDate = `${yr}-${mo}-${da}`;
    } else {
      parsedDate = new Date().toISOString().slice(0, 10);
    }

    // 6. Detect Payment Source from phrases (e.g. "via GPay", "on PhonePe", "via SuperMoney", "credit card", "in cash")
    let source: PaymentSource = 'Others';
    if (/(supermoney|super\s*money|super\s*cash|super\s*app)/i.test(lower)) {
      source = 'SuperMoney';
    } else if (/(phonepe|phone\s*pe|phone-pe)/i.test(lower)) {
      source = 'PhonePe';
    } else if (/(gpay|g-pay|google\s*pay|googlepay|google-pay)/i.test(lower)) {
      source = 'Google Pay';
    } else if (/(credit\s*card|creditcard|\bcc\b|amex|visa\s*card|mastercard)/i.test(lower)) {
      source = 'Credit Card';
    } else if (/(debit\s*card|debitcard|\bdc\b|atm\s*card)/i.test(lower)) {
      source = 'Debit Card';
    } else if (/\b(cash|in\s*cash|by\s*cash|paid\s*cash)\b/i.test(lower)) {
      source = 'Cash';
    }

    return {
      amount,
      kind,
      merchant,
      notes: text.length > 80 ? text.slice(0, 120) + '...' : text,
      date: parsedDate,
      time: extractedTime,
      tag,
      categoryGuess,
      source,
    };
  }
}
