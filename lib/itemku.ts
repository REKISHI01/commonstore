export type OrderStatus = 'Baru' | 'Diproses' | 'Menunggu' | 'Selesai' | 'Cancel' | 'Refund'
export type Trend = 'naik' | 'turun' | 'stabil' | 'baru'

export type Product = {
  id: string
  name: string
  game: string
  category: string
  sku: string
  supplier: string
  stock: number
  reorderPoint: number
  modal: number
  price: number
  fee: number
  fixed: number
  other: number
  target: number
  stockSince: string
  discountEnabled: boolean
  discountPrice?: number
  active: boolean
  updatedAt?: string
}

export type OrderSnapshot = {
  unitPrice: number
  unitModal: number
  feePercent: number
  fixedCost: number
  otherUnitCost: number
  revenue: number
  feeAmount: number
  capital: number
  totalCost: number
  profit: number
}

export type Order = {
  id: string
  invoiceNo: string
  productId: string
  productName: string
  game: string
  supplierSnapshot?: string
  buyerIdentifier: string
  serverId?: string
  channel: string
  qty: number
  note: string
  createdAt: string
  processingAt?: string
  completedAt?: string
  status: OrderStatus
  assignedWorker?: string
  assignedWorkerId?: string
  refundReason?: string
  stockRestored?: boolean
  snapshot: OrderSnapshot
  updatedAt?: string
}

export type WorkerPermissions = {
  canProcessOrders: boolean
  canRefund: boolean
  canViewStock: boolean
  canViewFinancials: boolean
  allowedGames: string[]
}

export type Worker = {
  id: string
  cloudUserId?: string
  name: string
  username: string
  password: string
  active: boolean
  enabled?: boolean
  lastLogin?: string
  permissions: WorkerPermissions
}

export type AuditLog = {
  id: string
  action: string
  detail?: string
  actor: string
  createdAt: string
}

export type Opportunity = {
  id: string
  game: string
  product: string
  category: string
  marketPrice: number
  previousMarketPrice: number
  capital: number
  soldSignal: number
  previousSoldSignal: number
  listingSignal: number
  competitorCount: number
  checkedAt: string
  note: string
  trend: Trend
}


export type CustomerNote = {
  id: string
  buyerIdentifier: string
  note: string
  createdAt: string
  updatedAt: string
}

export type Restock = {
  id: string
  productId: string
  productName: string
  supplier: string
  qty: number
  unitCost: number
  totalCost: number
  previousStock: number
  newStock: number
  createdAt: string
  note: string
}

export type Expense = {
  id: string
  category: string
  amount: number
  date: string
  note: string
}

export type BusinessTarget = {
  id: string
  month: string
  targetProfit: number
  targetRevenue: number
}

export type PriceHistory = {
  id: string
  productId: string
  productName: string
  field: 'modal' | 'price'
  fromValue: number
  toValue: number
  createdAt: string
}

export type Calculation = {
  revenue: number
  feeAmount: number
  capital: number
  totalCost: number
  profit: number
  margin: number
  roi: number
  bep: number
  targetPrice: number
}

export type StoreSettings = {
  storeName: string
  defaultChannel: string
  theme: 'system' | 'light' | 'dark'
}

export const DEFAULT_PERMISSIONS: WorkerPermissions = {
  canProcessOrders: true,
  canRefund: false,
  canViewStock: true,
  canViewFinancials: false,
  allowedGames: [],
}

export const money = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Math.round(Number.isFinite(value) ? value : 0))

export const id = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export function calculateProduct(product: Pick<Product, 'modal' | 'price' | 'fee' | 'fixed' | 'other' | 'target'>, qty = 1, overridePrice?: number): Calculation {
  const safeQty = Math.max(1, Number(qty) || 1)
  const unitPrice = Math.max(0, overridePrice ?? product.price)
  const revenue = unitPrice * safeQty
  const feePercent = Math.min(99.99, Math.max(0, product.fee || 0))
  const feeAmount = revenue * feePercent / 100
  const capital = Math.max(0, product.modal || 0) * safeQty
  const totalCost = capital + feeAmount + Math.max(0, product.fixed || 0) + Math.max(0, product.other || 0) * safeQty
  const profit = revenue - totalCost
  const margin = revenue ? profit / revenue * 100 : 0
  const roi = capital ? profit / capital * 100 : 0
  const base = Math.max(0, product.modal || 0) + Math.max(0, product.other || 0) + Math.max(0, product.fixed || 0) / safeQty
  const bep = base / (1 - feePercent / 100)
  const denominator = 1 - feePercent / 100 - Math.max(0, product.target || 0) / 100
  const targetPrice = denominator > 0 ? base / denominator : 0
  return { revenue, feeAmount, capital, totalCost, profit, margin, roi, bep, targetPrice }
}

