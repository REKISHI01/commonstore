import { calculateProduct, type BusinessTarget, type Expense, type Order, type Product, type Worker } from './itemku'
import { type ChannelRule, type Dispute, type PurchaseOrder, type Settlement } from './v4'
import { smartRestock, workerQueue } from './v41'
import { deadStockRecovery, profitLeakDetector } from './v43'

const DAY = 86_400_000
const since = (days:number) => Date.now() - days * DAY
const clamp = (n:number,min=0,max=100) => Math.max(min,Math.min(max,n))
const norm = (s?:string) => String(s||'').trim().toLowerCase()

export type ActionPriority = 'P1'|'P2'|'P3'
export type ActionItem = {
  id:string
  priority:ActionPriority
  category:'Stok'|'Margin'|'Settlement'|'Dispute'|'Order'|'Target'
  title:string
  detail:string
  impact:number
  target:string
}

export function actionCenter(
  products:Product[], orders:Order[], settlements:Settlement[], disputes:Dispute[], targets:BusinessTarget[]
):ActionItem[] {
  const rows:ActionItem[]=[]
  const restock=smartRestock(products,orders)
  restock.filter(x=>x.urgency==='Kritis').forEach(x=>rows.push({
    id:`stock-${x.productId}`,priority:'P1',category:'Stok',title:`Restock ${x.productName}`,
    detail:x.daysLeft===null?`Stok ${x.stock}; belum ada velocity penjualan.`:`Stok diperkirakan bertahan ${x.daysLeft.toFixed(1)} hari. Saran +${x.recommendedRestock} unit.`,
    impact:x.recommendedRestock*(products.find(p=>p.id===x.productId)?.modal||0),target:'Reorder Planner'
  }))
  profitLeakDetector(products,orders,settlements).slice(0,12).forEach(x=>rows.push({
    id:`leak-${x.id}`,priority:x.severity==='Kritis'?'P1':'P2',category:x.kind==='Margin'?'Margin':x.kind==='Settlement'?'Settlement':'Stok',
    title:x.title,detail:x.detail,impact:x.impact,target:x.target
  }))
  disputes.filter(d=>!['Selesai','Ditutup'].includes(d.status)).forEach(d=>rows.push({
    id:`dispute-${d.id}`,priority:'P1',category:'Dispute',title:`Dispute ${d.invoiceNo}`,
    detail:`${d.buyerIdentifier} · ${d.reason}`,impact:0,target:'Dispute & SLA'
  }))
  orders.filter(o=>['Baru','Diproses','Menunggu'].includes(o.status)).forEach(o=>{
    const age=(Date.now()-new Date(o.createdAt).getTime())/60000
    if(age>=15) rows.push({id:`order-${o.id}`,priority:age>=60?'P1':'P2',category:'Order',title:`Order ${o.invoiceNo} terlambat`,detail:`${o.productName} · ${Math.floor(age)} menit belum selesai.`,impact:o.snapshot.revenue,target:'Order Kanban'})
  })
  const month=new Date();const key=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`
  const target=targets.find(t=>t.month===key)
  if(target?.targetProfit){
    const start=new Date(month.getFullYear(),month.getMonth(),1).getTime()
    const profit=orders.filter(o=>o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=start).reduce((s,o)=>s+o.snapshot.profit,0)
    const day=Math.max(1,month.getDate()),days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate()
    const forecast=profit/day*days
    if(forecast<target.targetProfit) rows.push({id:'target-gap',priority:forecast<target.targetProfit*.7?'P1':'P2',category:'Target',title:'Target profit berisiko tidak tercapai',detail:`Proyeksi saat ini ${Math.round(forecast).toLocaleString('id-ID')} dari target ${Math.round(target.targetProfit).toLocaleString('id-ID')}.`,impact:Math.max(0,target.targetProfit-forecast),target:'Target Bisnis'})
  }
  const rank:Record<ActionPriority,number>={P1:0,P2:1,P3:2}
  const unique=new Map<string,ActionItem>();rows.forEach(x=>{if(!unique.has(x.id))unique.set(x.id,x)})
  return [...unique.values()].sort((a,b)=>rank[a.priority]-rank[b.priority]||b.impact-a.impact).slice(0,60)
}

export type WorkingCapitalSnapshot={
  stockCapital:number
  openPoCommitment:number
  unpaidSettlement:number
  expense30:number
  dailyExpenseBurn:number
  grossProfit30:number
  netOperating30:number
  avgDailyProfit:number
  stockCoverageDays:number|null
  liquidityPressure:'Rendah'|'Sedang'|'Tinggi'
  score:number
}
export function workingCapitalPlanner(products:Product[],orders:Order[],expenses:Expense[],purchaseOrders:PurchaseOrder[],settlements:Settlement[]):WorkingCapitalSnapshot{
  const stockCapital=products.filter(p=>p.active&&p.stock>0).reduce((s,p)=>s+p.stock*p.modal,0)
  const openPoCommitment=purchaseOrders.filter(p=>!['Diterima','Batal'].includes(p.status)).reduce((s,p)=>s+p.totalCost,0)
  const unpaidSettlement=settlements.filter(s=>s.status!=='Sudah Cair').reduce((s,x)=>s+Math.max(0,x.expectedAmount-x.actualAmount),0)
  const expense30=expenses.filter(e=>new Date(e.date).getTime()>=since(30)).reduce((s,e)=>s+e.amount,0)
  const done30=orders.filter(o=>o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=since(30))
  const grossProfit30=done30.reduce((s,o)=>s+o.snapshot.profit,0)
  const netOperating30=grossProfit30-expense30
  const avgDailyProfit=netOperating30/30
  const sold30=done30.reduce((s,o)=>s+o.qty,0)
  const stockUnits=products.filter(p=>p.active).reduce((s,p)=>s+p.stock,0)
  const dailyUnits=sold30/30
  const stockCoverageDays=dailyUnits>0?stockUnits/dailyUnits:null
  let pressure=0
  if(openPoCommitment>Math.max(1,grossProfit30))pressure+=35
  if(stockCapital>Math.max(1,grossProfit30*2))pressure+=25
  if(unpaidSettlement>Math.max(1,grossProfit30*.5))pressure+=20
  if(netOperating30<0)pressure+=30
  if(stockCoverageDays!==null&&stockCoverageDays>45)pressure+=15
  const score=Math.round(clamp(100-pressure))
  const liquidityPressure:WorkingCapitalSnapshot['liquidityPressure']=pressure>=60?'Tinggi':pressure>=30?'Sedang':'Rendah'
  return {stockCapital,openPoCommitment,unpaidSettlement,expense30,dailyExpenseBurn:expense30/30,grossProfit30,netOperating30,avgDailyProfit,stockCoverageDays,liquidityPressure,score}
}

export type ScenarioInput={salesChangePct:number;feeDeltaPct:number;refundChangePct:number;expenseChangePct:number}
export type ScenarioResult={baselineRevenue:number;baselineProfit:number;scenarioRevenue:number;scenarioProfit:number;deltaProfit:number;scenarioMargin:number;baselineMargin:number;note:string[]}
export function scenarioLab(orders:Order[],expenses:Expense[],input:ScenarioInput):ScenarioResult{
  const recent=orders.filter(o=>new Date(o.createdAt).getTime()>=since(30))
  const done=recent.filter(o=>o.status==='Selesai')
  const baselineRevenue=done.reduce((s,o)=>s+o.snapshot.revenue,0)
  const baselineGross=done.reduce((s,o)=>s+o.snapshot.profit,0)
  const baselineFees=done.reduce((s,o)=>s+o.snapshot.feeAmount,0)
  const baselineExpenses=expenses.filter(e=>new Date(e.date).getTime()>=since(30)).reduce((s,e)=>s+e.amount,0)
  const baselineProfit=baselineGross-baselineExpenses
  const salesFactor=Math.max(0,1+input.salesChangePct/100)
  const extraFee=Math.max(0,baselineRevenue*salesFactor*Math.max(0,input.feeDeltaPct)/100)
  const baseRefundRate=recent.length?recent.filter(o=>o.status==='Refund'||o.status==='Cancel').length/recent.length:0
  const scenarioRefundRate=clamp(baseRefundRate*100+input.refundChangePct,0,95)/100
  // Baseline profit already reflects historical completed/refunded orders. Only charge the
  // incremental refund-rate change so a 0% scenario remains identical to the baseline.
  const incrementalRefundRate=scenarioRefundRate-baseRefundRate
  const refundDrag=baselineRevenue*salesFactor*incrementalRefundRate*.12
  const scenarioExpenses=baselineExpenses*Math.max(0,1+input.expenseChangePct/100)
  const scenarioRevenue=baselineRevenue*salesFactor
  const scenarioGross=(baselineGross+baselineFees)*salesFactor-baselineFees*salesFactor-extraFee-refundDrag
  const scenarioProfit=scenarioGross-scenarioExpenses
  const baselineMargin=baselineRevenue?baselineProfit/baselineRevenue*100:0
  const scenarioMargin=scenarioRevenue?scenarioProfit/scenarioRevenue*100:0
  const note:string[]=[]
  if(input.feeDeltaPct>0)note.push(`Tambahan fee ${input.feeDeltaPct}% menekan profit sekitar ${Math.round(extraFee).toLocaleString('id-ID')}.`)
  if(input.salesChangePct<0)note.push('Skenario penjualan turun; cek stok dan biaya tetap agar tidak terlalu agresif restock.')
  if(input.refundChangePct>0)note.push('Refund lebih tinggi meningkatkan drag operasional; prioritaskan quality control order.')
  if(scenarioProfit<0)note.push('Skenario menghasilkan profit bersih negatif.')
  if(!note.length)note.push('Skenario masih berada di rentang operasional normal.')
  return {baselineRevenue,baselineProfit,scenarioRevenue,scenarioProfit,deltaProfit:scenarioProfit-baselineProfit,scenarioMargin,baselineMargin,note}
}

export type ReorderBatchRow={supplier:string;items:{productId:string;productName:string;game:string;qty:number;unitCost:number;cost:number;urgency:string}[];totalQty:number;totalCost:number;critical:number}
export function reorderBatchPlanner(products:Product[],orders:Order[]):ReorderBatchRow[]{
  const suggestions=smartRestock(products,orders).filter(x=>x.recommendedRestock>0&&x.urgency!=='Aman')
  const map=new Map<string,ReorderBatchRow>()
  suggestions.forEach(x=>{
    const p=products.find(p=>p.id===x.productId);if(!p)return
    const supplier=p.supplier.trim()||'Supplier belum diisi'
    const row=map.get(supplier)||{supplier,items:[],totalQty:0,totalCost:0,critical:0}
    const cost=x.recommendedRestock*p.modal
    row.items.push({productId:p.id,productName:p.name,game:p.game,qty:x.recommendedRestock,unitCost:p.modal,cost,urgency:x.urgency})
    row.totalQty+=x.recommendedRestock;row.totalCost+=cost;if(x.urgency==='Kritis')row.critical++
    map.set(supplier,row)
  })
  return [...map.values()].sort((a,b)=>b.critical-a.critical||b.totalCost-a.totalCost)
}

export type ProtectionRow={productId:string;productName:string;game:string;channel:string;currentPrice:number;minimumPrice:number;targetPrice:number;currentMargin:number;protectedMargin:number;status:'Aman'|'Tipis'|'Rugi'}
export function profitProtection(products:Product[],rules:ChannelRule[],channel:string,bufferPct=5):ProtectionRow[]{
  const rule=rules.find(r=>r.active&&norm(r.name)===norm(channel))
  return products.filter(p=>p.active).map(p=>{
    const base={...p,fee:rule?.feePercent??p.fee,fixed:rule?.fixedFee??p.fixed}
    const current=calculateProduct(base)
    const minimumPrice=Math.ceil(current.bep*(1+Math.max(0,bufferPct)/100))
    const targetPrice=Math.ceil(Math.max(minimumPrice,current.targetPrice||0))
    const protectedCalc=calculateProduct({...base,price:targetPrice})
    const status:ProtectionRow['status']=current.profit<0?'Rugi':current.margin<bufferPct?'Tipis':'Aman'
    return {productId:p.id,productName:p.name,game:p.game,channel,currentPrice:p.price,minimumPrice,targetPrice,currentMargin:current.margin,protectedMargin:protectedCalc.margin,status}
  }).sort((a,b)=>({Rugi:0,Tipis:1,Aman:2}[a.status]-{Rugi:0,Tipis:1,Aman:2}[b.status]||a.currentMargin-b.currentMargin))
}

export type HandoverWorker={name:string;activeOrders:number;waitingOrders:number;oldestMinutes:number;completedToday:number;games:string[]}
export type ShiftHandover={pending:number;waiting:number;overSla:number;unassigned:number;openDisputes:number;workers:HandoverWorker[];notes:string[]}
export function shiftHandover(workers:Worker[],orders:Order[],disputes:Dispute[],slaMinutes=10):ShiftHandover{
  const pendingRows=orders.filter(o=>['Baru','Diproses','Menunggu'].includes(o.status))
  const queue=workerQueue(workers,orders)
  const workerRows:HandoverWorker[]=queue.map(q=>{
    const ids=[q.worker.id,q.worker.cloudUserId].filter(Boolean)
    const mine=pendingRows.filter(o=>ids.includes(o.assignedWorkerId||'')||o.assignedWorker===q.worker.name)
    const oldest=mine.length?Math.max(...mine.map(o=>(Date.now()-new Date(o.createdAt).getTime())/60000)):0
    return {name:q.worker.name,activeOrders:mine.filter(o=>o.status!=='Menunggu').length,waitingOrders:mine.filter(o=>o.status==='Menunggu').length,oldestMinutes:oldest,completedToday:q.completedToday,games:q.eligibleGames}
  }).sort((a,b)=>b.activeOrders+b.waitingOrders-(a.activeOrders+a.waitingOrders))
  const waiting=pendingRows.filter(o=>o.status==='Menunggu').length
  const overSla=pendingRows.filter(o=>(Date.now()-new Date(o.createdAt).getTime())/60000>=slaMinutes).length
  const unassigned=pendingRows.filter(o=>!o.assignedWorker&&!o.assignedWorkerId).length
  const openDisputes=disputes.filter(d=>!['Selesai','Ditutup'].includes(d.status)).length
  const notes:string[]=[]
  if(unassigned)notes.push(`${unassigned} order belum punya Worker.`)
  if(overSla)notes.push(`${overSla} order melewati SLA ${slaMinutes} menit.`)
  if(waiting)notes.push(`${waiting} order berstatus Menunggu dan perlu konteks saat pergantian shift.`)
  if(openDisputes)notes.push(`${openDisputes} dispute masih terbuka.`)
  if(!notes.length)notes.push('Tidak ada isu handover kritis saat ini.')
  return {pending:pendingRows.length,waiting,overSla,unassigned,openDisputes,workers:workerRows,notes}
}
