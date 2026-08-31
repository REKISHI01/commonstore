import { calculateProduct, type Expense, type Order, type Product, type Restock } from './itemku'
import { type ChannelRule, type Dispute, type Settlement, type Supplier } from './v4'
import { productPerformance, smartRestock } from './v41'
import { salesTrendRadar } from './v42'

const DAY=86_400_000
const since=(days:number)=>Date.now()-days*DAY
const done=(orders:Order[],days:number)=>orders.filter(o=>o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=since(days))
const pct=(part:number,total:number)=>total?part/total*100:0
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n))
const norm=(s?:string)=>String(s||'').trim().toLowerCase()

export type ExecutiveBrief={
  revenue7:number;profit7:number;orders7:number;revenuePrev7:number;profitPrev7:number;growthRevenue:number|null;growthProfit:number|null;
  refundRate30:number;capitalLocked:number;settlementGap:number;openDisputes:number;actions:{level:'danger'|'warn'|'info';title:string;detail:string;target:string}[]
}

export function executiveBrief(products:Product[],orders:Order[],settlements:Settlement[],disputes:Dispute[]):ExecutiveBrief{
  const now=Date.now(), d7=now-7*DAY,d14=now-14*DAY
  const current=orders.filter(o=>o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=d7)
  const previous=orders.filter(o=>o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=d14&&new Date(o.completedAt||o.createdAt).getTime()<d7)
  const sum=(rows:Order[],key:'revenue'|'profit')=>rows.reduce((s,o)=>s+o.snapshot[key],0)
  const revenue7=sum(current,'revenue'),profit7=sum(current,'profit'),revenuePrev7=sum(previous,'revenue'),profitPrev7=sum(previous,'profit')
  const growth=(a:number,b:number)=>b?((a-b)/b*100):(a>0?null:0)
  const recent30=orders.filter(o=>new Date(o.createdAt).getTime()>=since(30));const refunds=recent30.filter(o=>o.status==='Refund'||o.status==='Cancel').length
  const capitalLocked=products.filter(p=>p.active&&p.stock>0).reduce((s,p)=>s+p.stock*p.modal,0)
  const settlementGap=settlements.reduce((s,x)=>s+Math.max(0,x.expectedAmount-x.actualAmount),0)
  const openDisputes=disputes.filter(d=>!['Selesai','Ditutup'].includes(d.status)).length
  const perf=productPerformance(products,orders);const restock=smartRestock(products,orders)
  const actions:ExecutiveBrief['actions']=[]
  const loss=perf.filter(x=>x.marginPct<0).length;if(loss)actions.push({level:'danger',title:`${loss} produk berpotensi rugi`,detail:'Harga/margin perlu dikoreksi sebelum menerima order baru.',target:'Profit Leak Detector'})
  const critical=restock.filter(x=>x.urgency==='Kritis').length;if(critical)actions.push({level:'danger',title:`${critical} produk kritis stok`,detail:'Produk aktif diperkirakan habis atau sudah kosong.',target:'Smart Restock'})
  if(settlementGap>0)actions.push({level:'warn',title:'Ada selisih pencairan',detail:`Expected payout yang belum tertutup masih ${Math.round(settlementGap).toLocaleString('id-ID')}.`,target:'Settlement & Rekonsiliasi'})
  if(openDisputes)actions.push({level:'warn',title:`${openDisputes} dispute terbuka`,detail:'Tindak lanjuti kasus pelanggan yang belum selesai.',target:'Dispute & SLA'})
  const dead=deadStockRecovery(products,orders).filter(x=>x.severity!=='Aman').length;if(dead)actions.push({level:'warn',title:`${dead} stok lambat/menumpuk`,detail:'Ada modal tertahan pada produk yang bergerak lambat.',target:'Dead Stock Recovery'})
  if(!actions.length)actions.push({level:'info',title:'Operasional sehat',detail:'Tidak ada risiko besar yang terdeteksi dari data saat ini.',target:'Ringkasan'})
  return {revenue7,profit7,orders7:current.length,revenuePrev7,profitPrev7,growthRevenue:growth(revenue7,revenuePrev7),growthProfit:growth(profit7,profitPrev7),refundRate30:pct(refunds,recent30.length),capitalLocked,settlementGap,openDisputes,actions:actions.slice(0,6)}
}

