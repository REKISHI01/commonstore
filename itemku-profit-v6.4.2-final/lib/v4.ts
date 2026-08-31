import { id, money, type Order, type Product } from './itemku'

export type SyncState = 'synced'|'pending'|'error'|'offline'
export type ChannelRule = { id:string; name:string; feePercent:number; fixedFee:number; active:boolean; note:string; updatedAt:string }
export type Supplier = { id:string; name:string; contact:string; note:string; active:boolean; createdAt:string; updatedAt:string }
export type PurchaseOrderStatus = 'Draft'|'Dipesan'|'Dibayar'|'Diterima'|'Batal'
export type PurchaseOrder = { id:string; poNo:string; supplierId:string; supplierName:string; productId:string; productName:string; qty:number; unitCost:number; totalCost:number; status:PurchaseOrderStatus; orderedAt:string; receivedAt?:string; note:string; createdAt:string; updatedAt:string }
export type LedgerReason = 'Restock'|'Order'|'Refund'|'Adjustment'|'Opening'|'PO'
export type InventoryLedger = { id:string; productId:string; productName:string; delta:number; stockBefore:number; stockAfter:number; reason:LedgerReason; referenceId?:string; note:string; createdAt:string; actor:string }
export type SettlementStatus = 'Belum Cair'|'Sebagian'|'Sudah Cair'
export type Settlement = { id:string; channel:string; periodStart:string; periodEnd:string; expectedAmount:number; actualAmount:number; status:SettlementStatus; paidAt?:string; note:string; createdAt:string; updatedAt:string }
export type DisputeStatus = 'Terbuka'|'Menunggu Pembeli'|'Menunggu Seller'|'Selesai'|'Ditutup'
export type Dispute = { id:string; orderId:string; invoiceNo:string; buyerIdentifier:string; reason:string; chronology:string; status:DisputeStatus; assignedWorker?:string; createdAt:string; updatedAt:string; resolvedAt?:string }
export type AutomationRuleKind = 'low_stock'|'aging_stock'|'slow_order'|'low_margin'|'hot_product'
export type AutomationRule = { id:string; kind:AutomationRuleKind; enabled:boolean; threshold:number; label:string; createdAt:string; updatedAt:string }
export type NotificationItem = { id:string; kind:string; level:'info'|'warn'|'danger'|'success'; title:string; detail:string; entityType?:string; entityId?:string; read:boolean; createdAt:string }
export type DashboardPreferences = { id:string; visibleCards:string[]; slaMinutes:number; forecastDays:number }
export type CustomerTag = { id:string; buyerIdentifier:string; tags:string[] }
export type SyncMutation = { id:string; entity:string; upserts:any[]; deletedIds:string[]; createdAt:string; tries:number; lastError?:string }
export type ForecastRow = { productId:string; productName:string; game:string; avgDaily:number; stock:number; daysLeft:number|null; recommendedRestock:number }

const safeParse=<T,>(key:string,fallback:T):T=>{if(typeof window==='undefined')return fallback;try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}}
const save=(key:string,value:any)=>{if(typeof window!=='undefined')localStorage.setItem(key,JSON.stringify(value))}

