/**
 * Seed a demo account with ~12 months of realistic transactions.
 *   demo@example.com / demo1234
 * Transactions go through the SAME pipeline as real ones:
 * ML categorization -> insert -> Isolation Forest anomaly scoring.
 * Requires MongoDB and the ML service to be running.
 */
import fs from 'node:fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import Budget from '../src/models/Budget.js';
import { addTransactions } from '../src/services/transactionService.js';

const raw = JSON.parse(fs.readFileSync(new URL('../seed/demo_transactions.json', import.meta.url)));

// Shift the data so its last month is the current month, and drop anything in the future.
const now = new Date();
const last = new Date(Math.max(...raw.map((t) => new Date(t.timestamp))));
const shift = (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
const items = raw
  .map((t) => {
    const d = new Date(t.timestamp);
    d.setMonth(d.getMonth() + shift);
    return { description: t.description, merchant: t.merchant, amount: t.amount, date: d };
  })
  .filter((t) => t.date <= now);

await mongoose.connect(config.mongoUri);
const existing = await User.findOne({ email: 'demo@example.com' });
if (existing) {
  await Transaction.deleteMany({ user: existing._id });
  await Budget.deleteMany({ user: existing._id });
  await existing.deleteOne();
}

const user = await User.create({
  name: 'Demo User',
  email: 'demo@example.com',
  passwordHash: await bcrypt.hash('demo1234', 10),
});
const created = await addTransactions(user._id, items);
await Budget.insertMany([
  { user: user._id, category: 'Food & Dining', monthlyLimit: 6000 },
  { user: user._id, category: 'Groceries', monthlyLimit: 8000 },
  { user: user._id, category: 'Shopping', monthlyLimit: 7000 },
  { user: user._id, category: 'Transport', monthlyLimit: 4000 },
  { user: user._id, category: 'Entertainment', monthlyLimit: 2000 },
]);

const flagged = await Transaction.countDocuments({ user: user._id, isAnomaly: true });
console.log(`seeded ${created.length} transactions (${flagged} flagged as anomalies)`);
console.log('login: demo@example.com / demo1234');
await mongoose.disconnect();
