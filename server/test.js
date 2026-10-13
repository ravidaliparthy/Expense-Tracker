'use strict';
process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const { createApp } = require('./src/index');

async function runTests() {
  console.log('🚀 Starting Expense Tracker Server Test Suite...');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`✔ Ephemeral test server listening on port ${port}`);

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const { method = 'GET', headers = {}, body = null } = options;
      const reqHeaders = { 'Content-Type': 'application/json', ...headers };
      let payload = null;
      if (body) {
        payload = JSON.stringify(body);
        reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api' + path,
          method,
          headers: reqHeaders,
        },
        (res) => {
          let chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try {
              json = JSON.parse(raw);
            } catch {
              /* not json (e.g. csv or pdf) */
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: json,
              raw,
            });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  let passed = 0;
  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  try {
    // 1. Health check
    await test('GET /health returns 200 with DB status', async () => {
      const res = await request('/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.ok, true);
      assert.strictEqual(res.body.db, 'sqlite');
    });

    // 2. Auth flow
    const testEmail = `test_${Date.now()}@expense.test`;
    let authToken = null;
    let userId = null;

    await test('POST /auth/register creates user and returns JWT token', async () => {
      const res = await request('/auth/register', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'Password123!',
          displayName: 'Test User',
          timezone: 'America/New_York',
          baseCurrency: 'USD',
          recoveryPin: 'secret1234',
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, testEmail);
      assert.strictEqual(res.body.user.hasRecoveryPin, true);
      authToken = res.body.token;
      userId = res.body.user.id;
    });

    await test('POST /auth/register rejects duplicate email with 409', async () => {
      const res = await request('/auth/register', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'Password123!',
          displayName: 'Test User 2',
        },
      });
      assert.strictEqual(res.status, 409);
    });

    await test('POST /auth/login succeeds with valid credentials', async () => {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { email: testEmail, password: 'Password123!' },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
    });

    await test('POST /auth/login rejects invalid credentials with 401', async () => {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { email: testEmail, password: 'WrongPassword' },
      });
      assert.strictEqual(res.status, 401);
    });

    await test('GET /auth/me returns authenticated user details', async () => {
      const res = await request('/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.id, userId);
    });

    await test('POST /auth/change-password validates current password before updating', async () => {
      const wrong = await request('/auth/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { currentPassword: 'WrongOldPassword', newPassword: 'NewPassword123!' },
      });
      assert.strictEqual(wrong.status, 401);

      const ok = await request('/auth/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { currentPassword: 'Password123!', newPassword: 'NewPassword123!' },
      });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.body.ok, true);
    });

    await test('POST /auth/set-pin saves secret recovery PIN in Settings', async () => {
      const res = await request('/auth/set-pin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { pin: '849201' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.ok, true);
    });

    await test('POST /auth/reset-password enforces secret recovery PIN verification', async () => {
      const fail = await request('/auth/reset-password', {
        method: 'POST',
        body: { email: testEmail, recoveryPin: '000000', newPassword: 'ResetPassword123!' },
      });
      assert.strictEqual(fail.status, 401);

      const success = await request('/auth/reset-password', {
        method: 'POST',
        body: { email: testEmail, recoveryPin: '849201', newPassword: 'ResetPassword123!' },
      });
      assert.strictEqual(success.status, 200);
      assert.ok(success.body.token);

      const login = await request('/auth/login', {
        method: 'POST',
        body: { email: testEmail, password: 'ResetPassword123!' },
      });
      assert.strictEqual(login.status, 200);
      authToken = login.body.token;
    });

    // 3. Categories
    let categoryId = null;
    await test('GET /categories lists seeded system categories', async () => {
      const res = await request('/categories', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length >= 6);
      categoryId = res.body[0].id;
    });

    let customCatId = null;
    await test('POST /categories creates a custom category', async () => {
      const res = await request('/categories', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { name: 'Gadgets', colorHex: '#8B5CF6', icon: '💻' },
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.name, 'Gadgets');
      customCatId = res.body.id;
    });

    await test('PATCH /categories/:id updates custom category', async () => {
      const res = await request(`/categories/${customCatId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { name: 'Tech & Gadgets', colorHex: '#7C3AED' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.name, 'Tech & Gadgets');
    });

    // 4. Expenses
    let expenseId = null;
    await test('POST /expenses creates a new transaction', async () => {
      const res = await request('/expenses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          amountCents: 4550,
          kind: 'expense',
          categoryId: categoryId,
          merchant: 'Supermarket',
          occurredAt: new Date().toISOString(),
          notes: 'Weekly groceries',
        },
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.amountCents, 4550);
      assert.strictEqual(res.body.merchant, 'Supermarket');
      expenseId = res.body.id;
    });

    await test('GET /expenses returns paginated list', async () => {
      const res = await request('/expenses', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.total >= 1);
    });

    await test('PATCH /expenses/:id updates expense details', async () => {
      const res = await request(`/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { amountCents: 4800, notes: 'Groceries + snacks' },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.amountCents, 4800);
    });

    // 5. Budgets
    await test('PUT /budgets creates or updates a budget', async () => {
      const res = await request('/budgets', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          categoryId,
          period: 'monthly',
          periodYear: new Date().getFullYear(),
          periodMonth: new Date().getMonth() + 1,
          amountCents: 20000,
          warnPct: 80,
          critPct: 90,
          overPct: 100,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.amountCents, 20000);
    });

    await test('GET /budgets lists configured budgets', async () => {
      const res = await request('/budgets', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length >= 1);
    });

    // 6. Analytics
    await test('GET /analytics/summary returns KPI metrics', async () => {
      const res = await request('/analytics/summary', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok('expenseCents' in res.body);
      assert.ok('netCents' in res.body);
    });

    await test('GET /analytics/trends returns series buckets', async () => {
      const res = await request('/analytics/trends', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.series));
    });

    await test('GET /analytics/budget-status returns calculated status tiers', async () => {
      const res = await request('/analytics/budget-status', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.statuses));
    });

    await test('GET /analytics/insights returns deep dive calculations', async () => {
      const res = await request('/analytics/insights', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok('comparison' in res.body);
      assert.ok('categoryShares' in res.body);
    });

    // 7. Exports
    await test('GET /export/csv streams CSV content', async () => {
      const res = await request('/export/csv', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/csv'));
      assert.ok(res.raw.includes('amount'));
    });

    await test('GET /export/pdf generates binary PDF document', async () => {
      const res = await request('/export/pdf', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'application/pdf');
      assert.ok(res.raw.startsWith('%PDF'));
    });

    // 8. Offline Sync
    await test('POST /sync/batch handles batch mutations idempotently', async () => {
      const testUuid = require('crypto').randomUUID();
      const res = await request('/sync/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          mutations: [
            {
              clientUuid: testUuid,
              op: 'create',
              payload: {
                amountCents: 1200,
                kind: 'expense',
                occurredAt: new Date().toISOString(),
                merchant: 'Coffee Shop',
              },
            },
          ],
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results[0].status, 'created');

      // Duplicate sync replay
      const resDup = await request('/sync/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          mutations: [
            {
              clientUuid: testUuid,
              op: 'create',
              payload: {
                amountCents: 1200,
                occurredAt: new Date().toISOString(),
              },
            },
          ],
        },
      });
      assert.strictEqual(resDup.status, 200);
      assert.strictEqual(resDup.body.results[0].status, 'duplicate');
    });

    // 9. Bulk Actions & Multi-User Isolation
    await test('POST /expenses/bulk-update and /bulk-delete enforce strict cross-user isolation', async () => {
      const userBEmail = `userb-${Date.now()}@expense.test`;
      const regB = await request('/auth/register', {
        method: 'POST',
        body: { email: userBEmail, password: 'password123', displayName: 'User B', baseCurrency: 'USD', timezone: 'UTC' }
      });
      assert.strictEqual(regB.status, 201);
      const tokenB = regB.body.token;

      const expB = await request('/expenses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { amountCents: 9999, kind: 'expense', occurredAt: new Date().toISOString(), merchant: 'Victim Exp' }
      });
      assert.strictEqual(expB.status, 201);
      const expBId = expB.body.id;

      const expA = await request('/expenses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { amountCents: 5000, kind: 'expense', occurredAt: new Date().toISOString(), merchant: 'My Exp' }
      });
      assert.strictEqual(expA.status, 201);
      const expAId = expA.body.id;

      // User A attempts to bulk-update User B's expense and User A's expense
      const updateRes = await request('/expenses/bulk-update', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { ids: [expAId, expBId], tag: 'want' }
      });
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.updatedCount, 1);

      // Verify User B's expense was NOT modified
      const checkB = await request('/expenses', {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      const itemB = checkB.body.items.find((x) => x.id === expBId);
      assert.strictEqual(itemB.tag, 'need');

      // User A attempts to bulk-delete User B's expense and User A's expense
      const deleteRes = await request('/expenses/bulk-delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { ids: [expAId, expBId] }
      });
      assert.strictEqual(deleteRes.status, 200);
      assert.strictEqual(deleteRes.body.deletedCount, 1);

      // Verify User B's expense was NOT deleted
      const checkB2 = await request('/expenses', {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      const stillB = checkB2.body.items.find((x) => x.id === expBId);
      assert.ok(stillB, 'User B expense must still exist');
    });

    // 10. Statement & CSV Bulk Import
    await test('POST /expenses/bulk-import imports transactions with category matching', async () => {
      const res = await request('/expenses/bulk-import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          items: [
            { amountCents: 4500, kind: 'expense', tag: 'need', merchant: 'Swiggy', notes: 'Dinner order', occurredAt: new Date().toISOString() },
            { amountCents: 150000, kind: 'income', tag: 'saving', merchant: 'Tech Co', notes: 'Consulting fee', occurredAt: new Date().toISOString() }
          ]
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.count, 2);
    });

    // 10b. PDF Statement Parsing
    await test('POST /expenses/parse-pdf parses UPI and bank statement PDF with merchant details', async () => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument();
      const buffers = [];
      doc.on('data', (b) => buffers.push(b));
      const pdfPromise = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(buffers))));

      doc.fontSize(20).text('Transaction History');
      doc.fontSize(12).text('20 September 2026 to 23 September 2026');
      doc.text('Name Bank Amount Date Status');
      doc.text('Indian Institute of HDFC 4194 -2000.00 22 September 2026 SUCCESS');
      doc.text('Bhalaji rice store HDFC 4194 -111.00 22 September 2026 SUCCESS');
      doc.text('MUNAVATH SAROJA HDFC 4194 -176.00 21 September 2026 SUCCESS');
      doc.text('PREMA H A HDFC 4194 -118.00 20 September 2026 SUCCESS');
      doc.text('Powered by UPI YES BANK');
      doc.end();

      const pdfBuf = await pdfPromise;
      const base64 = pdfBuf.toString('base64');

      const res = await request('/expenses/parse-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { base64, filename: 'statement.pdf' }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.rows));
      assert.strictEqual(res.body.rows.length, 4);

      const r1 = res.body.rows[0];
      assert.strictEqual(r1.merchant, 'Indian Institute of');
      assert.strictEqual(r1.amountCents, 200000);
      assert.strictEqual(r1.date, '2026-09-22');
      assert.strictEqual(r1.bankRef, 'HDFC 4194');
      assert.strictEqual(r1.status, 'SUCCESS');
      assert.strictEqual(r1.kind, 'expense');

      const r2 = res.body.rows[1];
      assert.strictEqual(r2.merchant, 'Bhalaji rice store');
      assert.strictEqual(r2.amountCents, 11100);
      assert.strictEqual(r2.date, '2026-09-22');
      assert.strictEqual(r2.kind, 'expense');
    });

    // 10c. PhonePe PDF Statement Parsing
    await test('POST /expenses/parse-pdf parses PhonePe multiline statement with credits and debits', async () => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument();
      const buffers = [];
      doc.on('data', (b) => buffers.push(b));
      const pdfPromise = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(buffers))));

      doc.fontSize(16).text('Transaction Statement for +919182021304');
      doc.fontSize(12).text('Sep 13, 2026 - Oct 13, 2026');
      doc.text('Date Transaction Details Type Amount');
      doc.text('Sep 13, 2026');
      doc.text('04:27 PM');
      doc.text('Received from DSV Chalapathy Rao');
      doc.text('Transaction ID : T2609131627456388020423');
      doc.text('UTR No : 339294069853');
      doc.text('Credited to XX4194');
      doc.text('Credit');
      doc.text('INR 2000.00');

      doc.text('Sep 18, 2026');
      doc.text('09:43 AM');
      doc.text('Paid to Kullai Reddy');
      doc.text('Transaction ID : T2609180943552343967879');
      doc.text('UTR No : 265494909399');
      doc.text('Debited from XX4194');
      doc.text('Debit');
      doc.text('INR 130.00');
      doc.end();

      const pdfBuf = await pdfPromise;
      const base64 = pdfBuf.toString('base64');

      const res = await request('/expenses/parse-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { base64, filename: 'phonepe_statement.pdf' }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.rows));
      assert.strictEqual(res.body.rows.length, 2);

      const creditRow = res.body.rows.find((r) => r.kind === 'income');
      assert.ok(creditRow);
      assert.strictEqual(creditRow.merchant, 'DSV Chalapathy Rao');
      assert.strictEqual(creditRow.amountCents, 200000);
      assert.strictEqual(creditRow.date, '2026-09-13');
      assert.strictEqual(creditRow.tag, 'saving');

      const debitRow = res.body.rows.find((r) => r.kind === 'expense');
      assert.ok(debitRow);
      assert.strictEqual(debitRow.merchant, 'Kullai Reddy');
      assert.strictEqual(debitRow.amountCents, 13000);
      assert.strictEqual(debitRow.date, '2026-09-18');
      assert.strictEqual(debitRow.tag, 'need');
    });

    // 11. Recurring Bills & Pay Action
    await test('POST /recurring creates bill and POST /recurring/:id/pay logs payment', async () => {
      const createRes = await request('/recurring', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          title: 'High-Speed Internet',
          amountCents: 7500,
          frequency: 'monthly',
          dueDay: 15,
          notes: 'Fiber broadband'
        }
      });
      assert.strictEqual(createRes.status, 201);
      const billId = createRes.body.id;

      const listRes = await request('/recurring', {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(listRes.status, 200);
      assert.ok(listRes.body.some((b) => b.id === billId));

      const payRes = await request(`/recurring/${billId}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(payRes.status, 200);
      assert.strictEqual(payRes.body.ok, true);
      assert.ok(payRes.body.expenseId);
    });

    // 12. Full Data Export
    await test('GET /auth/export-data returns complete user data archive', async () => {
      const res = await request('/auth/export-data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.user);
      assert.ok(Array.isArray(res.body.expenses));
      assert.ok(Array.isArray(res.body.categories));
      assert.ok(Array.isArray(res.body.recurringBills));
    });

    // 13. GDPR Right to Erasure / Account Deletion
    await test('DELETE /auth/account validates password and wipes personal data', async () => {
      const tempEmail = `wipe-${Date.now()}@expense.test`;
      const reg = await request('/auth/register', {
        method: 'POST',
        body: { email: tempEmail, password: 'securePassword123', displayName: 'Wipe Me', baseCurrency: 'USD', timezone: 'UTC' }
      });
      assert.strictEqual(reg.status, 201);
      const tempToken = reg.body.token;

      const failRes = await request('/auth/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tempToken}` },
        body: { password: 'wrongPassword' }
      });
      assert.strictEqual(failRes.status, 401);

      const okRes = await request('/auth/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tempToken}` },
        body: { password: 'securePassword123' }
      });
      assert.strictEqual(okRes.status, 200);
      assert.strictEqual(okRes.body.ok, true);

      const loginRes = await request('/auth/login', {
        method: 'POST',
        body: { email: tempEmail, password: 'securePassword123' }
      });
      assert.strictEqual(loginRes.status, 401);
    });

    console.log(`\n🎉 All ${passed} tests passed successfully!`);
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