export const loadChannelRules=()=>safeParse<ChannelRule[]>('itemkuV4ChannelRules',[{id:'channel_itemku',name:'Itemku',feePercent:10,fixedFee:0,active:true,note:'Default',updatedAt:new Date().toISOString()},{id:'channel_whatsapp',name:'WhatsApp',feePercent:0,fixedFee:0,active:true,note:'Direct',updatedAt:new Date().toISOString()}])
export const saveChannelRules=(x:ChannelRule[])=>save('itemkuV4ChannelRules',x)
export const loadSuppliers=()=>safeParse<Supplier[]>('itemkuV4Suppliers',[])
export const saveSuppliers=(x:Supplier[])=>save('itemkuV4Suppliers',x)
export const loadPurchaseOrders=()=>safeParse<PurchaseOrder[]>('itemkuV4PurchaseOrders',[])
export const savePurchaseOrders=(x:PurchaseOrder[])=>save('itemkuV4PurchaseOrders',x)
export const loadInventoryLedger=()=>safeParse<InventoryLedger[]>('itemkuV4InventoryLedger',[])
export const saveInventoryLedger=(x:InventoryLedger[])=>save('itemkuV4InventoryLedger',x)
export const loadSettlements=()=>safeParse<Settlement[]>('itemkuV4Settlements',[])
export const saveSettlements=(x:Settlement[])=>save('itemkuV4Settlements',x)
export const loadDisputes=()=>safeParse<Dispute[]>('itemkuV4Disputes',[])
export const saveDisputes=(x:Dispute[])=>save('itemkuV4Disputes',x)
export const loadAutomationRules=()=>safeParse<AutomationRule[]>('itemkuV4AutomationRules',defaultAutomationRules())
export const saveAutomationRules=(x:AutomationRule[])=>save('itemkuV4AutomationRules',x)
export const loadNotifications=()=>safeParse<NotificationItem[]>('itemkuV4Notifications',[])
export const saveNotifications=(x:NotificationItem[])=>save('itemkuV4Notifications',x)
export const loadDashboardPreferences=()=>safeParse<DashboardPreferences>('itemkuV4DashboardPrefs',{id:'owner',visibleCards:['profit','revenue','orders','stock','sla','forecast'],slaMinutes:10,forecastDays:7})
export const saveDashboardPreferences=(x:DashboardPreferences)=>save('itemkuV4DashboardPrefs',x)
export const loadCustomerTags=()=>safeParse<any[]>('itemkuV4CustomerTags',[]).map((x:any)=>({id:x.id||`tag_${String(x.buyerIdentifier||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_')}`,buyerIdentifier:x.buyerIdentifier||'',tags:Array.isArray(x.tags)?x.tags:[]}))
export const saveCustomerTags=(x:CustomerTag[])=>save('itemkuV4CustomerTags',x)
export const loadSyncQueue=()=>safeParse<SyncMutation[]>('itemkuV4SyncQueue',[])
export const saveSyncQueue=(x:SyncMutation[])=>save('itemkuV4SyncQueue',x)

export function defaultAutomationRules():AutomationRule[]{const now=new Date().toISOString();return[
  {id:'rule_low_stock',kind:'low_stock',enabled:true,threshold:5,label:'Stok menipis',createdAt:now,updatedAt:now},
  {id:'rule_aging_stock',kind:'aging_stock',enabled:true,threshold:14,label:'Stok menumpuk',createdAt:now,updatedAt:now},
  {id:'rule_slow_order',kind:'slow_order',enabled:true,threshold:10,label:'Order melewati SLA',createdAt:now,updatedAt:now},
  {id:'rule_low_margin',kind:'low_margin',enabled:true,threshold:5,label:'Margin terlalu rendah',createdAt:now,updatedAt:now},
  {id:'rule_hot_product',kind:'hot_product',enabled:true,threshold:10,label:'Produk ramai',createdAt:now,updatedAt:now},
]}

export function feeForChannel(rules:ChannelRule[],channel:string,product:Product){const r=rules.find(x=>x.active&&x.name.toLowerCase()===channel.trim().toLowerCase());return {feePercent:r?.feePercent??product.fee,fixedFee:r?.fixedFee??product.fixed}}

export function generatePoNo(pos:PurchaseOrder[],when=new Date()){const prefix=`PO-${String(when.getFullYear()).slice(-2)}${String(when.getMonth()+1).padStart(2,'0')}${String(when.getDate()).padStart(2,'0')}-`;const max=pos.filter(x=>x.poNo.startsWith(prefix)).reduce((m,x)=>Math.max(m,Number(x.poNo.split('-').pop())||0),0);return `${prefix}${String(max+1).padStart(3,'0')}`}

export function expectedSettlement(orders:Order[],channel:string,start:string,end:string){const a=new Date(start).getTime(),b=new Date(end).getTime();return orders.filter(o=>o.status==='Selesai'&&o.channel===channel&&new Date(o.completedAt||o.createdAt).getTime()>=a&&new Date(o.completedAt||o.createdAt).getTime()<=b).reduce((s,o)=>s+(o.snapshot.revenue-o.snapshot.feeAmount),0)}

export function settlementDifference(x:Settlement){return x.actualAmount-x.expectedAmount}

export function slaMetrics(orders:Order[],slaMinutes=10){const done=orders.filter(o=>o.status==='Selesai');const minutes=done.map(o=>{const start=new Date(o.processingAt||o.createdAt).getTime(),end=new Date(o.completedAt||o.createdAt).getTime();return Math.max(0,(end-start)/60000)});const within=minutes.filter(x=>x<=slaMinutes).length;return {completed:done.length,avgMinutes:minutes.length?minutes.reduce((a,b)=>a+b,0)/minutes.length:0,withinSla:within,withinSlaPct:minutes.length?within/minutes.length*100:0}}

