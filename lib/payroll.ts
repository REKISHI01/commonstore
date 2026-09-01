export type PayrollScheme = {
  id: string
  baseSalary: number
  workerSharePercent: number
  reservePercent: number
  effectiveFrom: string
  note: string
  createdAt?: string
  createdByName?: string
}

export type PayrollRun = {
  id: string
  monthKey: string
  periodStart: string
  periodEnd: string
  schemeSnapshot: PayrollScheme
  workerCount: number
  orderCount: number
  grossOrderProfit: number
  expensesTotal: number
  netProfit: number
  reserveAmount: number
  fixedSalaryTotal: number
  distributableProfit: number
  workerShareTotal: number
  totalPayroll: number
  ownerRemaining: number
  status: 'finalized' | 'paid'
  finalizedAt: string
  paidAt?: string
}

export type PayrollItem = {
  id: string
  runId: string
  monthKey: string
  workerId: string
  workerName: string
  baseSalary: number
  sharePercent: number
  shareAmount: number
  totalPay: number
  businessSnapshot: Record<string, unknown>
  createdAt: string
}

export const rupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0)

export const monthKeyNowJakarta = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7)
