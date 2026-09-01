import { calculateProduct, id, type Expense, type Order, type PriceHistory, type Product } from './itemku'
import type { ChannelRule, Dispute, InventoryLedger, PurchaseOrder, Settlement } from './v4'

export type PriceSuggestion={margin:number;raw:number;rounded:number;profit:number;roi:number}
export type TrendRow={productId:string;productName:string;game:string;last7:number;prev7:number;growth:number|null;profit7:number;label:'Naik'|'Turun'|'Stabil'|'Baru'}
export type CustomerIntel={buyer:string;orders:number;spend:number;profit:number;refunds:number;refundRate:number;lastAt:string;aov:number;loyaltyScore:number;loyalty:'VIP'|'Loyal'|'Regular'|'Baru';riskScore:number;risk:'Tinggi'|'Sedang'|'Rendah';openDisputes:number}
export type QualityIssue={id:string;level:'danger'|'warn'|'info';kind:string;title:string;detail:string;fixable:boolean;entityId?:string}
export type OpsAction={id:string;priority:1|2|3;title:string;detail:string;target:string}

const DAY=86400000
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n))
const ceilTo=(n:number,step=500)=>Math.ceil(Math.max(0,n)/step)*step
const normalize=(s:string)=>String(s||'').trim().toLowerCase()

export function priceAdvisor(product:Product,channelRules:ChannelRule[],channel:string,margins=[5,10,15,20,25,30]):PriceSuggestion[]{
  const rule=channelRules.find(r=>r.active&&normalize(r.name)===normalize(channel))
  const fee=rule?.feePercent??product.fee
  const fixed=rule?.fixedFee??product.fixed
  const base=Math.max(0,product.modal)+Math.max(0,product.other)+Math.max(0,fixed)
  return margins.map(margin=>{
    const denominator=1-fee/100-margin/100
    const raw=denominator>0?base/denominator:0
    const rounded=ceilTo(raw,raw<10_000?500:1_000)
    const calc=calculateProduct({...product,fee,fixed,price:rounded,target:margin})
    return {margin,raw,rounded,profit:calc.profit,roi:calc.roi}
  })
}

export function salesTrendRadar(products:Product[],orders:Order[]):TrendRow[]{
  const now=Date.now(),a=now-7*DAY,b=now-14*DAY
  return products.filter(p=>p.active).map(p=>{
    const recent=orders.filter(o=>o.productId===p.id&&o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=a)
    const prior=orders.filter(o=>o.productId===p.id&&o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=b&&new Date(o.completedAt||o.createdAt).getTime()<a)
    const last7=recent.reduce((s,o)=>s+o.qty,0),prev7=prior.reduce((s,o)=>s+o.qty,0)
    const growth=prev7>0?(last7-prev7)/prev7*100:last7>0?null:0
    const label:TrendRow['label']=prev7===0&&last7>0?'Baru':growth===null?'Baru':growth>=20?'Naik':growth<=-20?'Turun':'Stabil'
    return {productId:p.id,productName:p.name,game:p.game,last7,prev7,growth,profit7:recent.reduce((s,o)=>s+o.snapshot.profit,0),label}
  }).sort((x,y)=>{const r={Naik:0,Baru:1,Stabil:2,Turun:3};return r[x.label]-r[y.label]||y.last7-x.last7})
}

export function customerIntelligence(orders:Order[],disputes:Dispute[]):CustomerIntel[]{
  const map=new Map<string,{buyer:string;orders:number;spend:number;profit:number;refunds:number;lastAt:string}>()
  orders.forEach(o=>{const key=normalize(o.buyerIdentifier);if(!key)return;const x=map.get(key)||{buyer:o.buyerIdentifier,orders:0,spend:0,profit:0,refunds:0,lastAt:o.createdAt};if(o.status==='Selesai'){x.orders++;x.spend+=o.snapshot.revenue;x.profit+=o.snapshot.profit}if(o.status==='Refund'||o.status==='Cancel')x.refunds++;if(new Date(o.createdAt)>new Date(x.lastAt))x.lastAt=o.createdAt;map.set(key,x)})
  return [...map.values()].map(x=>{
    const refundRate=(x.orders+x.refunds)?x.refunds/(x.orders+x.refunds):0
    const recencyDays=(Date.now()-new Date(x.lastAt).getTime())/DAY
    const loyaltyScore=Math.round(clamp(Math.min(40,x.orders*6)+Math.min(30,x.spend/1_000_000*30)+(recencyDays<=30?20:recencyDays<=90?10:3)+Math.max(0,10-refundRate*30)))
    const loyalty:CustomerIntel['loyalty']=loyaltyScore>=75?'VIP':loyaltyScore>=50?'Loyal':loyaltyScore>=25?'Regular':'Baru'
    const openDisputes=disputes.filter(d=>normalize(d.buyerIdentifier)===normalize(x.buyer)&&!['Selesai','Ditutup'].includes(d.status)).length
    const riskScore=Math.round(clamp(refundRate*70+Math.min(30,openDisputes*15)))
    const risk:CustomerIntel['risk']=riskScore>=60?'Tinggi':riskScore>=25?'Sedang':'Rendah'
    return {...x,refundRate,aov:x.orders?x.spend/x.orders:0,loyaltyScore,loyalty,riskScore,risk,openDisputes}
  }).sort((a,b)=>b.loyaltyScore-a.loyaltyScore||a.riskScore-b.riskScore)
}

