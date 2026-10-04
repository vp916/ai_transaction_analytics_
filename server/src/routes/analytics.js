import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.js';
import { forecastNextMonth } from '../services/mlClient.js';
import { toObjectId } from '../services/transactionService.js';
import { addMonths, currentMonth, monthRange } from '../utils/dates.js';

const router = Router();
router.use(requireAuth);

// Flagged (possibly fraudulent) transactions are excluded from spending analytics.
const spendMatch = (userId, start, end) => ({
  user: toObjectId(userId), isAnomaly: false, date: { $gte: start, $lt: end },
});

// GET /api/analytics/summary?month=2026-10
router.get('/summary', async (req, res) => {
  const month = req.query.month || currentMonth();
  const { start, end } = monthRange(month);
  const prev = monthRange(addMonths(month, -1));
  const userId = toObjectId(req.userId);

  const [byCategory, topMerchants, [totals], [prevTotals], anomalies] = await Promise.all([
    Transaction.aggregate([
      { $match: spendMatch(req.userId, start, end) },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Transaction.aggregate([
      { $match: spendMatch(req.userId, start, end) },
      { $group: { _id: '$merchant', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 8 },
    ]),
    Transaction.aggregate([
      { $match: spendMatch(req.userId, start, end) },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: spendMatch(req.userId, prev.start, prev.end) },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.countDocuments({ user: userId, isAnomaly: true, date: { $gte: start, $lt: end } }),
  ]);

  const round = (x) => Math.round(x || 0);
  res.json({
    month,
    totalSpent: round(totals?.total),
    transactionCount: totals?.count || 0,
    previousMonthTotal: round(prevTotals?.total),
    anomalyCount: anomalies,
    byCategory: byCategory.map((c) => ({ category: c._id, total: round(c.total), count: c.count })),
    topMerchants: topMerchants.map((m) => ({ merchant: m._id, total: round(m.total), count: m.count })),
  });
});

// GET /api/analytics/monthly?months=12 -> spend per month (oldest first), missing months = 0
async function monthlySeries(userId, months, lastMonth) {
  const first = addMonths(lastMonth, -(months - 1));
  const { start } = monthRange(first);
  const { end } = monthRange(lastMonth);
  const rows = await Transaction.aggregate([
    { $match: spendMatch(userId, start, end) },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, total: { $sum: '$amount' } } },
  ]);
  const byMonth = Object.fromEntries(rows.map((r) => [r._id, r.total]));
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(first, i);
    return { month: m, total: Math.round(byMonth[m] || 0) };
  });
}

router.get('/monthly', async (req, res) => {
  const months = Math.min(36, Number(req.query.months) || 12);
  res.json(await monthlySeries(req.userId, months, currentMonth()));
});

// GET /api/analytics/forecast -> ML forecast for the current month,
// using only COMPLETE past months as history (the current month is still running).
router.get('/forecast', async (req, res) => {
  const thisMonth = currentMonth();
  const history = await monthlySeries(req.userId, 12, addMonths(thisMonth, -1));
  const firstActive = history.findIndex((h) => h.total > 0);
  const series = firstActive === -1 ? [] : history.slice(firstActive);
  if (series.length === 0) return res.json({ month: thisMonth, forecast: null, reason: 'no history yet' });

  const result = await forecastNextMonth(series.map((h) => h.total), Number(thisMonth.slice(5)));
  if (!result) return res.status(503).json({ error: 'ML service unavailable' });

  const { start, end } = monthRange(thisMonth);
  const [spent] = await Transaction.aggregate([
    { $match: spendMatch(req.userId, start, end) },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  res.json({
    month: thisMonth,
    forecast: Math.round(result.forecast),
    model: result.model,
    spentSoFar: Math.round(spent?.total || 0),
    history: series,
  });
});

export default router;
