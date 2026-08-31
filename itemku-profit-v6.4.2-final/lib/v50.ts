import { calculateProduct, type Order, type Product, type Worker } from './itemku'
import { loadSyncQueue, type ChannelRule, type Dispute, type InventoryLedger, type PurchaseOrder, type Settlement, type Supplier, type SyncState } from './v4'
import { loadClientErrors } from './v51'
import { loadApprovals, loadReportSchedules } from './v52'

export type ReadinessLevel='pass'|'warn'|'fail'
export type ReadinessItem={id:string;group:'Cloud'|'Data'|'Operasional'|'Keamanan'|'Backup';label:string;detail:string;level:ReadinessLevel;target:string}
export type FinalReadiness={score:number;status:'Siap Go-Live'|'Hampir Siap'|'Perlu Perbaikan';items:ReadinessItem[];critical:number;warnings:number;passed:number;stats:{products:number;orders:number;workers:number;pendingSync:number;openDisputes:number;openPo:number;unpaidSettlement:number}}

type Input={
  products:Product[];orders:Order[];workers:Worker[];suppliers:Supplier[];purchaseOrders:PurchaseOrder[];inventoryLedger:InventoryLedger[];settlements:Settlement[];disputes:Dispute[];channelRules:ChannelRule[];
  ownerCloud:boolean;online:boolean;syncState:SyncState;realtimeStatus:string;lastBackupAt?:string|null
}

const ageDays=(iso?:string|null)=>iso?Math.max(0,(Date.now()-new Date(iso).getTime())/86_400_000):Infinity
const duplicateKeys=(values:string[])=>{const m=new Map<string,number>();values.map(v=>v.trim().toLowerCase()).filter(Boolean).forEach(v=>m.set(v,(m.get(v)||0)+1));return [...m.entries()].filter(([,n])=>n>1).map(([k])=>k)}

