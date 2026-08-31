'use client'
import { useEffect, useState } from 'react'
import { rupiah } from '@/lib/payroll'

type AnyData = any
const field='h-10 rounded-lg border bg-background px-3 text-sm'
const card='rounded-2xl border bg-card p-5 shadow-sm'

export default function PayrollPanel({role}:{role:'owner'|'worker'}){
  const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7))
  const [data,setData]=useState<AnyData>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [form,setForm]=useState({baseSalary:500000,workerSharePercent:15,reservePercent:25,effectiveFrom:new Date().toISOString().slice(0,10),note:''})

  const load=async()=>{
    setLoading(true);setError('')
    try{
      const r=await fetch(`/api/payroll?month=${month}`,{cache:'no-store'})
      const j=await r.json()
      if(!r.ok)throw new Error(j.error||'Gagal memuat payroll')
      setData(j)
      if(j.activeScheme)setForm((f:any)=>({...f,baseSalary:j.activeScheme.baseSalary,workerSharePercent:j.activeScheme.workerSharePercent,reservePercent:j.activeScheme.reservePercent}))
    }catch(e:any){setError(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[month])

  const action=async(body:any,confirmText?:string)=>{
    if(confirmText&&!window.confirm(confirmText))return
    setLoading(true);setError('')
    try{
      const r=await fetch('/api/payroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const j=await r.json()
      if(!r.ok)throw new Error(j.error||'Gagal memproses payroll')
      await load()
    }catch(e:any){setError(e.message)}finally{setLoading(false)}
  }

  if(role==='worker'){
    const slips=data?.slips||[]
    return <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Skema Gaji Aktif</h2><p className="mt-1 text-xs text-muted-foreground">Transparansi gaji tetap dan profit share. Slip yang sudah difinalisasi tidak berubah ketika skema baru dibuat.</p></div><StatusBadge text="TRANSPARAN"/></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Stat label="Gaji tetap" value={rupiah(data?.activeScheme?.baseSalary||0)}/>
          <Stat label="Profit share" value={`${data?.activeScheme?.workerSharePercent||0}% / Worker`}/>
          <Stat label="Cadangan usaha" value={`${data?.activeScheme?.reservePercent||0}%`}/>
        </div>
      </div>
      {slips.map((x:any)=><div className={card} key={x.item.id}>
        <div className="flex flex-wrap justify-between gap-3"><div><b className="text-lg">Slip {x.item.monthKey}</b><div className="mt-1"><StatusBadge text={x.run?.status==='paid'?'PAID':'FINALIZED'}/></div></div><b className="text-xl">{rupiah(x.item.totalPay)}</b></div>
        <div className="mt-4 grid gap-x-5 md:grid-cols-2 text-sm">
          <Row k="Gaji tetap" v={rupiah(x.item.baseSalary)}/><Row k={`Share ${x.item.sharePercent}%`} v={rupiah(x.item.shareAmount)}/>
          <Row k="Profit bersih bisnis" v={rupiah(Number(x.item.businessSnapshot?.netProfit)||0)}/><Row k="Profit distributable" v={rupiah(Number(x.item.businessSnapshot?.distributableProfit)||0)}/>
          <Row k="Cadangan usaha" v={rupiah(Number(x.item.businessSnapshot?.reserveAmount)||0)}/><Row k="Jumlah Worker" v={String(x.item.businessSnapshot?.workerCount||0)}/>
        </div>
      </div>)}
      {!slips.length&&!loading&&<div className={card}>Belum ada slip payroll yang difinalisasi.</div>}
      {loading&&<p className="text-sm text-muted-foreground">Memuat payroll...</p>}
      {error&&<ErrorBox text={error}/>} 
    </div>
  }

  const p=data?.selectedRun||data?.preview
  const workerCount=Number(p?.workerCount)||0
  const allocation=workerCount*Number(data?.activeScheme?.workerSharePercent||form.workerSharePercent||0)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-bold text-muted-foreground">Bulan<input type="month" className={field} value={month} onChange={e=>setMonth(e.target.value)}/></label>
      <button className="h-10 rounded-lg border bg-card px-4 text-xs font-bold" onClick={()=>void load()} disabled={loading}>{loading?'Memuat...':'Refresh'}</button>
    </div>

    <div className={card}>
      <div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-lg font-bold">Payroll {month}</h2><p className="mt-1 text-xs text-muted-foreground">{data?.selectedRun?'Snapshot sudah terkunci dan menjadi histori resmi.':'Preview live — akan dihitung ulang saat finalisasi.'}</p></div>{data?.selectedRun?<StatusBadge text={data.selectedRun.status.toUpperCase()}/>:<StatusBadge text="PREVIEW"/>}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Profit order selesai" value={rupiah(p?.grossOrderProfit||0)}/><Stat label="Biaya usaha" value={rupiah(p?.expensesTotal||0)}/><Stat label="Profit bersih" value={rupiah(p?.netProfit||0)}/><Stat label={`Cadangan ${p?.scheme?.reservePercent??data?.activeScheme?.reservePercent??0}%`} value={rupiah(p?.reserveAmount||0)}/>
        <Stat label="Total gaji tetap" value={rupiah(p?.fixedSalaryTotal||0)}/><Stat label="Profit distributable" value={rupiah(p?.distributableProfit||0)}/><Stat label="Total Worker share" value={rupiah(p?.workerShareTotal||0)}/><Stat label="Owner remaining" value={rupiah(p?.ownerRemaining||0)}/>
      </div>
      <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">Rumus: profit bersih − cadangan − total gaji tetap = profit distributable. Setiap Worker memperoleh persentase skema dari profit distributable. Saat profit distributable ≤ 0, profit share menjadi Rp0.</div>
      {Number(p?.ownerRemaining)<0&&<div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Peringatan: owner remaining negatif. Periksa profit, biaya, jumlah Worker, atau skema sebelum finalisasi.</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {!data?.selectedRun&&<button className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" disabled={loading} onClick={()=>void action({action:'finalize',month},`Finalisasi payroll ${month}? Snapshot setelah finalisasi tidak dapat diubah.`)}>Finalisasi Payroll</button>}
        {data?.selectedRun?.status==='finalized'&&<button className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white" disabled={loading} onClick={()=>void action({action:'mark_paid',runId:data.selectedRun.id},`Tandai payroll ${month} sudah dibayar?`)}>Tandai Sudah Dibayar</button>}
      </div>
    </div>

    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Atur Skema Baru</h2><p className="mt-1 text-xs text-muted-foreground">Perubahan membuat versi skema baru. Slip payroll lama tetap terkunci.</p></div><StatusBadge text={`${workerCount} WORKER`}/></div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">Gaji tetap<input className={field} type="number" min="0" value={form.baseSalary} onChange={e=>setForm({...form,baseSalary:Number(e.target.value)})}/></label>
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">Share / Worker (%)<input className={field} type="number" min="0" max="100" step="0.1" value={form.workerSharePercent} onChange={e=>setForm({...form,workerSharePercent:Number(e.target.value)})}/></label>
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">Cadangan (%)<input className={field} type="number" min="0" max="100" step="0.1" value={form.reservePercent} onChange={e=>setForm({...form,reservePercent:Number(e.target.value)})}/></label>
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">Berlaku mulai<input className={field} type="date" value={form.effectiveFrom} onChange={e=>setForm({...form,effectiveFrom:e.target.value})}/></label>
      </div>
      <input className={`${field} mt-3 w-full`} placeholder="Catatan perubahan" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/>
      {allocation>100&&<p className="mt-3 text-sm font-semibold text-red-600">Skema berisiko: {form.workerSharePercent}% × {workerCount} Worker = {workerCount*form.workerSharePercent}% &gt; 100%.</p>}
      <button className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground" disabled={loading||workerCount*form.workerSharePercent>100} onClick={()=>void action({action:'save_scheme',...form},'Simpan skema payroll baru?')}>Simpan Skema Baru</button>
    </div>

    <div className={card}>
      <h2 className="text-lg font-bold">Slip Worker — {month}</h2>
      <div className="mt-3 space-y-1">{(data?.selectedItems||[]).map((x:any)=><div key={x.id} className="flex flex-wrap justify-between gap-2 border-b py-3 text-sm"><span>{x.workerName} · gaji {rupiah(x.baseSalary)} + share {x.sharePercent}%</span><b>{rupiah(x.totalPay)}</b></div>)}</div>
      {!data?.selectedItems?.length&&<p className="mt-3 text-sm text-muted-foreground">Slip muncul setelah payroll difinalisasi.</p>}
    </div>
    {error&&<ErrorBox text={error}/>} 
  </div>
}

function Stat({label,value}:{label:string,value:string}){return <div className="rounded-xl border bg-background/40 p-3"><div className="text-[11px] font-semibold text-muted-foreground">{label}</div><div className="mt-1 text-base font-bold">{value}</div></div>}
function Row({k,v}:{k:string,v:string}){return <div className="flex justify-between gap-3 border-b py-2"><span className="text-muted-foreground">{k}</span><b>{v}</b></div>}
function StatusBadge({text}:{text:string}){const paid=text==='PAID';return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${paid?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>{text}</span>}
function ErrorBox({text}:{text:string}){return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">{text}</div>}