export function makeSnapshot(product: Product, qty: number): OrderSnapshot {
  const unitPrice = product.discountEnabled && product.discountPrice && product.discountPrice > 0 ? product.discountPrice : product.price
  const calc = calculateProduct(product, qty, unitPrice)
  return {
    unitPrice,
    unitModal: product.modal,
    feePercent: product.fee,
    fixedCost: product.fixed,
    otherUnitCost: product.other,
    revenue: calc.revenue,
    feeAmount: calc.feeAmount,
    capital: calc.capital,
    totalCost: calc.totalCost,
    profit: calc.profit,
  }
}

const safeParse = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch { return fallback }
}

export function loadProducts(): Product[] {
  const raw = safeParse<any[]>('itemkuProducts', [])
  return raw.map((p, index) => ({
    id: p.id || id(`product${index}`),
    name: p.name || 'Tanpa Nama',
    game: p.game || 'Roblox',
    category: p.category || 'Item',
    sku: p.sku || '',
    supplier: p.supplier || '',
    stock: Math.max(0, Number(p.stock) || 0),
    reorderPoint: Math.max(0, Number(p.reorderPoint ?? p.reorder_point) || 5),
    modal: Math.max(0, Number(p.modal) || 0),
    price: Math.max(0, Number(p.price) || 0),
    fee: Math.max(0, Number(p.fee) || 0),
    fixed: Math.max(0, Number(p.fixed) || 0),
    other: Math.max(0, Number(p.other) || 0),
    target: Math.max(0, Number(p.target) || 0),
    stockSince: p.stockSince || p.stock_since || new Date().toISOString(),
    discountEnabled: Boolean(p.discountEnabled ?? p.discount_enabled),
    discountPrice: Math.max(0, Number(p.discountPrice ?? p.discount_price) || 0),
    active: p.active !== false,
    updatedAt: p.updatedAt || p.updated_at,
  }))
}
export function saveProducts(items: Product[]) { localStorage.setItem('itemkuProducts', JSON.stringify(items)) }

function localInvoice(index: number, createdAt: string) {
  const d = new Date(createdAt)
  const y = String(d.getFullYear()).slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `INV-${y}${m}${day}-${String(index + 1).padStart(4, '0')}`
}

export function loadOrders(products: Product[]): Order[] {
  const raw = safeParse<any[]>('itemkuOrders', [])
  return raw.map((o, index) => {
    const product = products.find((p) => p.id === o.productId) || products.find((p) => p.name === o.productName)
    const qty = Math.max(1, Number(o.qty) || 1)
    const fallbackSnapshot: OrderSnapshot = product ? makeSnapshot(product, qty) : {
      unitPrice: 0, unitModal: 0, feePercent: 0, fixedCost: 0, otherUnitCost: 0,
      revenue: 0, feeAmount: 0, capital: 0, totalCost: 0, profit: 0,
    }
    const createdAt = o.createdAt || o.created_at || new Date().toISOString()
    return {
      id: o.id || id(`order${index}`),
      invoiceNo: o.invoiceNo || o.invoice_no || localInvoice(index, createdAt),
      productId: o.productId || o.product_id || product?.id || '',
      productName: o.productName || o.product_name || product?.name || 'Produk lama',
      game: o.game || product?.game || 'Roblox',
      supplierSnapshot: o.supplierSnapshot || o.supplier_snapshot || product?.supplier || '',
      buyerIdentifier: o.buyerIdentifier || o.buyer_identifier || o.robloxUsername || o.buyer || 'Tidak diisi',
      serverId: o.serverId || o.server_id || '',
      channel: o.channel || 'Itemku',
      qty,
      note: o.note || '',
      createdAt,
      processingAt: o.processingAt || o.processing_at,
      completedAt: o.completedAt || o.completed_at,
      status: (o.status || 'Baru') as OrderStatus,
      assignedWorker: o.assignedWorker || o.assigned_worker_name,
      assignedWorkerId: o.assignedWorkerId || o.assigned_worker_id,
      refundReason: o.refundReason || o.refund_reason,
      stockRestored: Boolean(o.stockRestored ?? o.stock_restored),
      snapshot: o.snapshot || fallbackSnapshot,
      updatedAt: o.updatedAt || o.updated_at,
    }
  })
}
export function saveOrders(items: Order[]) { localStorage.setItem('itemkuOrders', JSON.stringify(items)) }

