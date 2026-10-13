import { Injectable } from '@angular/core';
import { TransactionKind, TransactionTag } from './models';

export interface ParsedTransaction {
  amount: number;
  kind: TransactionKind;
  merchant: string;
  notes: string;
  date: string;
  tag: TransactionTag;
  categoryGuess: string;
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
  parseInput(input: string): ParsedTransaction | null {
    if (!input || !input.trim()) return null;
    const text = input.trim();

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
    // Look for patterns like "to <Merchant>", "at <Merchant>", "info: <Merchant>", "paid to <Merchant>"
    const merchMatch = text.match(/(?:to|at|info:|vpa|merchant:)\s+([A-Za-z0-9\s&'-]{2,30}?)(?=\s+(?:on|via|ref|upi|using|for|avlbl|bal|\.|$))/i) ||
                       text.match(/(?:for)\s+([A-Za-z0-9\s&'-]{2,25}?)(?=\s+(?:on|at|via|\.|$))/i);
    if (merchMatch && merchMatch[1]) {
      merchant = merchMatch[1].trim();
    } else {
      // Fallback: strip numbers and common transaction keywords
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

    // 4. Guess Category & 50/30/20 Tag
    const lower = text.toLowerCase();
    let categoryGuess = 'Food';
    let tag: TransactionTag = 'need';

    if (isCredit) {
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

    const today = new Date().toISOString().slice(0, 10);
    return {
      amount,
      kind,
      merchant,
      notes: text.length > 80 ? text.slice(0, 120) + '...' : text,
      date: today,
      tag,
      categoryGuess,
    };
  }
}