export function dataQuality(products:Product[],orders:Order[],ledger:InventoryLedger[]):QualityIssue[]{
  const out:QualityIssue[]=[]
  const skuMap=new Map<string,Product[]>()
  products.forEach(p=>{const k=normalize(p.sku);if(!k)out.push({id:`sku_blank:${p.id}`,level:'warn',kind:'sku_blank',title:'SKU kosong',detail:`${p.game} · ${p.name} belum memiliki SKU.`,fixable:true,entityId:p.id});else skuMap.set(k,[...(skuMap.get(k)||[]),p]);if(p.price<0||p.modal<0||p.stock<0)out.push({id:`negative:${p.id}`,level:'danger',kind:'negative',title:'Nilai produk tidak valid',detail:`${p.name} memiliki angka negatif.`,fixable:true,entityId:p.id})})
  skuMap.forEach(rows=>{if(rows.length>1)rows.slice(1).forEach(p=>out.push({id:`sku_dup:${p.id}`,level:'danger',kind:'sku_duplicate',title:'SKU duplikat',detail:`SKU ${p.sku} dipakai lebih dari satu produk.`,fixable:true,entityId:p.id}))})
  const inv=new Map<string,Order[]>()
  orders.forEach(o=>{const k=normalize(o.invoiceNo);if(!k)out.push({id:`invoice_blank:${o.id}`,level:'danger',kind:'invoice_blank',title:'Invoice kosong',detail:`Order ${o.productName} tidak punya nomor invoice.`,fixable:true,entityId:o.id});else inv.set(k,[...(inv.get(k)||[]),o]);if(o.productId&&!products.some(p=>p.id===o.productId))out.push({id:`orphan:${o.id}`,level:'info',kind:'orphan_order',title:'Produk historis sudah tidak ada',detail:`${o.invoiceNo} tetap dipertahankan via snapshot transaksi.`,fixable:false,entityId:o.id})})
  inv.forEach(rows=>{if(rows.length>1)rows.slice(1).forEach(o=>out.push({id:`invoice_dup:${o.id}`,level:'danger',kind:'invoice_duplicate',title:'Invoice duplikat',detail:`${o.invoiceNo} muncul lebih dari sekali.`,fixable:true,entityId:o.id}))})
  products.forEach(p=>{const rows=ledger.filter(x=>x.productId===p.id).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());if(rows.length&&Number.isFinite(rows[0].stockAfter)&&rows[0].stockAfter!==p.stock)out.push({id:`ledger:${p.id}`,level:'warn',kind:'ledger_mismatch',title:'Stok master ≠ ledger terakhir',detail:`${p.name}: master ${p.stock}, ledger ${rows[0].stockAfter}. Periksa sebelum koreksi.`,fixable:false,entityId:p.id})})
  return out.sort((a,b)=>({danger:0,warn:1,info:2}[a.level]-{danger:0,warn:1,info:2}[b.level]))
}

export function repairSafeData(products:Product[],orders:Order[]){
  const used=new Set<string>()
  const nextProducts=products.map((p,index)=>{
    const original=(p.sku||'').trim();let candidate=original
    if(!candidate)candidate=`${(p.game||'GAME').slice(0,4).toUpperCase().replace(/[^A-Z0-9]/g,'')||'GAME'}-${String(index+1).padStart(3,'0')}`
    const base=candidate;let n=2;while(used.has(normalize(candidate))){candidate=`${base}-${n++}`}used.add(normalize(candidate))
    const stock=Math.max(0,Number(p.stock)||0),modal=Math.max(0,Number(p.modal)||0),price=Math.max(0,Number(p.price)||0)
    const changed=candidate!==p.sku||stock!==p.stock||modal!==p.modal||price!==p.price
    return changed?{...p,sku:candidate,stock,modal,price,updatedAt:new Date().toISOString()}:p
  })
  const usedInv=new Set<string>();const counters=new Map<string,number>();const nextOrders:Order[]=[]
  for(const o of orders){
    const d=new Date(o.createdAt),prefix=`INV-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-`
    const original=(o.invoiceNo||'').trim();let invoice=original
    const existingNo=invoice.startsWith(prefix)?Number(invoice.slice(prefix.length))||0:0
    counters.set(prefix,Math.max(counters.get(prefix)||0,existingNo))
    if(!invoice||usedInv.has(normalize(invoice))){let n=(counters.get(prefix)||0)+1;do{invoice=`${prefix}${String(n).padStart(4,'0')}`;n++}while(usedInv.has(normalize(invoice)));counters.set(prefix,n-1)}
    usedInv.add(normalize(invoice));nextOrders.push(invoice!==o.invoiceNo?{...o,invoiceNo:invoice,updatedAt:new Date().toISOString()}:o)
  }
  return {products:nextProducts,orders:nextOrders}
}

