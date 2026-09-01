'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  appendAudit, loadOrders, loadProducts, loadSettings, loadWorkers, money, saveOrders, saveProducts, saveWorkers,
  type Order, type OrderStatus, type Product, type Worker, type WorkerPermissions,
} from '../../lib/itemku'
import {
  cloudAction, cloudSessionInfo, cloudSignIn, cloudSignOut, pullCloud, subscribeCloud, type CloudUser,
} from '../../lib/cloud'
import PayrollPanel from '../../components/payroll/PayrollPanel'

type ActiveWorker = {
  id: string
  name: string
  role: 'owner'|'worker'
  permissions: WorkerPermissions
  cloud: boolean
}

const allPermissions:WorkerPermissions={canProcessOrders:true,canRefund:true,canViewStock:true,canViewFinancials:true,allowedGames:[]}
const activeFromCloud=(u:CloudUser):ActiveWorker=>({id:u.id,name:u.name||u.email||'Worker',role:u.role||'worker',permissions:u.role==='owner'?allPermissions:{canProcessOrders:u.permissions?.canProcessOrders!==false,canRefund:Boolean(u.permissions?.canRefund),canViewStock:u.permissions?.canViewStock!==false,canViewFinancials:Boolean(u.permissions?.canViewFinancials),allowedGames:Array.isArray(u.allowedGames)?u.allowedGames:[]},cloud:true})
const fmt=(v?:string)=>v?new Date(v).toLocaleString('id-ID'):'-'

