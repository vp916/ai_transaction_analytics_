import { Router } from 'express';
import Transaction, { CATEGORIES } from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.js';
import { addTransactions, rescoreAnomalies } from '../services/transactionService.js';
import { monthRange } from '../utils/dates.js';

const router = Router();
router.use(requireAuth);

// GET /api/transactions?month=2026-10&category=Groceries&anomaly=true&search=swiggy&page=1&limit=20
router.get('/', async (req, res) => {
  const { month, category, anomaly, search } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);

  const filter = { user: req.userId };
  if (month) {
    const { start, end } = monthRange(month);
    filter.date = { $gte: start, $lt: end };
  }
  if (category) filter.category = category;
  if (anomaly === 'true') filter.isAnomaly = true;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ merchant: rx }, { description: rx }];
  }

  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/transactions  { description, merchant?, amount, date?, category? }
router.post('/', async (req, res) => {
  const { description, merchant, amount, date, category } = req.body || {};
  if (!description || !(Number(amount) > 0)) {
    return res.status(400).json({ error: 'description and a positive amount are required' });
  }
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
  }
  const [created] = await addTransactions(req.userId, [{
    description,
    merchant: merchant || description,
    amount: Number(amount),
    date: date ? new Date(date) : new Date(),
    category: category || undefined,
  }]);
  res.status(201).json(created);
});

// PATCH /api/transactions/:id  { category }  -> user corrects the ML category
router.patch('/:id', async (req, res) => {
  const { category } = req.body || {};
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'invalid category' });
  const updated = await Transaction.findOneAndUpdate(
    { _id: req.params.id, user: req.userId },          // user can only edit their own data
    { category, categorySource: 'user' },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'transaction not found' });
  res.json(updated);
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  const deleted = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!deleted) return res.status(404).json({ error: 'transaction not found' });
  res.status(204).end();
});

// POST /api/transactions/rescan -> re-run anomaly detection over recent history
router.post('/rescan', async (req, res) => {
  const flagged = await rescoreAnomalies(req.userId);
  res.json({ flagged });
});

export default router;
