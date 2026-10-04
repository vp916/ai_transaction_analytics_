import { config } from '../config.js';

// Thin HTTP client for the FastAPI ML microservice.
// If the ML service is down, the main app keeps working (fallbacks below).

async function post(path, body) {
  const res = await fetch(`${config.mlServiceUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ML service ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

/** texts: string[] -> [{ category, confidence }] */
export async function categorize(texts) {
  try {
    const data = await post('/categorize', { descriptions: texts });
    return data.predictions.map((p) => ({ category: p.category, confidence: p.confidence }));
  } catch (err) {
    console.error('[ml] categorize failed:', err.message);
    return texts.map(() => ({ category: 'Shopping', confidence: null }));
  }
}

// MongoDB stores dates in UTC. The model needs the LOCAL hour of day
// (a 9 AM payment in India is 03:30 UTC, which would look like a night-time payment).
function localTime(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19); // "2026-10-04T09:15:00", no "Z"
}

/** transactions: [{ id, amount, category, merchant, date }] -> Map(id -> result) */
export async function scoreAnomalies(transactions) {
  if (transactions.length === 0) return new Map();
  try {
    const data = await post('/anomaly', {
      transactions: transactions.map((t) => ({
        id: String(t._id),
        amount: t.amount,
        category: t.category,
        merchant: t.merchant,
        timestamp: localTime(t.date),
      })),
    });
    return new Map(data.results.map((r) => [r.id, r]));
  } catch (err) {
    console.error('[ml] anomaly failed:', err.message);
    return new Map();
  }
}

/** monthlyTotals: number[] (oldest first), targetMonth: 1..12 */
export async function forecastNextMonth(monthlyTotals, targetMonth) {
  try {
    return await post('/forecast', { monthly_totals: monthlyTotals, target_month: targetMonth });
  } catch (err) {
    console.error('[ml] forecast failed:', err.message);
    return null;
  }
}

export async function mlHealth() {
  try {
    const res = await fetch(`${config.mlServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : { status: 'down' };
  } catch {
    return { status: 'down' };
  }
}
