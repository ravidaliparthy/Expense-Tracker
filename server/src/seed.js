'use strict';
/**
 * Seed script.
 *   node src/seed.js          -> demo user (demo@expense.test / demo1234) + emoji categories
 *   node src/seed.js --demo   -> resets demo transactions/budgets to the CURRENT month
 *                                (safe to rerun any time; only touches the demo user)
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('./db');
const { resolveInstant } = require('./lib/time');

const TZ = process.env.SEED_TZ || 'America/New_York';

const SYSTEM_CATEGORIES = [
  ['Food', '#F97316', '🍔'], ['Travel', '#3B82F6', '✈️'], ['Shopping', '#EC4899', '🛍️'],
  ['Utilities', '#F59E0B', '💡'], ['Health', '#10B981', '💊'], ['Entertainment', '#8B5CF6', '🎬'],
  ['Salary', '#22C55E', '💰'], ['Freelance', '#06B6D4', '🧑‍💻'], ['Bonus', '#EAB308', '🎉'],
];

function seedDemoUser(dbInstance, withDemoData = true) {
  const db = dbInstance || getDb();
  let user = db.prepare(`SELECT id FROM users WHERE email = ?`).get('demo@expense.test');
  if (!user) {
    const info = db.prepare(
      `INSERT INTO users (email, password_hash, display_name, timezone, base_currency, is_first_login)
       VALUES (?, ?, ?, ?, 'USD', 0)`
    ).run('demo@expense.test', bcrypt.hashSync('demo1234', 10), 'Demo User', TZ);
    user = { id: info.lastInsertRowid };
    console.log('✔ Created demo user demo@expense.test / demo1234');
  } else {
    console.log('• Demo user already exists');
  }

  // (Re)create system categories with emoji icons — idempotent by name.
  const getCat = db.prepare(
    `SELECT id FROM categories WHERE user_id = ? AND name = ? AND deleted_at IS NULL`
  );
  const mkCat = db.prepare(
    `INSERT INTO categories (user_id, name, color_hex, icon, is_system) VALUES (?, ?, ?, ?, 1)`
  );
  const fixCat = db.prepare(`UPDATE categories SET icon = ?, color_hex = ? WHERE id = ?`);
  for (const [name, color, icon] of SYSTEM_CATEGORIES) {
    const c = getCat.get(user.id, name);
    if (c) fixCat.run(icon, color, c.id);
    else mkCat.run(user.id, name, color, icon);
  }

  if (withDemoData) {
    const cats = db.prepare(
      `SELECT id, name, color_hex AS colorHex, icon FROM categories WHERE user_id = ? AND deleted_at IS NULL`
    ).all(user.id);
    const byName = Object.fromEntries(cats.map((c) => [c.name, c]));
    const insert = db.prepare(
      `INSERT INTO expenses (user_id, category_id, category_name_snapshot, category_color_snapshot,
         category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes,
         merchant, notes, client_uuid)
       VALUES (?,?,?,?,?,?,'USD',?,?,?,?,?,?,?)`
    );

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const curD = now.getDate();
    const pad = (n) => String(n).padStart(2, '0');

    // Idempotent: reseed clears this demo user's rows first so the demo data
    // always matches the CURRENT calendar state. Other accounts are untouched.
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM expenses WHERE user_id = ?`).run(user.id);
      db.prepare(`DELETE FROM budgets WHERE user_id = ?`).run(user.id);

      const addTx = (catName, cents, merchant, notes, ymd, kind = 'expense') => {
        const inst = resolveInstant(`${ymd}T14:30:00.000Z`, TZ);
        const c = byName[catName] || null;
        insert.run(
          user.id, c ? c.id : null, c ? c.name : 'Uncategorized',
          c ? c.colorHex : '#94A3B8', c ? c.icon : null,
          cents, kind, inst.occurredAtUtc, inst.localDate, inst.tzOffsetMinutes,
          merchant, notes, crypto.randomUUID()
        );
      };

      // ── 1. TODAY's Transactions (Ensures "Today" filter shows rich data)
      addTx('Food', 650, 'Blue Bottle Coffee', 'Morning flat white + croissant', `${curY}-${pad(curM)}-${pad(curD)}`);
      addTx('Food', 1850, 'Sweetgreen', 'Custom warm grain bowl with avocado', `${curY}-${pad(curM)}-${pad(curD)}`);
      addTx('Travel', 320, 'Metropolitan Transit', 'Subway tap-to-pay commute', `${curY}-${pad(curM)}-${pad(curD)}`);

      // ── 2. THIS WEEK's Transactions (Ensures "This week" and "7 days" show data)
      if (curD > 1) {
        addTx('Food', 7850, 'Whole Foods Market', 'Weekly organic grocery haul', `${curY}-${pad(curM)}-${pad(Math.max(1, curD - 1))}`);
        addTx('Travel', 2480, 'Uber Green', 'Ride to tech meetup downtown', `${curY}-${pad(curM)}-${pad(Math.max(1, curD - 2))}`);
        addTx('Utilities', 1200, 'GitHub Copilot', 'Monthly AI developer plan', `${curY}-${pad(curM)}-${pad(Math.max(1, curD - 3))}`);
        addTx('Health', 2250, 'CVS Pharmacy', 'Multivitamins & allergy relief', `${curY}-${pad(curM)}-${pad(Math.max(1, curD - 4))}`);
      }

      // ── 3. THIS MONTH's Core Expenses & Income
      addTx('Utilities', 9450, 'Con Edison Power', 'Monthly electric & heating bill', `${curY}-${pad(curM)}-03`);
      addTx('Entertainment', 1999, 'Netflix Premium', '4K family streaming subscription', `${curY}-${pad(curM)}-04`);
      addTx('Shopping', 12999, 'Amazon Prime', 'Anker 100W USB-C desktop charging station', `${curY}-${pad(curM)}-05`);
      addTx('Food', 6400, 'Trader Joe\'s', 'Snacks and specialty cheeses', `${curY}-${pad(curM)}-06`);
      addTx('Shopping', 8500, 'Uniqlo', 'Merino wool sweater & winter socks', `${curY}-${pad(curM)}-07`);
      addTx('Entertainment', 3500, 'AMC Theatres', 'IMAX tickets + popcorn combo', `${curY}-${pad(curM)}-08`);
      addTx('Food', 11200, 'Osteria Mozza', 'Dinner celebration with friends', `${curY}-${pad(curM)}-10`);
      addTx('Health', 4500, 'Dr. Smith Clinic', 'Annual wellness dental cleaning', `${curY}-${pad(curM)}-12`);

      // Income for current month
      addTx('Salary', 450000, 'Acme Corp', 'Direct deposit monthly engineering salary', `${curY}-${pad(curM)}-01`, 'income');
      addTx('Freelance', 140000, 'Venture Studio', 'Q4 Design systems consulting milestone', `${curY}-${pad(curM)}-05`, 'income');
      addTx('Bonus', 75000, 'Acme Corp', 'Q3 Project excellence recognition bonus', `${curY}-${pad(curM)}-07`, 'income');

      // ── 4. LAST MONTH's Transactions (Ensures "Last month" shows rich data)
      const lastMonthDate = new Date(curY, curM - 2, 1);
      const lastY = lastMonthDate.getFullYear();
      const lastM = lastMonthDate.getMonth() + 1;
      addTx('Travel', 28900, 'Delta Air Lines', 'Round-trip flight SFO ⇄ JFK', `${lastY}-${pad(lastM)}-08`);
      addTx('Travel', 34000, 'Hyatt Regency', 'Hotel stay for annual developer summit', `${lastY}-${pad(lastM)}-11`);
      addTx('Food', 8400, 'Tartine Bakery', 'Brunch and artisan sourdough', `${lastY}-${pad(lastM)}-14`);
      addTx('Utilities', 8800, 'Verizon Wireless', 'Unlimited 5G wireless family plan', `${lastY}-${pad(lastM)}-18`);
      addTx('Entertainment', 15000, 'Live Nation', 'Weekend concert tickets', `${lastY}-${pad(lastM)}-21`);
      addTx('Shopping', 18999, 'Apple Store', 'AirPods Pro 2 with AppleCare', `${lastY}-${pad(lastM)}-24`);
      addTx('Food', 9600, 'Whole Foods Market', 'Monthly pantry restock', `${lastY}-${pad(lastM)}-27`);
      addTx('Salary', 450000, 'Acme Corp', 'Direct deposit monthly engineering salary', `${lastY}-${pad(lastM)}-01`, 'income');
      addTx('Freelance', 110000, 'Starlight Labs', 'API integration contract payment', `${lastY}-${pad(lastM)}-15`, 'income');

      // ── 5. EARLIER MONTHS of 2026 (Creates smooth annual trend graphs)
      addTx('Shopping', 24900, 'IKEA Home', 'Standing desk dual-motor frame', `${curY}-03-15`);
      addTx('Travel', 42000, 'Airbnb Lake Tahoe', 'Mountain cabin rental weekend retreat', `${curY}-05-20`);
      addTx('Health', 18000, 'Equinox Fitness', 'Annual club membership fee', `${curY}-06-01`);
      addTx('Salary', 450000, 'Acme Corp', 'Monthly engineering salary', `${curY}-03-01`, 'income');
      addTx('Salary', 450000, 'Acme Corp', 'Monthly engineering salary', `${curY}-06-01`, 'income');

      // ── 6. HISTORICAL YEAR 2025 (Demonstrates Year filter & annual comparison)
      addTx('Travel', 62000, 'Air France', 'Summer flight JFK ⇄ CDG Paris', `2025-06-18`);
      addTx('Travel', 49900, 'AWS re:Invent', 'Cloud conference registration pass', `2025-11-28`);
      addTx('Shopping', 29999, 'Best Buy Electronics', 'Samsung 34" Curved ultrawide display', `2025-12-12`);
      addTx('Health', 14500, 'CityMD Health', 'Annual comprehensive preventative checkup', `2025-04-10`);
      addTx('Bonus', 250000, 'Acme Corp', 'Annual year-end performance bonus 2025', `2025-12-20`, 'income');

      // ── 7. HISTORICAL DECADE DATA (2024, 2023, 2022 for the 10-Year Period chart)
      addTx('Travel', 31000, 'Japan Rail Pass', '7-Day Shinkansen bullet train pass', `2024-04-12`);
      addTx('Shopping', 45000, 'Dell Computer', 'Dell UltraSharp 4K USB-C hub monitor', `2024-09-20`);
      addTx('Shopping', 85000, 'Herman Miller', 'Aeron ergonomic executive office chair', `2023-08-15`);
      addTx('Entertainment', 34800, 'Sony Electronics', 'WH-1000XM4 Noise canceling headphones', `2022-05-10`);

      // ── 8. FUTURE YEAR 2027 (Demonstrates future calendar year support)
      addTx('Travel', 39500, 'TechCrunch Disrupt 2027', 'Early-bird conference pass booking', `2027-03-22`);
      addTx('Travel', 48000, 'Eurail Global Pass 2027', 'Advance summer European travel rail pass', `2027-07-15`);

      // Budgets configuration
      const budget = db.prepare(
        `INSERT INTO budgets (user_id, category_id, period, period_year, period_month, amount_cents)
         VALUES (?, ?, 'monthly', ?, ?, ?)`
      );
      budget.run(user.id, null, curY, curM, 120000); // $1,200 global monthly budget
      if (byName['Food']) budget.run(user.id, byName['Food'].id, curY, curM, 35000); // $350 food
      if (byName['Travel']) budget.run(user.id, byName['Travel'].id, curY, curM, 25000); // $250 travel
      if (byName['Shopping']) budget.run(user.id, byName['Shopping'].id, curY, curM, 20000); // $200 shopping
    });
    tx();
    console.log('✔ Seeded comprehensive demo transactions across all time horizons (today, week, month, 2025, 2027, 10-yr decade)');
  }
}

if (require.main === module) {
  const withDemo = process.argv.includes('--demo');
  seedDemoUser(null, withDemo);
}

module.exports = { seedDemoUser, SYSTEM_CATEGORIES };