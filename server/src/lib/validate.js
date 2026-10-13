'use strict';
const { z } = require('zod');
const { isSafePlainTextNotes, sanitizeNotes } = require('./sanitize');

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
const txTag = z.enum(['need', 'want', 'saving']);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1).default('UTC'),
  baseCurrency: currency.default('USD'),
  recoveryPin: z.string().min(4).max(64).optional(),
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

const safeNotesSchema = z
  .string()
  .max(10000)
  .refine(isSafePlainTextNotes, {
    message: 'Notes must contain plain text or numbers only; HTML, images, and scripts are strictly prohibited',
  })
  .transform((val) => sanitizeNotes(val, 10000))
  .nullable()
  .optional();

const safeRecurringNotesSchema = z
  .string()
  .max(1000)
  .refine(isSafePlainTextNotes, {
    message: 'Notes must contain plain text or numbers only; HTML, images, and scripts are strictly prohibited',
  })
  .transform((val) => sanitizeNotes(val, 1000))
  .nullable()
  .optional();

const expenseCreateSchema = z.object({
  clientUuid: z.string().uuid().optional(),
  amountCents: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  categoryId: z.number().int().positive().nullable().default(null),
  kind: txKind.default('expense'),
  tag: txTag.default('need').optional(),
  merchant: z.string().max(120).nullable().optional(),
  notes: safeNotesSchema,
  receiptUrl: z.string().max(512).optional(),
});

const expensePatchSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  kind: txKind.optional(),
  tag: txTag.optional(),
  merchant: z.string().max(120).nullable().optional(),
  notes: safeNotesSchema,
  baseVersion: z.number().int().optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  categoryId: z.number().int().positive().nullable().optional(),
  tag: txTag.optional(),
});

const recurringBillSchema = z.object({
  title: z.string().min(1).max(120),
  amountCents: z.number().int().positive(),
  frequency: z.enum(['monthly', 'yearly', 'weekly']).default('monthly'),
  dueDay: z.number().int().min(1).max(31).default(1),
  categoryId: z.number().int().positive().nullable().optional(),
  notes: safeRecurringNotesSchema,
});

const recurringPatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  amountCents: z.number().int().positive().optional(),
  frequency: z.enum(['monthly', 'yearly', 'weekly']).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  notes: safeRecurringNotesSchema,
  isActive: z.boolean().optional(),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
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
  tag: z.enum(['need', 'want', 'saving', 'all']).default('all').optional(),
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
  bulkDeleteSchema, bulkUpdateSchema, recurringBillSchema, recurringPatchSchema,
  deleteAccountSchema, budgetSchema, safeNotesSchema,
  isSafePlainTextNotes, sanitizeNotes,
};