export function salesForecast(products:Product[],orders:Order[],lookbackDays=30,coverageDays=7):ForecastRow[]{const since=Date.now()-lookbackDays*86400000;return products.filter(p=>p.active).map(p=>{const sold=orders.filter(o=>o.status==='Selesai'&&o.productId===p.id&&new Date(o.completedAt||o.createdAt).getTime()>=since).reduce((s,o)=>s+o.qty,0);const avg=sold/lookbackDays;const days=avg>0?p.stock/avg:null;const target=Math.ceil(avg*coverageDays);return {productId:p.id,productName:p.name,game:p.game,avgDaily:avg,stock:p.stock,daysLeft:days,recommendedRestock:Math.max(0,target-p.stock)}}).sort((a,b)=>(a.daysLeft??9999)-(b.daysLeft??9999))}

export function forecastBusiness(orders:Order[],days=30){const since=Date.now()-days*86400000;const done=orders.filter(o=>o.status==='Selesai'&&new Date(o.completedAt||o.createdAt).getTime()>=since);const profit=done.reduce((s,o)=>s+o.snapshot.profit,0),revenue=done.reduce((s,o)=>s+o.snapshot.revenue,0);const dailyProfit=profit/days,dailyRevenue=revenue/days;const now=new Date();const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();return {dailyProfit,dailyRevenue,projectedMonthlyProfit:dailyProfit*daysInMonth,projectedMonthlyRevenue:dailyRevenue*daysInMonth}}

export function customerCrm(orders:Order[],tags:CustomerTag[]){const map=new Map<string,{buyer:string;orders:number;spend:number;refunds:number;lastAt:string}>();orders.forEach(o=>{const k=o.buyerIdentifier.trim().toLowerCase();if(!k)return;const x=map.get(k)||{buyer:o.buyerIdentifier,orders:0,spend:0,refunds:0,lastAt:o.createdAt};if(o.status==='Selesai'){x.orders++;x.spend+=o.snapshot.revenue}if(o.status==='Refund')x.refunds++;if(new Date(o.createdAt)>new Date(x.lastAt))x.lastAt=o.createdAt;map.set(k,x)});return [...map.values()].map(x=>{const manual=tags.find(t=>t.buyerIdentifier.trim().toLowerCase()===x.buyer.trim().toLowerCase())?.tags||[];const auto=[x.orders===1?'Pelanggan Baru':'',x.orders>=3?'Repeat Buyer':'',x.orders>=10||x.spend>=1_000_000?'VIP':'',x.refunds>=2?'Sering Refund':''].filter(Boolean);return {...x,tags:[...new Set([...manual,...auto])],aov:x.orders?x.spend/x.orders:0}}).sort((a,b)=>b.spend-a.spend)}

export function automationNotifications(products:Product[],orders:Order[],rules:AutomationRule[],existing:NotificationItem[]=[]){const now=Date.now(),out=[...existing];const add=(key:string,level:NotificationItem['level'],title:string,detail:string,entityType?:string,entityId?:string)=>{if(out.some(n=>n.id===key))return;out.unshift({id:key,kind:key.split(':')[0],level,title,detail,entityType,entityId,read:false,createdAt:new Date().toISOString()})};for(const r of rules.filter(x=>x.enabled)){
  if(r.kind==='low_stock')products.filter(p=>p.active&&p.stock<=Math.max(p.reorderPoint,r.threshold)).forEach(p=>add(`low_stock:${p.id}:${p.stock}`,'warn','Stok perlu restock',`${p.game} · ${p.name}: ${p.stock} unit`,'product',p.id))
  if(r.kind==='aging_stock')products.filter(p=>p.stock>0&&(now-new Date(p.stockSince).getTime())/86400000>=r.threshold).forEach(p=>add(`aging_stock:${p.id}:${Math.floor((now-new Date(p.stockSince).getTime())/86400000)}`,'warn','Stok menumpuk',`${p.name} sudah tersimpan ≥${r.threshold} hari`,'product',p.id))
  if(r.kind==='slow_order')orders.filter(o=>(o.status==='Baru'||o.status==='Diproses')&&(now-new Date(o.createdAt).getTime())/60000>=r.threshold).forEach(o=>add(`slow_order:${o.id}`,'danger','Order melewati SLA',`${o.invoiceNo} · ${o.productName}`,'order',o.id))
  if(r.kind==='low_margin')products.forEach(p=>{const price=p.discountEnabled&&p.discountPrice?p.discountPrice:p.price;const profit=price-(p.modal+price*p.fee/100+p.fixed+p.other);const margin=price?profit/price*100:0;if(margin<r.threshold)add(`low_margin:${p.id}:${Math.round(margin)}`,'danger','Margin rendah',`${p.name}: margin sekitar ${margin.toFixed(1)}%`,'product',p.id)})
  if(r.kind==='hot_product'){const today=new Date();today.setHours(0,0,0,0);const m=new Map<string,{p:string;n:number}>();orders.filter(o=>o.status==='Selesai'&&new Date(o.completedAt||o.createdAt)>=today).forEach(o=>{const x=m.get(o.productId)||{p:o.productName,n:0};x.n+=o.qty;m.set(o.productId,x)});m.forEach((x,k)=>{if(x.n>=r.threshold)add(`hot_product:${k}:${new Date().toISOString().slice(0,10)}`,'success','Produk ramai hari ini',`${x.p}: ${x.n} unit terjual`,'product',k)})}
  }
  return out.slice(0,500)
}

