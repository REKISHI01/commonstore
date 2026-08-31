'use client'
import { useEffect, useMemo, useState } from 'react'
import { finalReadiness } from '../../lib/v50'

type Ctx={products:any[];orders:any[];workers:any[];suppliers:any[];purchaseOrders:any[];inventoryLedger:any[];settlements:any[];disputes:any[];channelRules:any[];ownerCloud:boolean;online:boolean;syncState:any;realtimeStatus:string;setActive:(s:string)=>void;flash:(s:string)=>void}
const tone=(level:string)=>level==='pass'?'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200':level==='fail'?'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200':'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'

export function FinalControlCenterView(c:Ctx){
  const [lastBackupAt,setLastBackupAt]=useState<string|null>(null)
  useEffect(()=>{const load=()=>setLastBackupAt(localStorage.getItem('itemkuLastBackupAt'));load();window.addEventListener('itemku:backup',load);return()=>window.removeEventListener('itemku:backup',load)},[])
  const report=useMemo(()=>finalReadiness({...c,lastBackupAt}),[c.products,c.orders,c.workers,c.suppliers,c.purchaseOrders,c.inventoryLedger,c.settlements,c.disputes,c.channelRules,c.ownerCloud,c.online,c.syncState,c.realtimeStatus,lastBackupAt])
  const grouped=['Cloud','Data','Operasional','Keamanan','Backup'] as const
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Readiness Score" value={`${report.score}%`} state={report.score>=85?'good':report.score>=65?'warn':'bad'}/>
      <Metric label="Status" value={report.status} state={report.status==='Siap Go-Live'?'good':report.status==='Hampir Siap'?'warn':'bad'}/>
      <Metric label="Lolos" value={String(report.passed)} state="good"/>
      <Metric label="Peringatan" value={String(report.warnings)} state={report.warnings?'warn':'good'}/>
      <Metric label="Kritis" value={String(report.critical)} state={report.critical?'bad':'good'}/>
    </section>

    <Card title="Final Control Center" subtitle="Audit terakhir sebelum aplikasi dipakai sebagai sistem operasional utama.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Mini label="Produk" value={String(report.stats.products)}/><Mini label="Order" value={String(report.stats.orders)}/><Mini label="Worker" value={String(report.stats.workers)}/><Mini label="Pending Sync" value={String(report.stats.pendingSync)}/>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={()=>c.setActive(report.critical?'Data Quality':'Backup & Export')}>{report.critical?'Perbaiki isu kritis':'Buat Backup Final'}</button>
        <button className="btn-secondary" onClick={()=>c.setActive('Health & Import')}>Buka Health Center</button>
        <button className="btn-secondary" onClick={()=>{navigator.clipboard?.writeText(`Itemku Profit V5.2 · readiness ${report.score}% · ${report.status}`);c.flash('Status release disalin')}}>Copy Status Release</button>
      </div>
    </Card>

    {grouped.map(group=><Card key={group} title={group} subtitle={`${report.items.filter(i=>i.group===group&&i.level==='pass').length}/${report.items.filter(i=>i.group===group).length} pemeriksaan lolos.`}>
      <div className="grid gap-3 lg:grid-cols-2">{report.items.filter(i=>i.group===group).map(i=><button key={i.id} onClick={()=>c.setActive(i.target)} className={`rounded-xl border p-4 text-left transition hover:opacity-90 ${tone(i.level)}`}><div className="flex items-center justify-between gap-3"><strong className="text-sm">{i.label}</strong><span className="rounded-full bg-background/70 px-2 py-1 text-[10px] font-black uppercase">{i.level==='pass'?'OK':i.level==='warn'?'Cek':'Kritis'}</span></div><p className="mt-2 text-xs opacity-80">{i.detail}</p><p className="mt-3 text-[10px] font-black">Buka {i.target} →</p></button>)}</div>
    </Card>)}

    <Card title="Checklist Go-Live" subtitle="Urutan yang disarankan sebelum V5 dijadikan versi utama.">
      <ol className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
        <li>1. Jalankan <code>pnpm install && pnpm build</code>.</li><li>2. Jalankan schema Supabase V5 untuk deployment cloud.</li>
        <li>3. Pastikan Final Readiness tidak memiliki status Kritis.</li><li>4. Buat backup JSON final dan simpan di lokasi terpisah.</li>
        <li>5. Uji satu order dari Owner sampai Worker selesai.</li><li>6. Uji refund + restore stock pada order percobaan.</li>
        <li>7. Uji offline → online dan pastikan pending sync kembali 0.</li><li>8. Verifikasi payout, fee, supplier, dan hak akses Worker.</li>
      </ol>
    </Card>
  </div>
}
function Card({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}){return <section className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="text-base font-black">{title}</h2>{subtitle&&<p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}<div className="mt-4">{children}</div></section>}
function Metric({label,value,state}:{label:string;value:string;state?:'good'|'warn'|'bad'}){const cls=state==='good'?'text-emerald-700':state==='warn'?'text-amber-700':state==='bad'?'text-red-600':'';return <div className="rounded-xl border bg-card p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className={`mt-1 block text-xl ${cls}`}>{value}</strong></div>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-xl border p-3"><span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span><p className="mt-1 text-lg font-black">{value}</p></div>}
