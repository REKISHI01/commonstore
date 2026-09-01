export type BackupCounts={products:number;orders:number;workers:number;restocks:number;expenses:number;opportunities:number;suppliers:number;purchaseOrders:number;inventoryLedger:number;settlements:number;disputes:number;audit:number}
export type BackupInspection={valid:boolean;compatible:boolean;version:string;release:string;exportedAt:string|null;counts:BackupCounts;warnings:string[];critical:string[];summary:string}
export type ClientErrorEntry={id:string;message:string;source:string;createdAt:string}
export type RecoverySnapshot={id:string;name:string;createdAt:string;bytes:number;checksum:string;payload:string}

const arr=(v:any)=>Array.isArray(v)?v:[]
const nested=(d:any,key:string)=>arr(d?.v4?.[key]??d?.[key])
const dup=(values:string[])=>{const m=new Map<string,number>();for(const raw of values){const v=String(raw||'').trim().toLowerCase();if(v)m.set(v,(m.get(v)||0)+1)}return [...m.entries()].filter(([,n])=>n>1).map(([k])=>k)}

export function inspectBackupText(text:string):BackupInspection{
  try{
    const d=JSON.parse(text)
    if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('Format root backup bukan object')
    const products=arr(d.products),orders=arr(d.orders),workers=arr(d.workers)
    const counts:BackupCounts={
      products:products.length,orders:orders.length,workers:workers.length,restocks:arr(d.restocks).length,expenses:arr(d.expenses).length,opportunities:arr(d.opportunities).length,
      suppliers:nested(d,'suppliers').length,purchaseOrders:nested(d,'purchaseOrders').length,inventoryLedger:nested(d,'inventoryLedger').length,settlements:nested(d,'settlements').length,disputes:nested(d,'disputes').length,audit:arr(d.audit).length,
    }
    const warnings:string[]=[],critical:string[]=[]
    const duplicateSku=dup(products.map((p:any)=>p?.sku))
    const duplicateInvoice=dup(orders.map((o:any)=>o?.invoiceNo))
    const negativeStock=products.filter((p:any)=>Number(p?.stock)<0).length
    const brokenSnapshot=orders.filter((o:any)=>!o?.snapshot||!Number.isFinite(Number(o.snapshot.revenue))||!Number.isFinite(Number(o.snapshot.profit))).length
    if(duplicateSku.length)critical.push(`${duplicateSku.length} SKU duplikat`)
    if(duplicateInvoice.length)critical.push(`${duplicateInvoice.length} invoice duplikat`)
    if(negativeStock)critical.push(`${negativeStock} produk memiliki stok negatif`)
    if(brokenSnapshot)critical.push(`${brokenSnapshot} order memiliki snapshot finansial tidak valid`)
    if(!products.length)warnings.push('Backup tidak berisi produk')
    if(!orders.length)warnings.push('Backup tidak berisi order')
    if(!d.exportedAt)warnings.push('Timestamp exportedAt tidak ditemukan')
    const rawVersion=d.release||d.version||'legacy'
    const compatible=Boolean(products.length||orders.length||workers.length||d.settings||d.v4)
    if(!compatible)critical.push('Tidak menemukan struktur data Itemku Profit yang dikenali')
    return {valid:true,compatible,version:String(d.version??'legacy'),release:String(d.release??rawVersion),exportedAt:d.exportedAt||null,counts,warnings,critical,summary:`${counts.products} produk · ${counts.orders} order · ${counts.workers} worker`}
  }catch(e:any){return {valid:false,compatible:false,version:'-',release:'-',exportedAt:null,counts:{products:0,orders:0,workers:0,restocks:0,expenses:0,opportunities:0,suppliers:0,purchaseOrders:0,inventoryLedger:0,settlements:0,disputes:0,audit:0},warnings:[],critical:[e?.message||'Backup tidak valid'],summary:'Backup tidak valid'}}
}

export async function sha256Text(text:string){
  if(typeof crypto==='undefined'||!crypto.subtle)return 'SHA-256 tidak tersedia'
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
}

const DB='itemku-profit-recovery',STORE='snapshots',DB_VERSION=1
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB gagal dibuka'))})}
export async function listRecoverySnapshots():Promise<RecoverySnapshot[]>{if(typeof indexedDB==='undefined')return[];const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve((req.result as RecoverySnapshot[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
export async function saveRecoverySnapshot(name:string,payload:string,maxItems=5):Promise<RecoverySnapshot>{const checksum=await sha256Text(payload);const snap:RecoverySnapshot={id:`snapshot_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,createdAt:new Date().toISOString(),bytes:new Blob([payload]).size,checksum,payload};const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(snap);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();const all=await listRecoverySnapshots();for(const old of all.slice(maxItems))await deleteRecoverySnapshot(old.id);return snap}
export async function deleteRecoverySnapshot(id:string){if(typeof indexedDB==='undefined')return;const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close()}

const ERROR_KEY='itemkuClientErrorsV51'
export function loadClientErrors():ClientErrorEntry[]{if(typeof localStorage==='undefined')return[];try{return arr(JSON.parse(localStorage.getItem(ERROR_KEY)||'[]')).slice(0,50)}catch{return[]}}
export function appendClientError(input:Omit<ClientErrorEntry,'id'|'createdAt'>){if(typeof localStorage==='undefined')return;const next=[{id:`err_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,createdAt:new Date().toISOString(),...input},...loadClientErrors()].slice(0,50);localStorage.setItem(ERROR_KEY,JSON.stringify(next));window.dispatchEvent(new Event('itemku:client-error'))}
export function clearClientErrors(){if(typeof localStorage==='undefined')return;localStorage.removeItem(ERROR_KEY);window.dispatchEvent(new Event('itemku:client-error'))}

export function bytesLabel(bytes:number){if(bytes<1024)return `${bytes} B`;if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1024/1024).toFixed(1)} MB`}
export function ageLabel(iso?:string|null){if(!iso)return 'Belum ada';const ms=Date.now()-new Date(iso).getTime();if(ms<60_000)return 'baru saja';if(ms<3_600_000)return `${Math.floor(ms/60_000)} menit lalu`;if(ms<86_400_000)return `${Math.floor(ms/3_600_000)} jam lalu`;return `${Math.floor(ms/86_400_000)} hari lalu`}
