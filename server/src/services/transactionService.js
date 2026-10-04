import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { categorize, scoreAnomalies } from './mlClient.js';

const HISTORY_LIMIT = 1000; // anomaly scoring looks at the user's last 1000 transactions

/**
 * Insert new transactions for a user.
 * Any transaction without a category is auto-categorized by the ML service.
 */
export async function addTransactions(userId, items) {
  const needML = items.filter((t) => !t.category);
  const predictions = await categorize(needML.map((t) => t.description));
  needML.forEach((t, i) => {
    t.category = predictions[i].category;
    t.categoryConfidence = predictions[i].confidence;
    t.categorySource = 'ml';
  });
  items.filter((t) => t.categorySource !== 'ml').forEach((t) => (t.categorySource = 'user'));

  const docs = await Transaction.insertMany(items.map((t) => ({ ...t, user: userId })));
  await rescoreAnomalies(userId);
  return Transaction.find({ _id: { $in: docs.map((d) => d._id) } });
}

/**
 * Re-score the user's recent history with the Isolation Forest.
 * Scores are relative to the user's own habits, so they change as history grows.
 */
export async function rescoreAnomalies(userId) {
  const recent = await Transaction.find({ user: userId })
    .sort({ date: -1 })
    .limit(HISTORY_LIMIT)
    .lean();
  const results = await scoreAnomalies(recent);
  if (results.size === 0) return 0;

  const ops = recent.map((t) => {
    const r = results.get(String(t._id));
    return {
      updateOne: {
        filter: { _id: t._id },
        update: { anomalyScore: r.anomaly_score, isAnomaly: r.is_anomaly, anomalyReasons: r.reasons },
      },
    };
  });
  await Transaction.bulkWrite(ops);
  return recent.filter((t) => results.get(String(t._id))?.is_anomaly).length;
}

export const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
