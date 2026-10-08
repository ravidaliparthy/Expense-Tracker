'use strict';
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
      if (body) req.write(JSON.stringify(body));
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
        },
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, testEmail);
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
