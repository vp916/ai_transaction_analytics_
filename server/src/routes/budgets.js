import { Router } from 'express';
import Budget from '../models/Budget.js';
import Transaction, { CATEGORIES } from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.js';
import { toObjectId } from '../services/transactionService.js';
import { currentMonth, monthRange } from '../utils/dates.js';

const router = Router();
router.use(requireAuth);

// GET /api/budgets?month=2026-10 -> every budget with how much is already spent
router.get('/', async (req, res) => {
  const month = req.query.month || currentMonth();
  const { start, end } = monthRange(month);
  const [budgets, spent] = await Promise.all([
    Budget.find({ user: req.userId }).sort({ category: 1 }).lean(),
    Transaction.aggregate([
      { $match: { user: toObjectId(req.userId), date: { $gte: start, $lt: end }, isAnomaly: false } },
      { $group: { _id: '$category', spent: { $sum: '$amount' } } },
    ]),
  ]);
  const spentBy = Object.fromEntries(spent.map((s) => [s._id, s.spent]));
  res.json({
    month,
    budgets: budgets.map((b) => {
      const s = Math.round(spentBy[b.category] || 0);
      return { ...b, spent: s, remaining: b.monthlyLimit - s, percentUsed: Math.round((100 * s) / b.monthlyLimit) };
    }),
  });
});

// PUT /api/budgets  { category, monthlyLimit }  -> create or update (upsert)
router.put('/', async (req, res) => {
  const { category, monthlyLimit } = req.body || {};
  if (!CATEGORIES.includes(category) || !(Number(monthlyLimit) > 0)) {
    return res.status(400).json({ error: 'valid category and positive monthlyLimit required' });
  }
  const budget = await Budget.findOneAndUpdate(
    { user: req.userId, category },
    { monthlyLimit: Number(monthlyLimit) },
    { upsert: true, new: true }
  );
  res.json(budget);
});

// DELETE /api/budgets/:id
router.delete('/:id', async (req, res) => {
  const deleted = await Budget.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!deleted) return res.status(404).json({ error: 'budget not found' });
  res.status(204).end();
});

export default router;