export type ProfitLeak={id:string;kind:'Margin'|'Refund'|'Aging'|'Settlement';severity:'Kritis'|'Perlu cek';title:string;detail:string;impact:number;target:string}
export function profitLeakDetector(products:Product[],orders:Order[],settlements:Settlement[]):ProfitLeak[]{
  const out:ProfitLeak[]=[]
  products.filter(p=>p.active).forEach(p=>{const c=calculateProduct(p);if(c.margin<5){const lost=Math.max(0,(Math.max(c.targetPrice,p.price)-p.price)*Math.max(1,p.stock));out.push({id:`m-${p.id}`,kind:'Margin',severity:c.profit<0?'Kritis':'Perlu cek',title:`${p.game} · ${p.name}`,detail:`Margin ${c.margin.toFixed(1)}% · BEP ${Math.ceil(c.bep).toLocaleString('id-ID')}`,impact:lost,target:'Price Advisor'})}})
  const byProduct=new Map<string,{name:string,count:number,refund:number,impact:number}>();orders.filter(o=>new Date(o.createdAt).getTime()>=since(30)).forEach(o=>{const x=byProduct.get(o.productId)||{name:o.productName,count:0,refund:0,impact:0};x.count++;if(o.status==='Refund'||o.status==='Cancel'){x.refund++;x.impact+=Math.max(0,o.snapshot.capital)}byProduct.set(o.productId,x)});byProduct.forEach((x,k)=>{if(x.count>=3&&x.refund/x.count>=.15)out.push({id:`r-${k}`,kind:'Refund',severity:x.refund/x.count>=.3?'Kritis':'Perlu cek',title:x.name,detail:`Refund ${x.refund}/${x.count} order (${(x.refund/x.count*100).toFixed(1)}%)`,impact:x.impact,target:'Customer Intelligence'})})
  deadStockRecovery(products,orders).filter(x=>x.severity!=='Aman').forEach(x=>out.push({id:`a-${x.productId}`,kind:'Aging',severity:x.severity==='Kritis'?'Kritis':'Perlu cek',title:x.productName,detail:`Stok ${x.stock} · umur ${Math.floor(x.ageDays)} hari · ${x.sold30} unit terjual/30h`,impact:x.capitalLocked,target:'Dead Stock Recovery'}))
  settlements.forEach(s=>{const gap=Math.max(0,s.expectedAmount-s.actualAmount);if(gap>0)out.push({id:`s-${s.id}`,kind:'Settlement',severity:gap>Math.max(100000,s.expectedAmount*.1)?'Kritis':'Perlu cek',title:`Settlement ${s.channel}`,detail:`Selisih expected vs actual payout`,impact:gap,target:'Settlement & Rekonsiliasi'})})
  return out.sort((a,b)=>(a.severity===b.severity?b.impact-a.impact:a.severity==='Kritis'?-1:1))
}

export type AgingRow={productId:string;productName:string;game:string;stock:number;ageDays:number;capitalLocked:number;sold30:number;turnover:number;bucket:'0–7 hari'|'8–14 hari'|'15–30 hari'|'>30 hari'}
export function inventoryAging(products:Product[],orders:Order[]):AgingRow[]{
  const sold30=new Map<string,number>();done(orders,30).forEach(o=>sold30.set(o.productId,(sold30.get(o.productId)||0)+o.qty))
  return products.filter(p=>p.active&&p.stock>0).map(p=>{const ageDays=Math.max(0,(Date.now()-new Date(p.stockSince).getTime())/DAY),sold=sold30.get(p.id)||0;const bucket:AgingRow['bucket']=ageDays<=7?'0–7 hari':ageDays<=14?'8–14 hari':ageDays<=30?'15–30 hari':'>30 hari';return {productId:p.id,productName:p.name,game:p.game,stock:p.stock,ageDays,capitalLocked:p.stock*p.modal,sold30:sold,turnover:p.stock+sold?sold/(p.stock+sold)*100:0,bucket}}).sort((a,b)=>b.ageDays-a.ageDays||b.capitalLocked-a.capitalLocked)
}

