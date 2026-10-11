import { Injectable, signal } from '@angular/core';

export interface CurrencyRate {
  code: string;
  symbol: string;
  name: string;
  rateToUsd: number; // units per 1 USD
}

export const SUPPORTED_CURRENCIES: CurrencyRate[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', rateToUsd: 1.0 },
  { code: 'EUR', symbol: '€', name: 'Euro', rateToUsd: 0.92 },
  { code: 'GBP', symbol: '£', name: 'British Pound', rateToUsd: 0.79 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', rateToUsd: 83.5 },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', rateToUsd: 1.36 },
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar', rateToUsd: 1.52 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rateToUsd: 154.0 },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', rateToUsd: 3.67 },
  { code: 'SGD', symbol: 'SG$', name: 'Singapore Dollar', rateToUsd: 1.35 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', rateToUsd: 0.91 },
];

@Injectable({
  providedIn: 'root'
})
export class FxService {
  readonly currencies = SUPPORTED_CURRENCIES;
  private readonly rateMap = new Map<string, number>(
    SUPPORTED_CURRENCIES.map((c) => [c.code.toUpperCase(), c.rateToUsd])
  );

  /** Convert an amount from one currency to another */
  convert(amount: number, fromCode: string, toCode: string): number {
    const from = fromCode.toUpperCase();
    const to = toCode.toUpperCase();
    if (from === to) return amount;

    const fromRate = this.rateMap.get(from) || 1.0;
    const toRate = this.rateMap.get(to) || 1.0;

    // Convert to base USD first, then into target currency
    const amountInUsd = amount / fromRate;
    return Math.round(amountInUsd * toRate * 100) / 100;
  }

  /** Detect if user included a currency symbol or prefix (e.g. €20, ₹500, £10, $50) */
  detectCurrency(text: string): { code: string; symbol: string; amount: number; rawText: string } | null {
    const trimmed = text.trim();
    // Match patterns like: €25, $50.50, ₹1200, £15, 25 eur, 50 inr, 10 gbp
    const prefixRegex = /^([$€£₹¥]|AED|CAD|AUD|SGD|CHF)\s*([0-9]+(?:\.[0-9]{1,2})?)/i;
    const suffixRegex = /^([0-9]+(?:\.[0-9]{1,2})?)\s*([$€£₹¥]|USD|EUR|GBP|INR|JPY|CAD|AUD|AED|SGD|CHF)/i;

    const pMatch = trimmed.match(prefixRegex);
    if (pMatch) {
      const symOrCode = pMatch[1].toUpperCase();
      const amt = parseFloat(pMatch[2]);
      const matched = this.matchSymbolOrCode(symOrCode);
      if (matched && !isNaN(amt)) {
        return { code: matched.code, symbol: matched.symbol, amount: amt, rawText: pMatch[0] };
      }
    }

    const sMatch = trimmed.match(suffixRegex);
    if (sMatch) {
      const amt = parseFloat(sMatch[1]);
      const symOrCode = sMatch[2].toUpperCase();
      const matched = this.matchSymbolOrCode(symOrCode);
      if (matched && !isNaN(amt)) {
        return { code: matched.code, symbol: matched.symbol, amount: amt, rawText: sMatch[0] };
      }
    }

    return null;
  }

  private matchSymbolOrCode(val: string): CurrencyRate | null {
    const v = val.toUpperCase();
    if (v === '€' || v === 'EUR') return this.find('EUR');
    if (v === '£' || v === 'GBP') return this.find('GBP');
    if (v === '₹' || v === 'INR') return this.find('INR');
    if (v === '¥' || v === 'JPY') return this.find('JPY');
    if (v === '$' || v === 'USD') return this.find('USD');
    if (v === 'CAD' || v === 'CA$') return this.find('CAD');
    if (v === 'AUD' || v === 'AU$') return this.find('AUD');
    if (v === 'AED') return this.find('AED');
    if (v === 'SGD' || v === 'SG$') return this.find('SGD');
    if (v === 'CHF') return this.find('CHF');
    return null;
  }

  find(code: string): CurrencyRate | null {
    return this.currencies.find((c) => c.code === code.toUpperCase()) || null;
  }
}
