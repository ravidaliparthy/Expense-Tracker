'use strict';
const { z } = require('zod');

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw err;
  }
  return result.data;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const currency = z.string().regex(/^[A-Z]{3}$/, 'expected ISO currency code');
const txKind = z.enum(['expense', 'income']);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1).default('UTC'),
  baseCurrency: currency.default('USD'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).optional(),
  baseCurrency: currency.optional(),
});

const categoryCreateSchema = z.object({
  name: z.string().min(1).max(80),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
  icon: z.string().trim().max(8).optional(),
});

const categoryPatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().trim().max(8).nullable().optional(),
  isArchived: z.boolean().optional(),
});

const expenseCreateSchema = z.object({
  clientUuid: z.string().uuid().optional(),
  amountCents: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  categoryId: z.number().int().positive().nullable().default(null),
  kind: txKind.default('expense'),
  merchant: z.string().max(120).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  receiptUrl: z.string().max(512).optional(),
});

const expensePatchSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  kind: txKind.optional(),
  merchant: z.string().max(120).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  baseVersion: z.number().int().optional(),
});

const budgetSchema = z.object({
  categoryId: z.number().int().positive().nullable(),
  period: z.enum(['monthly', 'yearly']),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(0).max(12).default(0),
  amountCents: z.number().int().nonnegative(),
  warnPct: z.number().int().min(1).max(100).default(80),
  critPct: z.number().int().min(1).max(100).default(90),
  overPct: z.number().int().min(1).max(200).default(100),
});

const expenseQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  categoryIds: z.string().optional(),
  kind: z.enum(['expense', 'income', 'all']).default('all'),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['local_date:desc', 'local_date:asc', 'amount:desc', 'amount:asc'])
        .default('local_date:desc'),
});

module.exports = {
  validate, registerSchema, loginSchema, profileSchema,
  categoryCreateSchema, categoryPatchSchema,
  expenseCreateSchema, expensePatchSchema, expenseQuerySchema,
  budgetSchema,
};