export type SupplierScore={supplier:string;score:number;label:'Unggul'|'Baik'|'Pantau'|'Risiko';restockCount:number;spend:number;avgUnitCost:number;orders30:number;profit30:number;refundRate:number;products:number}
export function supplierScorecard(suppliers:Supplier[],restocks:Restock[],products:Product[],orders:Order[]):SupplierScore[]{
  const names=new Set<string>([...suppliers.map(s=>s.name),...restocks.map(r=>r.supplier),...products.map(p=>p.supplier),...orders.map(o=>o.supplierSnapshot||'')].filter(Boolean))
  return [...names].map(name=>{const rr=restocks.filter(r=>norm(r.supplier)===norm(name)), oo=orders.filter(o=>norm(o.supplierSnapshot)===norm(name)&&new Date(o.createdAt).getTime()>=since(30)), completed=oo.filter(o=>o.status==='Selesai'),refunds=oo.filter(o=>o.status==='Refund'||o.status==='Cancel').length,spend=rr.reduce((s,r)=>s+r.totalCost,0),qty=rr.reduce((s,r)=>s+r.qty,0),profit30=completed.reduce((s,o)=>s+o.snapshot.profit,0),refundRate=pct(refunds,oo.length),productCount=products.filter(p=>norm(p.supplier)===norm(name)).length;const margin=completed.reduce((s,o)=>s+o.snapshot.revenue,0)?profit30/completed.reduce((s,o)=>s+o.snapshot.revenue,0)*100:0;const score=Math.round(clamp(35*clamp(margin/25,0,1)+25*(1-clamp(refundRate/30,0,1))+20*clamp(completed.length/20,0,1)+10*clamp(productCount/5,0,1)+10*(rr.length?1:.5)));const label:SupplierScore['label']=score>=80?'Unggul':score>=60?'Baik':score>=40?'Pantau':'Risiko';return {supplier:name,score,label,restockCount:rr.length,spend,avgUnitCost:qty?spend/qty:0,orders30:completed.length,profit30,refundRate,products:productCount}}).sort((a,b)=>b.score-a.score)
}

export type FeeStressRow={productId:string;productName:string;game:string;currentMargin:number;stressMargin:number;profitPerUnit:number;status:'Aman'|'Tipis'|'Rugi'}
export function feeStressTest(products:Product[],rules:ChannelRule[],channel:string,extraFee:number):FeeStressRow[]{
  const rule=rules.find(r=>r.active&&norm(r.name)===norm(channel));return products.filter(p=>p.active).map(p=>{const base={...p,fee:rule?.feePercent??p.fee,fixed:rule?.fixedFee??p.fixed};const current=calculateProduct(base),stress=calculateProduct({...base,fee:Math.min(99,base.fee+Math.max(0,extraFee))});const status:FeeStressRow['status']=stress.profit<0?'Rugi':stress.margin<5?'Tipis':'Aman';return {productId:p.id,productName:p.name,game:p.game,currentMargin:current.margin,stressMargin:stress.margin,profitPerUnit:stress.profit,status}}).sort((a,b)=>({Rugi:0,Tipis:1,Aman:2}[a.status]-{Rugi:0,Tipis:1,Aman:2}[b.status]||a.stressMargin-b.stressMargin))
}

export type DeadStockRow={productId:string;productName:string;game:string;stock:number;ageDays:number;sold30:number;capitalLocked:number;bep:number;currentPrice:number;recommendedPrice:number;severity:'Kritis'|'Lambat'|'Pantau'|'Aman'}
export function deadStockRecovery(products:Product[],orders:Order[]):DeadStockRow[]{
  const sales=new Map<string,number>();done(orders,30).forEach(o=>sales.set(o.productId,(sales.get(o.productId)||0)+o.qty))
  return products.filter(p=>p.active&&p.stock>0).map(p=>{const ageDays=Math.max(0,(Date.now()-new Date(p.stockSince).getTime())/DAY),sold30=sales.get(p.id)||0,c=calculateProduct(p),factor=ageDays>30?.85:ageDays>21?.9:ageDays>14?.94:.98,recommendedPrice=Math.min(p.price,Math.max(Math.ceil(c.bep*1.03/100)*100,Math.ceil(p.price*factor/100)*100));const severity:DeadStockRow['severity']=ageDays>30&&sold30===0?'Kritis':ageDays>21&&sold30<=1?'Lambat':ageDays>14&&sold30<3?'Pantau':'Aman';return {productId:p.id,productName:p.name,game:p.game,stock:p.stock,ageDays,sold30,capitalLocked:p.stock*p.modal,bep:c.bep,currentPrice:p.price,recommendedPrice,severity}}).sort((a,b)=>({Kritis:0,Lambat:1,Pantau:2,Aman:3}[a.severity]-{Kritis:0,Lambat:1,Pantau:2,Aman:3}[b.severity]||b.capitalLocked-a.capitalLocked))
}