export function dailyOperations(products:Product[],orders:Order[],purchaseOrders:PurchaseOrder[],settlements:Settlement[],disputes:Dispute[],channelRules:ChannelRule[]):OpsAction[]{
  const out:OpsAction[]=[];const now=Date.now()
  const pending=orders.filter(o=>['Baru','Diproses','Menunggu'].includes(o.status));if(pending.length)out.push({id:'orders',priority:1,title:`${pending.length} order aktif`,detail:`${pending.filter(o=>(now-new Date(o.createdAt).getTime())/60000>15).length} order sudah >15 menit.`,target:'Order Kanban'})
  const critical=products.filter(p=>p.active&&p.stock<=p.reorderPoint);if(critical.length)out.push({id:'stock',priority:1,title:`${critical.length} produk perlu restock`,detail:critical.slice(0,3).map(p=>`${p.name} (${p.stock})`).join(', '),target:'Smart Restock'})
  const lowMargin=products.filter(p=>{const rule=channelRules.find(r=>r.active&&normalize(r.name)==='itemku');const c=calculateProduct({...p,fee:rule?.feePercent??p.fee,fixed:rule?.fixedFee??p.fixed});return c.margin<5});if(lowMargin.length)out.push({id:'margin',priority:2,title:`${lowMargin.length} produk margin <5%`,detail:'Periksa harga jual sebelum menerima banyak order.',target:'Price Advisor'})
  const openDisputes=disputes.filter(d=>!['Selesai','Ditutup'].includes(d.status));if(openDisputes.length)out.push({id:'dispute',priority:1,title:`${openDisputes.length} dispute terbuka`,detail:'Pastikan tidak ada kasus pelanggan yang terlewat.',target:'Dispute & SLA'})
  const po=purchaseOrders.filter(p=>!['Diterima','Batal'].includes(p.status));if(po.length)out.push({id:'po',priority:2,title:`${po.length} Purchase Order belum selesai`,detail:'Cek status stok yang sedang dipesan.',target:'Purchase Order'})
  const payout=settlements.filter(s=>s.status!=='Sudah Cair');if(payout.length)out.push({id:'settlement',priority:2,title:`${payout.length} settlement belum selesai`,detail:'Rekonsiliasi expected vs actual payout.',target:'Settlement & Rekonsiliasi'})
  if(!out.length)out.push({id:'clear',priority:3,title:'Operasional terkendali',detail:'Tidak ada tindakan mendesak yang terdeteksi.',target:'Ringkasan'})
  return out.sort((a,b)=>a.priority-b.priority)
}

export function calendarSummary(date:Date,orders:Order[],expenses:Expense[],purchaseOrders:PurchaseOrder[],settlements:Settlement[],disputes:Dispute[]){
  const localKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const key=localKey(date)
  const same=(v?:string)=>{if(!v)return false;if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v===key;const d=new Date(v);return !Number.isNaN(d.getTime())&&localKey(d)===key}
  const done=orders.filter(o=>o.status==='Selesai'&&same(o.completedAt||o.createdAt))
  return {orders:done.length,revenue:done.reduce((s,o)=>s+o.snapshot.revenue,0),profit:done.reduce((s,o)=>s+o.snapshot.profit,0),expenses:expenses.filter(e=>same(e.date)).reduce((s,e)=>s+e.amount,0),po:purchaseOrders.filter(p=>same(p.orderedAt)||same(p.receivedAt)).length,settlements:settlements.filter(s=>same(s.paidAt)).length,disputes:disputes.filter(d=>same(d.createdAt)).length}
}

export function duplicateProduct(products:Product[],source:Product){
  const base=(source.sku||source.name||'COPY').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'')||'COPY';let sku=`${base}-COPY`,n=2;while(products.some(p=>normalize(p.sku)===normalize(sku)))sku=`${base}-COPY-${n++}`
  const now=new Date().toISOString();return {...source,id:id('product'),name:`${source.name} Copy`,sku,stock:0,stockSince:now,discountEnabled:false,discountPrice:0,active:true,updatedAt:now}
}
