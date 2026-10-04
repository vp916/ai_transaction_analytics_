import mongoose from 'mongoose';
import { CATEGORIES } from './Transaction.js';

// One monthly spending limit per (user, category)
const budgetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    monthlyLimit: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

budgetSchema.index({ user: 1, category: 1 }, { unique: true });

export default mongoose.model('Budget', budgetSchema);