export type Anomaly={id:string;level:'danger'|'warn'|'info';type:string;title:string;detail:string;target:string}
export function anomalyMonitor(products:Product[],orders:Order[],expenses:Expense[]):Anomaly[]{
  const out:Anomaly[]=[];const trend=salesTrendRadar(products,orders)
  trend.filter(x=>x.label==='Turun'&&x.prev7>=3&&x.growth!==null&&x.growth<=-50).forEach(x=>out.push({id:`drop-${x.productId}`,level:'warn',type:'Penjualan',title:`Penjualan ${x.productName} turun tajam`,detail:`7 hari: ${x.last7} unit vs ${x.prev7} unit sebelumnya (${x.growth!.toFixed(0)}%).`,target:'Sales Trend Radar'}))
  const recent=orders.filter(o=>new Date(o.createdAt).getTime()>=since(7));const refundRate=pct(recent.filter(o=>o.status==='Refund'||o.status==='Cancel').length,recent.length);if(recent.length>=5&&refundRate>=15)out.push({id:'refund-spike',level:refundRate>=30?'danger':'warn',type:'Refund',title:'Refund 7 hari tinggi',detail:`Refund/Cancel ${refundRate.toFixed(1)}% dari ${recent.length} order.`,target:'Customer Intelligence'})
  const e7=expenses.filter(e=>new Date(e.date).getTime()>=since(7)).reduce((s,e)=>s+e.amount,0),ePrev=expenses.filter(e=>{const t=new Date(e.date).getTime();return t>=since(14)&&t<since(7)}).reduce((s,e)=>s+e.amount,0);if(ePrev>0&&e7>ePrev*1.5)out.push({id:'expense-spike',level:'warn',type:'Pengeluaran',title:'Pengeluaran melonjak',detail:`7 hari terakhir naik ${((e7-ePrev)/ePrev*100).toFixed(0)}% dibanding periode sebelumnya.`,target:'Cash Flow'})
  products.filter(p=>p.active&&calculateProduct(p).profit<0).forEach(p=>out.push({id:`loss-${p.id}`,level:'danger',type:'Margin',title:`${p.name} berpotensi rugi`,detail:'Harga master berada di bawah total biaya per unit.',target:'Price Advisor'}))
  if(!out.length)out.push({id:'clear',level:'info',type:'Sistem',title:'Tidak ada anomali besar',detail:'Perubahan penjualan, refund, pengeluaran, dan margin masih dalam batas normal.',target:'Ringkasan'})
  return out
}

export type OpportunityMatrixRow={productId:string;productName:string;game:string;performance:number;trend:'Naik'|'Turun'|'Stabil'|'Baru';urgency:string;recommendedRestock:number;quadrant:'Scale Up'|'Jaga'|'Perbaiki Margin'|'Kurangi';reason:string}
export function opportunityMatrix(products:Product[],orders:Order[]):OpportunityMatrixRow[]{
  const perf=new Map(productPerformance(products,orders).map(x=>[x.productId,x]));const trend=new Map(salesTrendRadar(products,orders).map(x=>[x.productId,x]));const restock=new Map(smartRestock(products,orders).map(x=>[x.productId,x]));
  return products.filter(p=>p.active).map(p=>{const a=perf.get(p.id),t=trend.get(p.id),r=restock.get(p.id);const margin=a?.marginPct??calculateProduct(p).margin;let quadrant:OpportunityMatrixRow['quadrant']='Jaga',reason='Performa relatif stabil';if((a?.score||0)>=70&&(t?.label==='Naik'||t?.label==='Baru')&&margin>=10){quadrant='Scale Up';reason='Score kuat, tren positif, dan margin sehat'}else if(margin<5){quadrant='Perbaiki Margin';reason='Margin terlalu tipis untuk scaling'}else if((a?.score||0)<40||t?.label==='Turun'){quadrant='Kurangi';reason='Score/tren menunjukkan produk perlu dievaluasi'}return {productId:p.id,productName:p.name,game:p.game,performance:a?.score||0,trend:t?.label||'Stabil',urgency:r?.urgency||'Aman',recommendedRestock:r?.recommendedRestock||0,quadrant,reason}}).sort((a,b)=>({"Scale Up":0,"Jaga":1,"Perbaiki Margin":2,"Kurangi":3}[a.quadrant]-{"Scale Up":0,"Jaga":1,"Perbaiki Margin":2,"Kurangi":3}[b.quadrant]||b.performance-a.performance))
}
