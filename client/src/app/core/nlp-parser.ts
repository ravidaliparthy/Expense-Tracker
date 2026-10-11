import { Category, TransactionKind } from './models';
import { FxService } from './fx.service';

export interface ParsedOmnibarInput {
  raw: string;
  isValid: boolean;
  amountCents: number;
  displayAmount: number;
  kind: TransactionKind;
  matchedCategory: Category | null;
  categoryId: number | null;
  categoryLabel: string;
  categoryIcon: string;
  merchant: string;
  notes: string;
  occurredAtUtc: string;
  dateLabel: string;
  currencyConverted?: {
    fromCode: string;
    fromSymbol: string;
    fromAmount: number;
    toCode: string;
  };
}

export function parseOmnibarInput(
  rawInput: string,
  categories: Category[],
  baseCurrency = 'USD',
  fxService?: FxService
): ParsedOmnibarInput {
  const input = rawInput.trim();
  const emptyResult: ParsedOmnibarInput = {
    raw: input,
    isValid: false,
    amountCents: 0,
    displayAmount: 0,
    kind: 'expense',
    matchedCategory: null,
    categoryId: null,
    categoryLabel: 'Uncategorized',
    categoryIcon: '📌',
    merchant: '',
    notes: '',
    occurredAtUtc: new Date().toISOString(),
    dateLabel: 'Today'
  };

  if (!input) return emptyResult;

  let remaining = input;
  let detectedKind: TransactionKind = 'expense';
  let dateUtc = new Date();
  let dateLabel = 'Today';
  let detectedAmount = 0;
  let fxInfo: ParsedOmnibarInput['currencyConverted'] | undefined;

  // 1. Detect relative dates: 'yesterday'
  if (/\byesterday\b/i.test(remaining)) {
    remaining = remaining.replace(/\byesterday\b/gi, ' ').trim();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateUtc = d;
    dateLabel = 'Yesterday';
  } else if (/\btoday\b/i.test(remaining)) {
    remaining = remaining.replace(/\btoday\b/gi, ' ').trim();
  }

  // 2. Detect Income keywords (salary, income, refund, dividend, bonus)
  const incomeRegex = /\b(salary|paycheck|dividend|bonus|refund|credited|income)\b/i;
  if (incomeRegex.test(remaining)) {
    detectedKind = 'income';
  }

  // 3. Detect Currency symbols & amounts (e.g. €20, £15, ₹500, $40, 20 eur, or plain 15.50)
  if (fxService) {
    const fxMatch = fxService.detectCurrency(remaining);
    if (fxMatch) {
      const converted = fxService.convert(fxMatch.amount, fxMatch.code, baseCurrency);
      detectedAmount = converted;
      remaining = remaining.replace(fxMatch.rawText, ' ').trim();
      if (fxMatch.code.toUpperCase() !== baseCurrency.toUpperCase()) {
        fxInfo = {
          fromCode: fxMatch.code,
          fromSymbol: fxMatch.symbol,
          fromAmount: fxMatch.amount,
          toCode: baseCurrency
        };
      }
    }
  }

  // If no currency prefix/suffix was consumed, look for plain numeric amount: e.g. 15, 24.50, $15
  if (detectedAmount === 0) {
    const numMatch = remaining.match(/[$€£₹¥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
    if (numMatch) {
      detectedAmount = parseFloat(numMatch[1]);
      remaining = remaining.replace(numMatch[0], ' ').trim();
    }
  }

  if (isNaN(detectedAmount) || detectedAmount <= 0) {
    return { ...emptyResult, raw: input };
  }

  // 4. Remaining tokens comprise the Merchant / Category hint / Note
  const tokens = remaining
    .replace(/[,\-;]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let merchant = tokens.slice(0, 3).join(' ') || (detectedKind === 'income' ? 'Income' : 'General');
  let matchedCat: Category | null = null;

  // 5. Smart Category Matching (Exact match against user's categories or keywords)
  const lowerRemaining = remaining.toLowerCase();

  // Try matching directly against loaded categories by name
  for (const cat of categories) {
    if (cat.name && lowerRemaining.includes(cat.name.toLowerCase())) {
      matchedCat = cat;
      break;
    }
  }

  // Keyword dictionary if no direct category name found
  if (!matchedCat) {
    const keywordMap: Record<string, string[]> = {
      'Food & Dining': ['lunch', 'dinner', 'breakfast', 'coffee', 'cafe', 'food', 'pizza', 'burger', 'subway', 'starbucks', 'restaurant', 'meal', 'snack', 'bar', 'beer'],
      'Groceries': ['groceries', 'grocery', 'supermarket', 'mart', 'walmart', 'costco', 'trader', 'market'],
      'Transportation': ['gas', 'fuel', 'petrol', 'uber', 'lyft', 'taxi', 'cab', 'metro', 'train', 'bus', 'flight', 'parking', 'toll'],
      'Utilities': ['wifi', 'internet', 'electric', 'power', 'water', 'utility', 'utilities', 'phone', 'bill'],
      'Housing': ['rent', 'mortgage', 'maintenance', 'repair'],
      'Entertainment': ['netflix', 'spotify', 'movie', 'cinema', 'game', 'concert', 'steam', 'theatre'],
      'Health': ['gym', 'fitness', 'doctor', 'pharmacy', 'medicine', 'hospital', 'clinic'],
      'Shopping': ['shopping', 'amazon', 'ebay', 'clothes', 'shoes', 'mall', 'electronics'],
      'Salary / Income': ['salary', 'paycheck', 'dividend', 'bonus', 'freelance', 'client', 'refund']
    };

    for (const [groupName, keywords] of Object.entries(keywordMap)) {
      if (keywords.some((kw) => lowerRemaining.includes(kw))) {
        // Find category in user's categories matching this group
        matchedCat = categories.find((c) =>
          c.name.toLowerCase().includes(groupName.toLowerCase()) ||
          groupName.toLowerCase().includes(c.name.toLowerCase())
        ) || null;
        break;
      }
    }
  }

  // Build notes
  let notes = fxInfo ? `Converted from ${fxInfo.fromSymbol}${fxInfo.fromAmount} ${fxInfo.fromCode}` : '';

  return {
    raw: input,
    isValid: true,
    amountCents: Math.round(detectedAmount * 100),
    displayAmount: detectedAmount,
    kind: detectedKind,
    matchedCategory: matchedCat,
    categoryId: matchedCat ? matchedCat.id : null,
    categoryLabel: matchedCat ? matchedCat.name : 'Uncategorized',
    categoryIcon: matchedCat ? (matchedCat.icon || '🏷️') : '📌',
    merchant: merchant.charAt(0).toUpperCase() + merchant.slice(1),
    notes,
    occurredAtUtc: dateUtc.toISOString(),
    dateLabel,
    currencyConverted: fxInfo
  };
}