export function finalReadiness(x:Input):FinalReadiness{
  const items:ReadinessItem[]=[]
  const add=(item:ReadinessItem)=>items.push(item)
  const pendingSync=typeof window==='undefined'?0:loadSyncQueue().length
  const duplicateSku=duplicateKeys(x.products.map(p=>p.sku))
  const duplicateInvoice=duplicateKeys(x.orders.map(o=>o.invoiceNo))
  const negativeStock=x.products.filter(p=>p.stock<0)
  const brokenOrders=x.orders.filter(o=>!o.snapshot||!Number.isFinite(o.snapshot.revenue)||!Number.isFinite(o.snapshot.profit))
  const orphanOrders=x.orders.filter(o=>o.productId&&!x.products.some(p=>p.id===o.productId))
  const unsafeMargin=x.products.filter(p=>p.active&&calculateProduct(p).profit<0)
  const activeProducts=x.products.filter(p=>p.active)
  const enabledWorkers=x.workers.filter(w=>w.enabled!==false)
  const activeChannels=x.channelRules.filter(r=>r.active)
  const openDisputes=x.disputes.filter(d=>!['Selesai','Ditutup'].includes(d.status)).length
  const openPo=x.purchaseOrders.filter(p=>!['Diterima','Batal'].includes(p.status)).length
  const unpaidSettlement=x.settlements.filter(s=>s.status!=='Sudah Cair').reduce((sum,s)=>sum+Math.max(0,s.expectedAmount-s.actualAmount),0)

  add({id:'cloud-session',group:'Cloud',label:'Cloud session',detail:x.ownerCloud?'Owner terhubung ke cloud.':'Masih menggunakan mode lokal; sinkron lintas perangkat belum aktif.',level:x.ownerCloud?'pass':'warn',target:'Cloud Sync'})
  add({id:'internet',group:'Cloud',label:'Koneksi perangkat',detail:x.online?'Perangkat online.':'Perangkat offline; perubahan akan menunggu antrean sync.',level:x.online?'pass':'warn',target:'Health & Import'})
  add({id:'sync',group:'Cloud',label:'Status sinkronisasi',detail:`Status ${x.syncState}; pending ${pendingSync}.`,level:x.syncState==='error'?'fail':pendingSync>0||x.syncState!=='synced'?'warn':'pass',target:'Health & Import'})
  add({id:'realtime',group:'Cloud',label:'Realtime',detail:x.ownerCloud?x.realtimeStatus:'Tidak diperlukan pada mode lokal.',level:!x.ownerCloud?'warn':/aktif/i.test(x.realtimeStatus)?'pass':'warn',target:'Cloud Sync'})

  add({id:'sku',group:'Data',label:'SKU unik',detail:duplicateSku.length?`${duplicateSku.length} SKU duplikat ditemukan.`:'Tidak ada SKU duplikat.',level:duplicateSku.length?'fail':'pass',target:'Data Quality'})
  add({id:'invoice',group:'Data',label:'Invoice unik',detail:duplicateInvoice.length?`${duplicateInvoice.length} invoice duplikat ditemukan.`:'Tidak ada invoice duplikat.',level:duplicateInvoice.length?'fail':'pass',target:'Data Quality'})
  add({id:'stock',group:'Data',label:'Stok valid',detail:negativeStock.length?`${negativeStock.length} produk memiliki stok negatif.`:'Tidak ada stok negatif.',level:negativeStock.length?'fail':'pass',target:'Inventory Ledger'})
  add({id:'snapshot',group:'Data',label:'Snapshot transaksi',detail:brokenOrders.length?`${brokenOrders.length} order memiliki snapshot finansial tidak valid.`:'Snapshot order terbaca normal.',level:brokenOrders.length?'fail':'pass',target:'Data Quality'})
  add({id:'orphan',group:'Data',label:'Referensi produk historis',detail:orphanOrders.length?`${orphanOrders.length} order historis tidak lagi punya master produk; snapshot masih dapat dipakai.`:'Referensi produk konsisten.',level:orphanOrders.length?'warn':'pass',target:'Data Quality'})

  add({id:'products',group:'Operasional',label:'Produk aktif',detail:activeProducts.length?`${activeProducts.length} produk aktif siap dijual.`:'Belum ada produk aktif.',level:activeProducts.length?'pass':'fail',target:'Daftar Produk'})
  add({id:'channels',group:'Operasional',label:'Channel penjualan',detail:activeChannels.length?`${activeChannels.length} channel aktif.`:'Belum ada channel aktif.',level:activeChannels.length?'pass':'fail',target:'Channel & Fee'})
  add({id:'workers',group:'Operasional',label:'Worker',detail:enabledWorkers.length?`${enabledWorkers.length} Worker aktif/tersedia.`:'Tidak ada Worker aktif; aman jika Owner bekerja sendiri.',level:enabledWorkers.length?'pass':'warn',target:'Worker & Permission'})
  add({id:'margin',group:'Operasional',label:'Margin Guard',detail:unsafeMargin.length?`${unsafeMargin.length} produk aktif berpotensi rugi.`:'Tidak ada produk aktif dengan estimasi profit negatif.',level:unsafeMargin.length?'fail':'pass',target:'Profit Protection'})
  add({id:'supplier',group:'Operasional',label:'Supplier master',detail:x.suppliers.length?`${x.suppliers.length} supplier tercatat.`:'Belum ada Supplier Center; opsional jika stok dikelola manual.',level:x.suppliers.length?'pass':'warn',target:'Supplier Center'})
  add({id:'issues',group:'Operasional',label:'Kendala terbuka',detail:`${openDisputes} dispute · ${openPo} PO berjalan · payout belum cair Rp${Math.round(unpaidSettlement).toLocaleString('id-ID')}.`,level:openDisputes>0?'warn':'pass',target:'Action Center'})

  const cloudWorkersMissingId=enabledWorkers.filter(w=>x.ownerCloud&&!w.cloudUserId)
  add({id:'worker-cloud-id',group:'Keamanan',label:'Identitas Worker cloud',detail:cloudWorkersMissingId.length?`${cloudWorkersMissingId.length} Worker aktif belum memiliki UUID cloud.`:'Identitas Worker sesuai mode penggunaan.',level:cloudWorkersMissingId.length?'warn':'pass',target:'Worker & Permission'})
  add({id:'financial-access',group:'Keamanan',label:'Akses finansial Worker',detail:`${enabledWorkers.filter(w=>w.permissions.canViewFinancials).length} Worker memiliki izin melihat finansial.`,level:enabledWorkers.some(w=>w.permissions.canViewFinancials)?'warn':'pass',target:'Worker & Permission'})

  const clientErrors=typeof window==='undefined'?[]:loadClientErrors()
  add({id:'client-errors',group:'Keamanan',label:'Client error journal',detail:clientErrors.length?`${clientErrors.length} error browser tercatat; cek Observability Center.`:'Tidak ada client error yang tercatat.',level:clientErrors.length>5?'fail':clientErrors.length?'warn':'pass',target:'Observability Center'})

  const approvals=typeof window==='undefined'?[]:loadApprovals()
  const pendingApprovals=approvals.filter(a=>a.status==='Pending').length
  add({id:'approval-queue',group:'Keamanan',label:'Approval sensitif',detail:pendingApprovals?`${pendingApprovals} perubahan sensitif masih menunggu keputusan Owner.`:'Tidak ada approval sensitif yang tertunda.',level:pendingApprovals>10?'warn':pendingApprovals?'warn':'pass',target:'Approval Center'})
  const schedules=typeof window==='undefined'?[]:loadReportSchedules()
  const overdue=schedules.filter(s=>s.enabled&&new Date(s.nextRunAt).getTime()<Date.now()-86_400_000).length
  add({id:'scheduled-reports',group:'Operasional',label:'Scheduled reports',detail:schedules.length?`${schedules.filter(s=>s.enabled).length} jadwal aktif${overdue?` · ${overdue} terlambat diproses`:''}.`:'Belum ada scheduled report; opsional.',level:overdue?'warn':'pass',target:'Scheduled Reports'})

  const checkpointAt=typeof window==='undefined'?null:localStorage.getItem('itemkuLastCheckpointAt')
  const checkpointAge=ageDays(checkpointAt)
  add({id:'checkpoint',group:'Backup',label:'Recovery checkpoint',detail:Number.isFinite(checkpointAge)?`Checkpoint lokal ${checkpointAge<1?'dibuat hari ini':`berumur ${Math.floor(checkpointAge)} hari`}.`:'Belum ada checkpoint Recovery Vault.',level:checkpointAge<=7?'pass':'warn',target:'Recovery Center'})

  const backupAge=ageDays(x.lastBackupAt)
  add({id:'backup',group:'Backup',label:'Backup terakhir',detail:Number.isFinite(backupAge)?`Backup terakhir ${backupAge<1?'hari ini':`${Math.floor(backupAge)} hari lalu`}.`:'Belum ada backup lokal yang tercatat.',level:backupAge<=7?'pass':backupAge<=14?'warn':'fail',target:'Backup & Export'})
  add({id:'ledger',group:'Backup',label:'Inventory ledger',detail:x.inventoryLedger.length?`${x.inventoryLedger.length} pergerakan stok tercatat.`:'Ledger masih kosong; normal untuk instalasi baru.',level:x.orders.length&&x.inventoryLedger.length===0?'warn':'pass',target:'Inventory Ledger'})

  const weight=(l:ReadinessLevel)=>l==='pass'?1:l==='warn'?.5:0
  const score=Math.round(items.reduce((s,i)=>s+weight(i.level),0)/Math.max(1,items.length)*100)
  const critical=items.filter(i=>i.level==='fail').length,warnings=items.filter(i=>i.level==='warn').length,passed=items.filter(i=>i.level==='pass').length
  const status:FinalReadiness['status']=critical===0&&score>=85?'Siap Go-Live':critical<=2&&score>=65?'Hampir Siap':'Perlu Perbaikan'
  return {score,status,items,critical,warnings,passed,stats:{products:x.products.length,orders:x.orders.length,workers:x.workers.length,pendingSync,openDisputes,openPo,unpaidSettlement}}
}
