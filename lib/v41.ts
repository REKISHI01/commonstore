import { calculateProduct, type Order, type Product, type Worker } from './itemku'

export type RestockIntelligence = {
  productId:string; productName:string; game:string; stock:number; avg7:number; avg14:number; avg30:number; weightedDaily:number;
  daysLeft:number|null; recommendedRestock:number; urgency:'Kritis'|'Segera'|'Pantau'|'Aman'; reorderPoint:number
}

export type PerformanceRow = {
  productId:string; productName:string; game:string; score:number; label:'Perbesar stok'|'Pertahankan'|'Pantau'|'Kurangi stok';
  sold30:number; revenue30:number; profit30:number; marginPct:number; refundRate:number; agingDays:number; daysLeft:number|null; reasons:string[]
}

export type WorkerQueueRow = {worker:Worker; activeOrders:number; completedToday:number; eligibleGames:string[]}

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n))
const sinceDays=(days:number)=>Date.now()-days*86400000
const doneFor=(orders:Order[],productId:string,days:number)=>orders.filter(o=>o.productId===productId&&o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=sinceDays(days))

export function smartRestock(products:Product[],orders:Order[],coverageDays=14,leadDays=3):RestockIntelligence[]{
  return products.filter(p=>p.active).map(p=>{
    const sold=(days:number)=>doneFor(orders,p.id,days).reduce((s,o)=>s+o.qty,0)
    const avg7=sold(7)/7,avg14=sold(14)/14,avg30=sold(30)/30
    const weightedDaily=avg7*.5+avg14*.3+avg30*.2
    const daysLeft=weightedDaily>0?p.stock/weightedDaily:null
    const target=Math.ceil(weightedDaily*(coverageDays+leadDays)*1.25)
    const recommendedRestock=Math.max(0,target-p.stock)
    const urgency:RestockIntelligence['urgency']=p.stock<=0?'Kritis':daysLeft!==null&&daysLeft<=2?'Kritis':daysLeft!==null&&daysLeft<=leadDays+2?'Segera':p.stock<=p.reorderPoint||recommendedRestock>0?'Pantau':'Aman'
    return {productId:p.id,productName:p.name,game:p.game,stock:p.stock,avg7,avg14,avg30,weightedDaily,daysLeft,recommendedRestock,urgency,reorderPoint:p.reorderPoint}
  }).sort((a,b)=>{const rank={Kritis:0,Segera:1,Pantau:2,Aman:3};return rank[a.urgency]-rank[b.urgency]||(a.daysLeft??9999)-(b.daysLeft??9999)})
}

export function productPerformance(products:Product[],orders:Order[]):PerformanceRow[]{
  const base=products.map(p=>{
    const done=doneFor(orders,p.id,30)
    const sold30=done.reduce((s,o)=>s+o.qty,0)
    const revenue30=done.reduce((s,o)=>s+o.snapshot.revenue,0)
    const profit30=done.reduce((s,o)=>s+o.snapshot.profit,0)
    const allRecent=orders.filter(o=>o.productId===p.id&&new Date(o.createdAt).getTime()>=sinceDays(30))
    const refunds=allRecent.filter(o=>o.status==='Refund'||o.status==='Cancel').length
    const refundRate=allRecent.length?refunds/allRecent.length:0
    const marginPct=revenue30?profit30/revenue30*100:calculateProduct(p).margin
    const agingDays=Math.max(0,(Date.now()-new Date(p.stockSince).getTime())/86400000)
    return {p,sold30,revenue30,profit30,refundRate,marginPct,agingDays}
  })
  const maxSold=Math.max(1,...base.map(x=>x.sold30))
  return base.map(({p,sold30,revenue30,profit30,refundRate,marginPct,agingDays})=>{
    const avgDaily=sold30/30,daysLeft=avgDaily>0?p.stock/avgDaily:null
    const salesScore=35*clamp(sold30/maxSold,0,1)
    const marginScore=30*clamp(marginPct/30,0,1)
    const qualityScore=20*(1-clamp(refundRate,0,1))
    let inventoryScore=15
    if(p.stock===0&&sold30>0)inventoryScore=10
    else if(sold30===0&&p.stock>0)inventoryScore=agingDays>30?1:agingDays>14?5:9
    else if(daysLeft!==null&&daysLeft>30)inventoryScore=6
    else if(daysLeft!==null&&daysLeft<1)inventoryScore=11
    const score=Math.round(clamp(salesScore+marginScore+qualityScore+inventoryScore))
    const label:PerformanceRow['label']=score>=80?'Perbesar stok':score>=60?'Pertahankan':score>=40?'Pantau':'Kurangi stok'
    const reasons:string[]=[]
    if(sold30>=maxSold*.7&&sold30>0)reasons.push('Penjualan kuat')
    if(marginPct>=20)reasons.push('Margin sehat')
    if(marginPct<5)reasons.push('Margin rendah')
    if(refundRate>=.15)reasons.push('Refund tinggi')
    if(agingDays>=21&&p.stock>0)reasons.push('Stok menua')
    if(daysLeft!==null&&daysLeft<=3)reasons.push('Stok hampir habis')
    if(!reasons.length)reasons.push('Performa normal')
    return {productId:p.id,productName:p.name,game:p.game,score,label,sold30,revenue30,profit30,marginPct,refundRate,agingDays,daysLeft,reasons}
  }).sort((a,b)=>b.score-a.score)
}

