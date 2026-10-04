import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import transactionRoutes from './routes/transactions.js';
import budgetRoutes from './routes/budgets.js';
import analyticsRoutes from './routes/analytics.js';
import { CATEGORIES } from './models/Transaction.js';
import { mlHealth } from './services/mlClient.js';

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => res.json({ api: 'ok', ml: await mlHealth() }));
app.get('/api/categories', (req, res) => res.json(CATEGORIES));
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use((req, res) => res.status(404).json({ error: 'not found' }));

// Express 5 forwards errors from async handlers here automatically
app.use((err, req, res, next) => {
  if (err.name === 'CastError') return res.status(400).json({ error: 'invalid id' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

export default app;