export function nextLocalInvoice(orders: Order[], when = new Date()) {
  const yy = String(when.getFullYear()).slice(-2)
  const mm = String(when.getMonth() + 1).padStart(2, '0')
  const dd = String(when.getDate()).padStart(2, '0')
  const prefix = `INV-${yy}${mm}${dd}-`
  const max = orders.filter(o => o.invoiceNo?.startsWith(prefix)).reduce((n, o) => Math.max(n, Number(o.invoiceNo.split('-').pop()) || 0), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function loadWorkers(): Worker[] {
  const defaults: Worker[] = [
    { id: 'worker_1', name: 'Worker 1', username: 'worker1', password: 'worker123', active: false, enabled: true, permissions: { ...DEFAULT_PERMISSIONS } },
    { id: 'worker_2', name: 'Worker 2', username: 'worker2', password: 'worker123', active: false, enabled: true, permissions: { ...DEFAULT_PERMISSIONS } },
  ]
  const raw = safeParse<any[]>('itemkuWorkers', defaults)
  return Array.isArray(raw) ? raw.map((w, i) => ({
    id: w.id || `worker_${i + 1}`, cloudUserId: w.cloudUserId || w.cloud_user_id || '', name: w.name || `Worker ${i + 1}`, username: w.username || '', password: w.password || '', active: Boolean(w.active), enabled: w.enabled !== false, lastLogin: w.lastLogin,
    permissions: { ...DEFAULT_PERMISSIONS, ...(w.permissions || {}), allowedGames: Array.isArray(w.permissions?.allowedGames) ? w.permissions.allowedGames : [] },
  })) : defaults
}
export function saveWorkers(items: Worker[]) { localStorage.setItem('itemkuWorkers', JSON.stringify(items)) }

export function loadAudit(): AuditLog[] { return safeParse<AuditLog[]>('itemkuChangeHistory', []) }
export function appendAudit(action: string, detail = '', actor = 'Owner') {
  if (typeof window === 'undefined') return
  const logs = loadAudit()
  const next = [{ id: id('log'), action, detail, actor, createdAt: new Date().toISOString() }, ...logs].slice(0, 1000)
  localStorage.setItem('itemkuChangeHistory', JSON.stringify(next))
  window.dispatchEvent(new Event('itemku:audit'))
}

export function loadOpportunities(): Opportunity[] {
  const raw = safeParse<any[]>('itemkuOpportunities', [])
  return raw.map(x => ({
    id: x.id || id('opp'), game: x.game || '', product: x.product || '', category: x.category || 'Item',
    marketPrice: Number(x.marketPrice ?? x.market_price) || 0, previousMarketPrice: Number(x.previousMarketPrice ?? x.previous_market_price) || 0,
    capital: Number(x.capital) || 0, soldSignal: Number(x.soldSignal ?? x.sold_signal) || 0, previousSoldSignal: Number(x.previousSoldSignal ?? x.previous_sold_signal) || 0,
    listingSignal: Number(x.listingSignal ?? x.listing_signal) || 0, competitorCount: Number(x.competitorCount ?? x.competitor_count) || 0,
    checkedAt: x.checkedAt || x.checked_at || new Date().toISOString(), note: x.note || '', trend: (x.trend || 'baru') as Trend,
  }))
}
export function saveOpportunities(items: Opportunity[]) { localStorage.setItem('itemkuOpportunities', JSON.stringify(items)) }

export function loadCustomerNotes(): CustomerNote[] { return safeParse<CustomerNote[]>('itemkuCustomerNotes', []) }
export function saveCustomerNotes(items: CustomerNote[]) { localStorage.setItem('itemkuCustomerNotes', JSON.stringify(items)) }

export function loadRestocks(): Restock[] { return safeParse<Restock[]>('itemkuRestocks', []) }
export function saveRestocks(items: Restock[]) { localStorage.setItem('itemkuRestocks', JSON.stringify(items)) }
export function loadExpenses(): Expense[] { return safeParse<Expense[]>('itemkuExpenses', []) }
export function saveExpenses(items: Expense[]) { localStorage.setItem('itemkuExpenses', JSON.stringify(items)) }
export function loadTargets(): BusinessTarget[] { return safeParse<BusinessTarget[]>('itemkuTargets', []) }
export function saveTargets(items: BusinessTarget[]) { localStorage.setItem('itemkuTargets', JSON.stringify(items)) }
export function loadPriceHistory(): PriceHistory[] { return safeParse<PriceHistory[]>('itemkuPriceHistory', []) }
export function savePriceHistory(items: PriceHistory[]) { localStorage.setItem('itemkuPriceHistory', JSON.stringify(items)) }
export function loadSettings(): StoreSettings { return { storeName: 'Itemku Profit', defaultChannel: 'Itemku', theme: 'system', ...safeParse<Partial<StoreSettings>>('itemkuSettings', {}) } }
export function saveSettings(item: StoreSettings) { localStorage.setItem('itemkuSettings', JSON.stringify(item)) }

export function opportunityScore(item: Opportunity) {
  const gross = Math.max(0, item.marketPrice - item.capital)
  const margin = item.marketPrice ? gross / item.marketPrice * 100 : 0
  const demand = Math.min(100, Math.log10(Math.max(1, item.soldSignal) + 1) * 25)
  const competitionBase = Math.max(item.listingSignal, item.competitorCount * 10)
  const competition = Math.min(100, Math.log10(Math.max(1, competitionBase) + 1) * 25)
  const trendBonus = item.trend === 'naik' ? 10 : item.trend === 'turun' ? -10 : 0
  return Math.max(0, Math.min(100, Math.round(margin * .42 + demand * .43 + (100 - competition) * .15 + trendBonus)))
}

export function opportunityLabel(score: number) {
  if (score >= 70) return '🔥 Layak stok'
  if (score >= 45) return '🟡 Pantau'
  return '🔴 Hindari'
}

export function inferOpportunityTrend(current: Pick<Opportunity,'marketPrice'|'soldSignal'>, previous: Pick<Opportunity,'marketPrice'|'soldSignal'>): Trend {
  if (!previous.marketPrice && !previous.soldSignal) return 'baru'
  const soldDelta = current.soldSignal - previous.soldSignal
  const priceDelta = current.marketPrice - previous.marketPrice
  if (soldDelta > 0 && priceDelta >= 0) return 'naik'
  if (soldDelta < 0 || (priceDelta < 0 && soldDelta <= 0)) return 'turun'
  return 'stabil'
}

export function updateProductWithHistory(oldP: Product, newP: Product, history: PriceHistory[]) {
  const next = [...history]
  if (oldP.modal !== newP.modal) next.unshift({ id: id('price'), productId: oldP.id, productName: oldP.name, field: 'modal', fromValue: oldP.modal, toValue: newP.modal, createdAt: new Date().toISOString() })
  if (oldP.price !== newP.price) next.unshift({ id: id('price'), productId: oldP.id, productName: oldP.name, field: 'price', fromValue: oldP.price, toValue: newP.price, createdAt: new Date().toISOString() })
  return next.slice(0, 2000)
}

export function businessTotals(orders: Order[], expenses: Expense[] = [], start?: Date, end?: Date) {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime()
    return (!start || t >= start.getTime()) && (!end || t <= end.getTime())
  }
  const done = orders.filter(o => o.status === 'Selesai' && inRange(o.completedAt || o.createdAt))
  const revenue = done.reduce((s,o)=>s+o.snapshot.revenue,0)
  const grossProfit = done.reduce((s,o)=>s+o.snapshot.profit,0)
  const expenseTotal = expenses.filter(e=>inRange(e.date)).reduce((s,e)=>s+e.amount,0)
  return { orderCount: done.length, revenue, grossProfit, expenses: expenseTotal, netProfit: grossProfit - expenseTotal, avgProfit: done.length ? grossProfit / done.length : 0 }
}

export function customerStats(orders: Order[]) {
  const map = new Map<string,{buyer:string;orders:number;spend:number;profit:number;refunds:number;lastAt:string;lastProduct:string}>()
  orders.forEach(o => {
    const key = o.buyerIdentifier.trim().toLowerCase()
    if (!key) return
    const prev = map.get(key) || { buyer:o.buyerIdentifier,orders:0,spend:0,profit:0,refunds:0,lastAt:o.createdAt,lastProduct:o.productName }
    if (o.status === 'Selesai') { prev.orders += 1; prev.spend += o.snapshot.revenue; prev.profit += o.snapshot.profit }
    if (o.status === 'Refund') prev.refunds += 1
    if (new Date(o.createdAt) > new Date(prev.lastAt)) { prev.lastAt=o.createdAt; prev.lastProduct=o.productName }
    map.set(key, prev)
  })
  return [...map.values()].sort((a,b)=>b.spend-a.spend)
}

export function workerStats(orders: Order[]) {
  const map = new Map<string,{worker:string;completed:number;refunds:number;active:number;avgMinutes:number;lastAt:string;_minutes:number[]}>()
  orders.forEach(o => {
    if (!o.assignedWorker) return
    const prev = map.get(o.assignedWorker) || { worker:o.assignedWorker,completed:0,refunds:0,active:0,avgMinutes:0,lastAt:o.completedAt||o.processingAt||o.createdAt,_minutes:[] }
    if (o.status === 'Selesai') {
      prev.completed++
      if (o.processingAt && o.completedAt) prev._minutes.push((new Date(o.completedAt).getTime()-new Date(o.processingAt).getTime())/60000)
    }
    if (o.status === 'Refund') prev.refunds++
    if (o.status === 'Diproses') prev.active++
    const activityAt=o.completedAt||o.processingAt||o.createdAt
    if(new Date(activityAt)>new Date(prev.lastAt))prev.lastAt=activityAt
    prev.avgMinutes = prev._minutes.length ? prev._minutes.reduce((a,b)=>a+b,0)/prev._minutes.length : 0
    map.set(o.assignedWorker, prev)
  })
  return [...map.values()].map(({_minutes,...x})=>x).sort((a,b)=>b.completed-a.completed)
}

export type AlertItem = { id:string; level:'info'|'warn'|'danger'|'success'; title:string; detail:string }
export function deriveAlerts(products: Product[], orders: Order[]): AlertItem[] {
  const now = Date.now()
  const alerts: AlertItem[] = []
  products.filter(p=>p.active && calculateProduct(p).profit<0).forEach(p=>alerts.push({id:`loss-${p.id}`,level:'danger',title:'Harga jual berpotensi rugi',detail:`${p.game} · ${p.name}: estimasi ${money(calculateProduct(p).profit)} / order`}))
  products.filter(p=>p.active && p.stock <= p.reorderPoint).forEach(p=>alerts.push({id:`stock-${p.id}`,level:p.stock===0?'danger':'warn',title:p.stock===0?'Stok habis':'Stok menipis',detail:`${p.game} · ${p.name}: ${p.stock} unit tersisa`}))
  orders.filter(o=>(o.status==='Baru'||o.status==='Diproses') && now-new Date(o.createdAt).getTime()>15*60000).forEach(o=>alerts.push({id:`order-${o.id}`,level:'warn',title:'Order menunggu >15 menit',detail:`${o.invoiceNo} · ${o.productName}`}))
  const today = new Date(); today.setHours(0,0,0,0)
  const counts = new Map<string,number>()
  orders.filter(o=>o.status==='Selesai' && new Date(o.completedAt||o.createdAt)>=today).forEach(o=>counts.set(o.productName,(counts.get(o.productName)||0)+o.qty))
  ;[...counts.entries()].filter(([,n])=>n>=10).forEach(([name,n])=>alerts.push({id:`hot-${name}`,level:'success',title:'Produk ramai hari ini',detail:`${name} sudah terjual ${n} unit`}))
  return alerts.slice(0,30)
}

export function exportBackup() {
  const payload = {
    version: 3,
    exportedAt: new Date().toISOString(),
    products: safeParse<any[]>('itemkuProducts', []),
    orders: safeParse<any[]>('itemkuOrders', []),
    workers: safeParse<any[]>('itemkuWorkers', []),
    audit: safeParse<any[]>('itemkuChangeHistory', []),
    opportunities: safeParse<any[]>('itemkuOpportunities', []),
    restocks: safeParse<any[]>('itemkuRestocks', []),
    customerNotes: safeParse<any[]>('itemkuCustomerNotes', []),
    expenses: safeParse<any[]>('itemkuExpenses', []),
    targets: safeParse<any[]>('itemkuTargets', []),
    priceHistory: safeParse<any[]>('itemkuPriceHistory', []),
    settings: safeParse<any>('itemkuSettings', {}),
  }
  return JSON.stringify(payload, null, 2)
}

export function restoreBackup(json: string) {
  const data = JSON.parse(json)
  if (!data || typeof data !== 'object') throw new Error('Backup tidak valid')
  const mappings: [string,string][] = [
    ['products','itemkuProducts'],['orders','itemkuOrders'],['workers','itemkuWorkers'],['audit','itemkuChangeHistory'],['opportunities','itemkuOpportunities'],['restocks','itemkuRestocks'],['customerNotes','itemkuCustomerNotes'],['expenses','itemkuExpenses'],['targets','itemkuTargets'],['priceHistory','itemkuPriceHistory'],
  ]
  mappings.forEach(([field,key])=>{ if (Array.isArray(data[field])) localStorage.setItem(key, JSON.stringify(data[field])) })
  if (data.settings) localStorage.setItem('itemkuSettings', JSON.stringify(data.settings))
}