export function priceSafety(product:Pick<Product,'modal'|'price'|'fee'|'fixed'|'other'|'target'>,price=product.price,qty=1){
  const calc=calculateProduct({...product,price},qty,price)
  const minimumNoLoss=calc.bep
  const targetSafe=calc.targetPrice
  return {calc,minimumNoLoss,targetSafe,danger:price<minimumNoLoss,belowTarget:!Number.isNaN(targetSafe)&&targetSafe>0&&price<targetSafe}
}

export function workerQueue(workers:Worker[],orders:Order[]):WorkerQueueRow[]{
  const today=new Date();today.setHours(0,0,0,0)
  return workers.filter(w=>w.enabled!==false&&w.permissions.canProcessOrders).map(worker=>{
    const ids=[worker.id,worker.cloudUserId].filter(Boolean)
    const assigned=(o:Order)=>ids.includes(o.assignedWorkerId||'')||o.assignedWorker===worker.name
    const activeOrders=orders.filter(o=>assigned(o)&&(o.status==='Baru'||o.status==='Diproses')).length
    const completedToday=orders.filter(o=>assigned(o)&&o.status==='Selesai'&&new Date(o.completedAt||o.createdAt)>=today).length
    return {worker,activeOrders,completedToday,eligibleGames:worker.permissions.allowedGames}
  }).sort((a,b)=>a.activeOrders-b.activeOrders||a.completedToday-b.completedToday||a.worker.name.localeCompare(b.worker.name))
}

export function chooseWorkerForOrder(workers:Worker[],orders:Order[],order:Order){
  const queue=workerQueue(workers,orders).filter(x=>!x.eligibleGames.length||x.eligibleGames.includes(order.game))
  return queue[0]?.worker||null
}

export function reportSummary(orders:Order[],expenses:{amount:number;date?:string;createdAt?:string}[],start:Date,end:Date){
  const inRange=(v:string)=>{const t=new Date(v).getTime();return t>=start.getTime()&&t<=end.getTime()}
  const rows=orders.filter(o=>inRange(o.completedAt||o.createdAt))
  const done=rows.filter(o=>o.status==='Selesai')
  const refunds=rows.filter(o=>o.status==='Refund'||o.status==='Cancel')
  const revenue=done.reduce((s,o)=>s+o.snapshot.revenue,0)
  const grossProfit=done.reduce((s,o)=>s+o.snapshot.profit,0)
  const expenseTotal=expenses.filter(e=>inRange(e.date||e.createdAt||'')).reduce((s,e)=>s+e.amount,0)
  const netProfit=grossProfit-expenseTotal
  const byGame=new Map<string,{orders:number,revenue:number,profit:number}>()
  done.forEach(o=>{const x=byGame.get(o.game)||{orders:0,revenue:0,profit:0};x.orders++;x.revenue+=o.snapshot.revenue;x.profit+=o.snapshot.profit;byGame.set(o.game,x)})
  const topGames=[...byGame.entries()].map(([game,x])=>({game,...x})).sort((a,b)=>b.profit-a.profit)
  return {rows,done,refunds,revenue,grossProfit,expenseTotal,netProfit,avgOrder:done.length?revenue/done.length:0,topGames}
}