export default function WorkerPage(){
  const [configured,setConfigured]=useState(false)
  const [ready,setReady]=useState(false)
  const [active,setActive]=useState<ActiveWorker|null>(null)
  const [workers,setWorkers]=useState<Worker[]>([])
  const [products,setProductsState]=useState<Product[]>([])
  const [orders,setOrdersState]=useState<Order[]>([])
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [filter,setFilter]=useState<'Aktif'|'Selesai'|'Refund'>('Aktif')
  const [status,setStatus]=useState('Offline')
  const [screen,setScreen]=useState<'orders'|'payroll'>('orders')

  const hydrateLocal=()=>{const ps=loadProducts();setProductsState(ps);setOrdersState(loadOrders(ps));setWorkers(loadWorkers())}
  const hydrateCloud=async()=>{const d=await pullCloud();setProductsState(d.products);setOrdersState(d.orders);saveProducts(d.products);saveOrders(d.orders)}

  useEffect(()=>{
    hydrateLocal()
    const settings=loadSettings();document.documentElement.classList.remove('dark','light');if(settings.theme!=='system')document.documentElement.classList.add(settings.theme)
    ;(async()=>{
      try{
        const info=await cloudSessionInfo();setConfigured(info.configured)
        if(info.user){setActive(activeFromCloud(info.user));await hydrateCloud()}
        else setStatus(info.configured?'Cloud siap':'Mode lokal')
      }catch{setConfigured(false);setStatus('Mode lokal')}
      finally{setReady(true)}
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  useEffect(()=>{
    const onStorage=()=>{if(!configured&&!active?.cloud)hydrateLocal()};window.addEventListener('storage',onStorage)
    return()=>window.removeEventListener('storage',onStorage)
  },[configured,active?.cloud])

  useEffect(()=>{
    if(!active?.cloud)return
    let stop:(()=>void)|undefined;let cancelled=false
    ;(async()=>{try{const fn=await subscribeCloud(()=>void (async()=>{try{const latest=await cloudSessionInfo();if(latest.user)setActive(activeFromCloud(latest.user));await hydrateCloud()}catch{}})(),setStatus);if(cancelled)fn();else stop=fn}catch{setStatus('Realtime belum aktif')}})()
    return()=>{cancelled=true;stop?.()}
  },[active?.cloud,active?.id])

  const login=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');setBusy(true)
    try{
      if(configured){
        const u=await cloudSignIn(email.trim(),password)
        setActive(activeFromCloud(u));await hydrateCloud()
      }else{
        const found=workers.find(w=>w.enabled!==false&&w.username===email.trim()&&w.password===password)
        if(!found)throw new Error('Username atau sandi salah')
        const updated={...found,lastLogin:new Date().toISOString()};const next=workers.map(w=>w.id===found.id?updated:w);setWorkers(next);saveWorkers(next)
        setActive({id:found.id,name:found.name,role:'worker',permissions:found.permissions,cloud:false});appendAudit('Worker login',found.name,found.name)
      }
    }catch(err:any){setError(err.message||'Login gagal')}finally{setBusy(false)}
  }

  const logout=async()=>{if(active?.cloud)await cloudSignOut().catch(()=>null);if(active&&!active.cloud)appendAudit('Worker logout',active.name,active.name);setActive(null);setStatus(configured?'Cloud siap':'Mode lokal')}

  const allowed=(game:string)=>!active?.permissions.allowedGames.length||active.permissions.allowedGames.includes(game)
  const visibleProducts=useMemo(()=>products.filter(p=>allowed(p.game)),[products,active])
  const visibleOrders=useMemo(()=>orders.filter(o=>allowed(o.game)),[orders,active])
  const filtered=useMemo(()=>visibleOrders.filter(o=>filter==='Aktif'?(o.status==='Baru'||o.status==='Diproses'||o.status==='Menunggu'):filter==='Selesai'?o.status==='Selesai':(o.status==='Refund'||o.status==='Cancel')).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),[visibleOrders,filter])

  const transition=async(order:Order,next:OrderStatus)=>{
    if(!active)return
    if(active.role!=='owner'&&!active.permissions.canProcessOrders){setError('Akun kamu hanya memiliki akses lihat order');return}
    let reason='',restore=false
    if(next==='Refund'||next==='Cancel'){
      if(active.role!=='owner'&&!active.permissions.canRefund){setError('Kamu tidak memiliki izin refund/cancel');return}
      reason=prompt('Alasan refund/cancel:')?.trim()||'';if(!reason)return
      restore=confirm('Kembalikan stok ke persediaan?')
    }
    setBusy(true);setError('')
    try{
      if(active.cloud){await cloudAction('transitionOrder',{orderId:order.id,status:next,refundReason:reason,restoreStock:restore});await hydrateCloud()}
      else{
        if(['Baru','Diproses','Menunggu'].includes(order.status)&&order.assignedWorker&&order.assignedWorker!==active.name&&active.role!=='owner')throw new Error(`Order sedang dikerjakan ${order.assignedWorker}`)
        let ps=products
        if(restore&&!order.stockRestored&&order.productId)ps=products.map(p=>p.id===order.productId?{...p,stock:p.stock+order.qty}:p)
        const now=new Date().toISOString();const updated:Order={...order,status:next,assignedWorker:order.assignedWorker||active.name,assignedWorkerId:order.assignedWorkerId||active.id,processingAt:(next==='Diproses'||next==='Selesai')?(order.processingAt||now):order.processingAt,completedAt:['Selesai','Refund','Cancel'].includes(next)?now:order.completedAt,refundReason:reason||order.refundReason,stockRestored:Boolean(order.stockRestored||restore)}
        const os=orders.map(o=>o.id===order.id?updated:o);setProductsState(ps);saveProducts(ps);setOrdersState(os);saveOrders(os);appendAudit(`Worker: ${next}`,`${order.invoiceNo} · ${order.productName}`,active.name)
      }
    }catch(err:any){setError(err.message||'Update order gagal')}finally{setBusy(false)}
  }

  if(!ready)return <main className="min-h-screen bg-background"/>
  if(!active)return <main className="min-h-screen bg-background text-foreground"><section className="mx-auto flex min-h-screen max-w-md items-center px-4"><form onSubmit={login} className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm"><div><p className="text-xs font-black uppercase tracking-[.18em] text-primary">Itemku Profit V6.4.2</p><h1 className="mt-2 text-2xl font-black">Login Worker</h1><p className="mt-1 text-sm text-muted-foreground">{configured?'Masuk dengan akun Supabase. Permission dan game dikontrol Owner.':'Cloud belum dikonfigurasi; memakai akun Worker lokal sebagai fallback.'}</p></div><label className="grid gap-1.5 text-sm font-semibold">{configured?'Email Supabase':'Username'}<input autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label><label className="grid gap-1.5 text-sm font-semibold">Sandi<input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label>{error&&<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy?'Memproses...':'Masuk'}</button><a href="/" className="block text-center text-xs font-semibold text-muted-foreground">Kembali ke Owner</a></form></section></main>

  return <main className="min-h-screen bg-background pb-24 text-foreground md:pb-6">
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary">Itemku Profit V6.4.2 · Worker</p><h1 className="text-xl font-black">{active.name}</h1><p className="text-xs text-muted-foreground">{active.cloud?`${active.role} · ${status}`:'Mode lokal'}</p></div><div className="flex gap-2"><a href="/" className="rounded-lg border px-3 py-2 text-xs font-bold">Owner</a><button onClick={logout} className="rounded-lg border px-3 py-2 text-xs font-bold">Keluar</button></div></div></header>
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
      <div className="flex gap-2"><button onClick={()=>setScreen('orders')} className={`rounded-lg px-4 py-2 text-xs font-bold ${screen==='orders'?'bg-primary text-primary-foreground':'border bg-card'}`}>Pesanan</button><button onClick={()=>setScreen('payroll')} className={`rounded-lg px-4 py-2 text-xs font-bold ${screen==='payroll'?'bg-primary text-primary-foreground':'border bg-card'}`}>Gaji Saya</button></div>
      {screen==='orders'?<>
        <section className="grid gap-3 sm:grid-cols-3"><Metric label="Order aktif" value={String(visibleOrders.filter(o=>o.status==='Baru'||o.status==='Diproses'||o.status==='Menunggu').length)}/><Metric label="Sedang saya proses" value={String(visibleOrders.filter(o=>o.status==='Diproses'&&o.assignedWorker===active.name).length)}/><Metric label="Game diizinkan" value={active.permissions.allowedGames.length?String(active.permissions.allowedGames.length):'Semua'}/></section>
        <div className="hidden flex-wrap gap-2 md:flex">{(['Aktif','Selesai','Refund'] as const).map(x=><button key={x} onClick={()=>setFilter(x)} className={`rounded-lg px-4 py-2 text-xs font-bold ${filter===x?'bg-primary text-primary-foreground':'border bg-card'}`}>{x}</button>)}</div>
        <div className="space-y-3">{filtered.map(o=>{const product=visibleProducts.find(p=>p.id===o.productId);const mine=o.assignedWorker===active.name;const locked=['Baru','Diproses','Menunggu'].includes(o.status)&&Boolean(o.assignedWorker)&&!mine&&active.role!=='owner';return <article key={o.id} className={`rounded-2xl border bg-card p-4 shadow-sm ${locked?'opacity-70':''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{o.productName} × {o.qty}</strong><Badge text={o.status}/>{mine&&<span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">Punya saya</span>}</div><p className="mt-1 text-xs text-muted-foreground">{o.invoiceNo} · {o.game} · {fmt(o.createdAt)}</p></div>{(o.status==='Baru'||o.status==='Diproses'||o.status==='Menunggu')&&!locked&&(active.role==='owner'||active.permissions.canProcessOrders)&&<div className="flex flex-wrap gap-2">{(o.status==='Baru'||o.status==='Menunggu')&&<button disabled={busy} onClick={()=>transition(o,'Diproses')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Ambil / Proses</button>}<button disabled={busy} onClick={()=>transition(o,'Selesai')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Selesai</button>{(active.role==='owner'||active.permissions.canRefund)&&<button disabled={busy} onClick={()=>transition(o,'Refund')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">Refund</button>}</div>}</div><div className="mt-4 grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Pembeli" value={o.buyerIdentifier} copy/><Mini label="Server / UID" value={o.serverId||'-'} copy={Boolean(o.serverId)}/><Mini label="Catatan" value={o.note||'-'}/><Mini label="Nilai order" value={active.permissions.canViewFinancials||active.role==='owner'?money(o.snapshot.revenue):'Disembunyikan'}/>{active.permissions.canViewStock&&<Mini label="Stok saat ini" value={product?String(product.stock):'-'}/>}<Mini label="Worker" value={o.assignedWorker||'Belum diambil'}/></div>{locked&&<p className="mt-3 text-xs font-semibold text-amber-700">Order sedang dikerjakan {o.assignedWorker}.</p>}</article>})}{!filtered.length&&<p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Tidak ada order pada filter ini.</p>}</div>
      </>:active.cloud?<PayrollPanel role="worker"/>:<div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Gaji Saya tersedia saat Worker login melalui Supabase.</div>}
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card/95 p-2 backdrop-blur md:hidden">{(['Aktif','Selesai','Refund'] as const).map(x=><button key={x} onClick={()=>{setScreen('orders');setFilter(x)}} className={`rounded-xl px-2 py-3 text-xs font-black ${screen==='orders'&&filter===x?'bg-primary text-primary-foreground':'text-muted-foreground'}`}>{x}</button>)}<button onClick={()=>setScreen('payroll')} className={`rounded-xl px-2 py-3 text-xs font-black ${screen==='payroll'?'bg-primary text-primary-foreground':'text-muted-foreground'}`}>Gaji</button></nav>
  </main>
}

function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border bg-card p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div>}
function Badge({text}:{text:string}){const cls=text==='Selesai'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':text==='Refund'||text==='Cancel'?'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200':text==='Diproses'?'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200':'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200';return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${cls}`}>{text}</span>}
function Mini({label,value,copy=false}:{label:string;value:string;copy?:boolean}){return <div><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span><div className="mt-1 flex items-center gap-2"><p className="break-all text-sm font-semibold">{value}</p>{copy&&value&&value!=='-'&&<button onClick={()=>navigator.clipboard?.writeText(value)} className="rounded border px-1.5 py-0.5 text-[10px] font-bold">Copy</button>}</div></div>}
