import mongoose from 'mongoose';

export const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities',
  'Entertainment', 'Health & Fitness', 'Travel', 'Education', 'Housing',
];

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    description: { type: String, required: true, trim: true }, // raw bank narration
    merchant: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },        // INR, spending only
    date: { type: Date, required: true },

    // filled by the ML service
    category: { type: String, enum: CATEGORIES, required: true },
    categorySource: { type: String, enum: ['ml', 'user'], default: 'ml' },
    categoryConfidence: { type: Number, default: null },
    anomalyScore: { type: Number, default: 0 },
    isAnomaly: { type: Boolean, default: false },
    anomalyReasons: { type: [String], default: [] },
  },
  { timestamps: true }
);

// most queries are "this user's transactions, newest first"
transactionSchema.index({ user: 1, date: -1 });

export default mongoose.model('Transaction', transactionSchema);
