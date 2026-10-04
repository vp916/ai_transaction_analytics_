// Shapes of the JSON returned by the Express API.

export type User = { id: string; name: string; email: string }

export type Transaction = {
  _id: string
  description: string
  merchant: string
  amount: number
  date: string
  category: string
  categorySource: 'ml' | 'user'
  categoryConfidence: number | null
  anomalyScore: number
  isAnomaly: boolean
  anomalyReasons: string[]
}

export type Summary = {
  month: string
  totalSpent: number
  transactionCount: number
  previousMonthTotal: number
  anomalyCount: number
  byCategory: { category: string; total: number; count: number }[]
  topMerchants: { merchant: string; total: number; count: number }[]
}

export type MonthTotal = { month: string; total: number }

export type Forecast = {
  month: string
  forecast: number | null
  model?: string
  spentSoFar?: number
}

export type Budget = {
  _id: string
  category: string
  monthlyLimit: number
  spent: number
  remaining: number
  percentUsed: number
}