export function buildLedgerFromLegacy(products:Product[],orders:Order[],existing:InventoryLedger[]){if(existing.length)return existing;const rows:InventoryLedger[]=[];products.forEach(p=>rows.push({id:id('ledger'),productId:p.id,productName:p.name,delta:p.stock,stockBefore:0,stockAfter:p.stock,reason:'Opening',note:'Saldo awal saat migrasi V4',createdAt:new Date().toISOString(),actor:'System'}));orders.filter(o=>o.stockRestored).forEach(o=>rows.unshift({id:id('ledger'),productId:o.productId,productName:o.productName,delta:o.qty,stockBefore:0,stockAfter:0,reason:'Refund',referenceId:o.id,note:'Histori refund dari data lama',createdAt:o.completedAt||o.createdAt,actor:o.assignedWorker||'System'}));return rows}

export function archiveProduct(products:Product[],productId:string){return products.map(p=>p.id===productId?{...p,active:false}:p)}

export function exportV4Backup(){return JSON.stringify({version:4,exportedAt:new Date().toISOString(),channelRules:loadChannelRules(),suppliers:loadSuppliers(),purchaseOrders:loadPurchaseOrders(),inventoryLedger:loadInventoryLedger(),settlements:loadSettlements(),disputes:loadDisputes(),automationRules:loadAutomationRules(),notifications:loadNotifications(),dashboardPreferences:loadDashboardPreferences(),customerTags:loadCustomerTags()},null,2)}

export function restoreV4Backup(json:string){const d=JSON.parse(json);if(!d||typeof d!=='object')throw new Error('Backup V4 tidak valid');if(Array.isArray(d.channelRules))saveChannelRules(d.channelRules);if(Array.isArray(d.suppliers))saveSuppliers(d.suppliers);if(Array.isArray(d.purchaseOrders))savePurchaseOrders(d.purchaseOrders);if(Array.isArray(d.inventoryLedger))saveInventoryLedger(d.inventoryLedger);if(Array.isArray(d.settlements))saveSettlements(d.settlements);if(Array.isArray(d.disputes))saveDisputes(d.disputes);if(Array.isArray(d.automationRules))saveAutomationRules(d.automationRules);if(Array.isArray(d.notifications))saveNotifications(d.notifications);if(d.dashboardPreferences)saveDashboardPreferences(d.dashboardPreferences);if(Array.isArray(d.customerTags))saveCustomerTags(d.customerTags)}

export function csvRows(text:string){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(!lines.length)return [];const parse=(line:string)=>{const out:string[]=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===','&&!q){out.push(cur);cur=''}else cur+=c}out.push(cur);return out};const h=parse(lines[0]).map(x=>x.trim());return lines.slice(1).map(line=>{const v=parse(line);return Object.fromEntries(h.map((k,i)=>[k,v[i]??'']))})}

export function healthSnapshot(configured:boolean,cloud:boolean,realtimeStatus:string){const pending=loadSyncQueue();return {online:typeof navigator==='undefined'?true:navigator.onLine,cloudConfigured:configured,cloudSession:cloud,realtimeStatus,pendingSync:pending.length,lastSyncError:pending.find(x=>x.lastError)?.lastError||'',serviceWorker:typeof navigator!=='undefined'&&'serviceWorker'in navigator,version:'6.4.2-payroll'}}

export const formatDays=(n:number|null)=>n===null?'Belum ada penjualan':n<1?'<1 hari':`${n.toFixed(1)} hari`
export const compactMoney=(n:number)=>money(n).replace(',00','')
