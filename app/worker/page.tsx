'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  appendAudit, loadOrders, loadProducts, loadSettings, loadWorkers, money, saveOrders, saveProducts, saveWorkers,
  type Order, type OrderStatus, type Product, type Worker, type WorkerPermissions,
} from '../../lib/itemku'
import {
  cloudAction, cloudSessionInfo, cloudSignIn, cloudSignOut, markNotificationsRead, pullCloud, subscribeCloud,
  type CloudUser, type WorkerNotification,
} from '../../lib/cloud'
import PayrollPanel from '../../components/payroll/PayrollPanel'
import { ConfirmDialog, RefundDialog, Modal } from '../../components/worker/Dialogs'
import { enqueueAction, flushWorkerQueue, isNetworkError, loadQueue } from '../../lib/worker-offline'

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
const fmtShort=(v?:string)=>v?new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'-'
const BOARD:OrderStatus[]=['Baru','Diproses','Menunggu','Selesai']
const levelDot:Record<string,string>={info:'bg-blue-500',warn:'bg-amber-500',danger:'bg-red-500',success:'bg-emerald-500'}
const fmtMinutes=(m:number)=>m>=60?`${Math.floor(m/60)}j ${m%60}m`:`${m}m`

const UI_KEY='itemkuWorkerUi'
const loadUi=<T,>(k:string,def:T):T=>{try{const s=JSON.parse(localStorage.getItem(UI_KEY)||'{}');return (s[k] as T)??def}catch{return def}}
const saveUi=(patch:Record<string,unknown>)=>{try{localStorage.setItem(UI_KEY,JSON.stringify({...JSON.parse(localStorage.getItem(UI_KEY)||'{}'),...patch}))}catch{}}

export default function WorkerPage(){
  const [configured,setConfigured]=useState(false)
  const [ready,setReady]=useState(false)
  const [active,setActive]=useState<ActiveWorker|null>(null)
  const [workers,setWorkers]=useState<Worker[]>([])
  const [products,setProductsState]=useState<Product[]>([])
  const [orders,setOrdersState]=useState<Order[]>([])
  const [notifs,setNotifs]=useState<WorkerNotification[]>([])
  const [notifOpen,setNotifOpen]=useState(false)
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [filter,setFilter]=useState<'Aktif'|'Selesai'|'Refund'>(()=>loadUi<'Aktif'|'Selesai'|'Refund'>('filter','Aktif'))
  const [scope,setScope]=useState<'Semua'|'Saya'>(()=>loadUi<'Semua'|'Saya'>('scope','Semua'))
  const [view,setView]=useState<'list'|'board'>(()=>loadUi<'list'|'board'>('view','list'))
  const [search,setSearch]=useState('')
  const [status,setStatus]=useState('Offline')
  const [screen,setScreen]=useState<'orders'|'kinerja'|'payroll'>(()=>loadUi<'orders'|'kinerja'|'payroll'>('screen','orders'))
  const [pending,setPending]=useState<{order:Order;mode:'selesai'|'refund'}|null>(null)
  const [paidTotal,setPaidTotal]=useState<number|null>(null)
  const [queueLen,setQueueLen]=useState(0)
  const [info,setInfo]=useState('')

  const hydrateLocal=()=>{const ps=loadProducts();setProductsState(ps);setOrdersState(loadOrders(ps));setWorkers(loadWorkers())}
  const hydrateCloud=async()=>{const d=await pullCloud();setProductsState(d.products);setOrdersState(d.orders);setNotifs(d.v4?.notifications||[]);saveProducts(d.products);saveOrders(d.orders)}

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
    ;(async()=>{try{const fn=await subscribeCloud(()=>void (async()=>{try{const latest=await cloudSessionInfo();if(latest.user)setActive(activeFromCloud(latest.user));await hydrateCloud()}catch{}})(),setStatus,1000);if(cancelled)fn();else stop=fn}catch{setStatus('Realtime belum aktif')}})()
    return()=>{cancelled=true;stop?.()}
  },[active?.cloud,active?.id])

  useEffect(()=>{saveUi({screen,filter,scope,view})},[screen,filter,scope,view])

  const loadPaidTotal=async()=>{if(!active?.cloud)return;setPaidTotal(null);try{const r=await fetch('/api/payroll',{cache:'no-store'});const j=await r.json();if(r.ok)setPaidTotal((j.slips||[]).filter((s:any)=>s.run?.status==='paid').reduce((a:number,s:any)=>a+(Number(s.item?.totalPay)||0),0))}catch{}}
  useEffect(()=>{if(screen==='kinerja')void loadPaidTotal()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen,active?.cloud])

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

  const logout=async()=>{if(active?.cloud)await cloudSignOut().catch(()=>null);if(active&&!active.cloud)appendAudit('Worker logout',active.name,active.name);setActive(null);setNotifs([]);setInfo('');setStatus(configured?'Cloud siap':'Mode lokal')}

  const allowed=(game:string)=>!active?.permissions.allowedGames.length||active.permissions.allowedGames.includes(game)
  const visibleProducts=useMemo(()=>products.filter(p=>allowed(p.game)),[products,active])
  const visibleOrders=useMemo(()=>orders.filter(o=>allowed(o.game)),[orders,active])
  const isMine=(o:Order)=>o.assignedWorkerId===active?.id||o.assignedWorker===active?.name
  const matchesSearch=(o:Order)=>{const s=search.trim().toLowerCase();if(!s)return true;return[o.invoiceNo,o.buyerIdentifier,o.productName,o.game,o.serverId].some(x=>String(x||'').toLowerCase().includes(s))}
  const scoped=useMemo(()=>visibleOrders.filter(o=>scope==='Saya'?isMine(o):true),[visibleOrders,scope,active])
  const filtered=useMemo(()=>scoped.filter(o=>matchesSearch(o)).filter(o=>filter==='Aktif'?(o.status==='Baru'||o.status==='Diproses'||o.status==='Menunggu'):filter==='Selesai'?o.status==='Selesai':(o.status==='Refund'||o.status==='Cancel')).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),[scoped,filter,search])
  const board=useMemo(()=>{const base=scope==='Saya'?scoped.filter(o=>isMine(o)):scoped.filter(o=>isMine(o)||!o.assignedWorker);return BOARD.map(s=>({status:s,items:base.filter(o=>o.status===s&&matchesSearch(o)).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())}))},[scoped,scope,search,active])
  const unread=notifs.filter(n=>!n.read).length
  const myOrders=useMemo(()=>visibleOrders.filter(o=>isMine(o)),[visibleOrders,active])
  const myDone=myOrders.filter(o=>o.status==='Selesai')
  const myActive=myOrders.filter(o=>o.status==='Baru'||o.status==='Diproses'||o.status==='Menunggu')
  const myRefunded=myOrders.filter(o=>o.status==='Refund'||o.status==='Cancel')
  const monthNow=new Date().toISOString().slice(0,7)
  const doneThisMonth=myDone.filter(o=>(o.completedAt||'').slice(0,7)===monthNow)
  const avgMinutes=myDone.length?Math.round(myDone.reduce((a,o)=>a+((o.completedAt?new Date(o.completedAt).getTime():0)-(o.processingAt?new Date(o.processingAt).getTime():new Date(o.createdAt).getTime()))/60000,0)/myDone.length):0
  const refundRate=(myDone.length+myRefunded.length)?Math.round(myRefunded.length/(myDone.length+myRefunded.length)*100):0

  const markRead=async(ids?:string[])=>{
    try{await markNotificationsRead(ids);setNotifs(ns=>ns.map(n=>(!ids||!ids.length||ids.includes(n.id))?{...n,read:true}:n))}
    catch(err:any){setError(err.message||'Gagal menandai dibaca')}
  }

  const applyLocalTransition=(order:Order,next:OrderStatus,reason:string,restore:boolean)=>{
    if(!active)return
    if(['Baru','Diproses','Menunggu'].includes(order.status)&&order.assignedWorker&&order.assignedWorker!==active.name&&active.role!=='owner')throw new Error(`Order sedang dikerjakan ${order.assignedWorker}`)
    let ps=products
    if(restore&&!order.stockRestored&&order.productId)ps=products.map(p=>p.id===order.productId?{...p,stock:p.stock+order.qty}:p)
    const now=new Date().toISOString();const updated:Order={...order,status:next,assignedWorker:order.assignedWorker||active.name,assignedWorkerId:order.assignedWorkerId||active.id,processingAt:(next==='Diproses'||next==='Selesai')?(order.processingAt||now):order.processingAt,completedAt:['Selesai','Refund','Cancel'].includes(next)?now:order.completedAt,refundReason:reason||order.refundReason,stockRestored:Boolean(order.stockRestored||restore)}
    const os=orders.map(o=>o.id===order.id?updated:o);setProductsState(ps);saveProducts(ps);setOrdersState(os);saveOrders(os);appendAudit(`Worker: ${next}`,`${order.invoiceNo} · ${order.productName}`,active.name)
  }

  const doTransition=async(order:Order,next:OrderStatus,reason='',restore=false)=>{
    if(!active)return
    setBusy(true);setError('');setInfo('')
    try{
      if(active.cloud){
        try{await cloudAction('transitionOrder',{orderId:order.id,status:next,refundReason:reason,restoreStock:restore});await hydrateCloud()}
        catch(err:any){
          if(!isNetworkError(err))throw err
          // Offline: tampilkan niat di layar + masuk antrean; terkirim otomatis saat online.
          applyLocalTransition(order,next,reason,restore)
          setQueueLen(enqueueAction('transitionOrder',{orderId:order.id,status:next,refundReason:reason,restoreStock:restore}).length)
          setInfo('Sinyal hilang — perubahan disimpan di perangkat dan otomatis dikirim saat kembali online.')
        }
      }
      else applyLocalTransition(order,next,reason,restore)
    }catch(err:any){setError(err.message||'Update order gagal')}finally{setBusy(false);setPending(null)}
  }

  const flushNow=async()=>{
    if(!active?.cloud||!loadQueue().length)return
    try{
      const r=await flushWorkerQueue();setQueueLen(loadQueue().length)
      if(r.dropped.length)setError(`${r.dropped.length} perubahan ditolak server (${r.dropped[0].reason}). Data disegarkan.`)
      if(r.sent){setInfo(`${r.sent} perubahan tersinkron.`);await hydrateCloud()}
    }catch{}
  }

  useEffect(()=>{
    if(!active?.cloud)return
    setQueueLen(loadQueue().length)
    const onOnline=()=>void flushNow()
    const onVisible=()=>{if(document.visibilityState==='visible')void flushNow()}
    window.addEventListener('online',onOnline);document.addEventListener('visibilitychange',onVisible)
    void flushNow()
    return()=>{window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange',onVisible)}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active?.cloud,active?.id])

  const transition=(order:Order,next:OrderStatus)=>{
    if(!active)return
    if(active.role!=='owner'&&!active.permissions.canProcessOrders){setError('Akun kamu hanya memiliki akses lihat order');return}
    if(next==='Refund'){
      if(active.role!=='owner'&&!active.permissions.canRefund){setError('Kamu tidak memiliki izin refund/cancel');return}
      setPending({order,mode:'refund'});return
    }
    if(next==='Selesai'){setPending({order,mode:'selesai'});return}
    void doTransition(order,next)
  }

  if(!ready)return <main className="min-h-screen bg-background"/>
  if(!active)return <main className="min-h-screen bg-background text-foreground"><section className="mx-auto flex min-h-screen max-w-md items-center px-4"><form onSubmit={login} className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm"><div><p className="text-xs font-black uppercase tracking-[.18em] text-primary">Itemku Profit V6.4.2 · Worker</p><h1 className="mt-2 text-2xl font-black">Login Worker</h1><p className="mt-1 text-sm text-muted-foreground">{configured?'Masuk dengan akun Supabase. Permission dan game dikontrol Owner.':'Cloud belum dikonfigurasi; memakai akun Worker lokal sebagai fallback.'}</p></div><label className="grid gap-1.5 text-sm font-semibold">{configured?'Email Supabase':'Username'}<input autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label><label className="grid gap-1.5 text-sm font-semibold">Sandi<input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label>{error&&<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy?'Memproses...':'Masuk'}</button><a href="/" className="block text-center text-xs font-semibold text-muted-foreground">Kembali ke Owner</a></form></section></main>

  return <main className="min-h-screen bg-background pb-24 text-foreground md:pb-6">
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary">Itemku Profit V6.4.2 · Worker</p><h1 className="text-xl font-black">{active.name}</h1><p className="text-xs text-muted-foreground">{active.cloud?`${active.role} · ${status}`:'Mode lokal'}</p></div><div className="flex items-center gap-2">{active.cloud&&queueLen>0&&<button onClick={()=>void flushNow()} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">⏳ {queueLen} menunggu sinkron</button>}{active.cloud&&<button onClick={()=>setNotifOpen(true)} aria-label="Notifikasi" className="relative rounded-lg border px-3 py-2 text-sm">🔔{unread>0&&<span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{unread>99?'99+':unread}</span>}</button>}<a href="/" className="rounded-lg border px-3 py-2 text-xs font-bold">Owner</a><button onClick={logout} className="rounded-lg border px-3 py-2 text-xs font-bold">Keluar</button></div></div></header>
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
      {info&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{info}</div>}
      <div className="flex flex-wrap gap-2">{(['orders','kinerja','payroll'] as const).map((s,i)=><button key={s} onClick={()=>setScreen(s)} className={`rounded-lg px-4 py-2 text-xs font-bold ${screen===s?'bg-primary text-primary-foreground':'border bg-card'}`}>{['Pesanan','Kinerja','Gaji Saya'][i]}</button>)}</div>
      {screen==='orders'?<>
        <section className="grid gap-3 sm:grid-cols-3"><Metric label="Order aktif" value={String(visibleOrders.filter(o=>o.status==='Baru'||o.status==='Diproses'||o.status==='Menunggu').length)}/><Metric label="Sedang saya proses" value={String(visibleOrders.filter(o=>o.status==='Diproses'&&isMine(o)).length)}/><Metric label="Game diizinkan" value={active.permissions.allowedGames.length?String(active.permissions.allowedGames.length):'Semua'}/></section>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari invoice / pembeli / produk / game..." className="h-10 min-w-52 flex-1 rounded-lg border bg-background px-3 text-sm"/>
          <div className="flex overflow-hidden rounded-lg border"><button onClick={()=>setView('list')} className={`px-3 py-2 text-xs font-bold ${view==='list'?'bg-primary text-primary-foreground':'bg-card'}`}>List</button><button onClick={()=>setView('board')} className={`px-3 py-2 text-xs font-bold ${view==='board'?'bg-primary text-primary-foreground':'bg-card'}`}>Papan</button></div>
          <div className="flex overflow-hidden rounded-lg border">{(['Semua','Saya'] as const).map(s=><button key={s} onClick={()=>setScope(s)} className={`px-3 py-2 text-xs font-bold ${scope===s?'bg-primary text-primary-foreground':'bg-card'}`}>{s==='Saya'?'Order saya':s}</button>)}</div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">{(['Aktif','Selesai','Refund'] as const).map(x=><button key={x} onClick={()=>setFilter(x)} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-bold ${filter===x?'bg-primary text-primary-foreground':'border bg-card'}`}>{x}</button>)}</div>
        {view==='board'?<div className="grid gap-3 md:grid-cols-4">{board.map(col=><section key={col.status} className="rounded-2xl border bg-card p-3"><div className="flex items-center justify-between px-1 pb-2"><Badge text={col.status}/><span className="text-xs font-bold text-muted-foreground">{col.items.length}</span></div><div className="space-y-2">{col.items.slice(0,30).map(o=>{const product=visibleProducts.find(p=>p.id===o.productId);const mine=isMine(o);return <article key={o.id} className="rounded-xl border bg-background p-3"><div className="flex flex-wrap items-center gap-1.5"><strong className="text-xs">{o.productName} × {o.qty}</strong>{mine&&<span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">Saya</span>}</div><p className="mt-1 text-[10px] text-muted-foreground">{o.invoiceNo} · {fmtShort(o.createdAt)}</p><p className="text-[11px] font-semibold">{o.buyerIdentifier}</p>{active.permissions.canViewStock&&product&&<p className="text-[10px] text-muted-foreground">Stok: {product.stock}</p>}{(o.status==='Baru'||o.status==='Menunggu')&&(active.role==='owner'||active.permissions.canProcessOrders)&&<button disabled={busy} onClick={()=>transition(o,'Diproses')} className="mt-2 w-full rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white">Ambil / Proses</button>}{o.status==='Diproses'&&mine&&(active.role==='owner'||active.permissions.canProcessOrders)&&<button disabled={busy} onClick={()=>transition(o,'Selesai')} className="mt-2 w-full rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-bold text-white">Selesai</button>}</article>})}{!col.items.length&&<p className="py-6 text-center text-[11px] text-muted-foreground">Kosong</p>}</div></section>)}</div>
        :<div className="space-y-3">{filtered.map(o=>{const product=visibleProducts.find(p=>p.id===o.productId);const mine=isMine(o);const locked=['Baru','Diproses','Menunggu'].includes(o.status)&&Boolean(o.assignedWorker)&&!mine&&active.role!=='owner';return <article key={o.id} className={`rounded-2xl border bg-card p-4 shadow-sm ${locked?'opacity-70':''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{o.productName} × {o.qty}</strong><Badge text={o.status}/>{mine&&<span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">Punya saya</span>}{['Baru','Menunggu'].includes(o.status)&&Date.now()-new Date(o.createdAt).getTime()>=30*60000&&<span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">⏳ Menunggu {fmtMinutes(Math.round((Date.now()-new Date(o.createdAt).getTime())/60000))}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{o.invoiceNo} · {o.game} · {fmt(o.createdAt)}</p></div>{(o.status==='Baru'||o.status==='Diproses'||o.status==='Menunggu')&&!locked&&(active.role==='owner'||active.permissions.canProcessOrders)&&<div className="flex flex-wrap gap-2">{(o.status==='Baru'||o.status==='Menunggu')&&<button disabled={busy} onClick={()=>transition(o,'Diproses')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Ambil / Proses</button>}<button disabled={busy} onClick={()=>transition(o,'Selesai')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Selesai</button>{(active.role==='owner'||active.permissions.canRefund)&&<button disabled={busy} onClick={()=>transition(o,'Refund')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">Refund</button>}</div>}</div><div className="mt-4 grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Pembeli" value={o.buyerIdentifier} copy/><Mini label="Server / UID" value={o.serverId||'-'} copy={Boolean(o.serverId)}/><Mini label="Catatan" value={o.note||'-'}/><Mini label="Nilai order" value={active.permissions.canViewFinancials||active.role==='owner'?money(o.snapshot.revenue):'Disembunyikan'}/>{active.permissions.canViewStock&&<Mini label="Stok saat ini" value={product?String(product.stock):'-'}/>}<Mini label="Worker" value={o.assignedWorker||'Belum diambil'}/></div>{locked&&<p className="mt-3 text-xs font-semibold text-amber-700">Order sedang dikerjakan {o.assignedWorker}.</p>}</article>})}{!filtered.length&&<p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Tidak ada order pada filter ini.</p>}</div>}
      </>:screen==='kinerja'?<>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Selesai bulan ini" value={String(doneThisMonth.length)}/><Metric label="Selesai total" value={String(myDone.length)}/><Metric label="Rata-rata waktu proses" value={myDone.length?fmtMinutes(Math.max(0,avgMinutes)):'-'}/><Metric label="Tingkat refund" value={`${refundRate}%`}/></section>
        <section className="grid gap-3 sm:grid-cols-3"><Metric label="Order aktif saya" value={String(myActive.length)}/><Metric label="Gaji sudah dibayar" value={active.cloud?paidTotal===null?'Memuat...':money(paidTotal):'Mode lokal'}/><Metric label="Game diizinkan" value={active.permissions.allowedGames.length?String(active.permissions.allowedGames.length):'Semua'}/></section>
        <div className="rounded-2xl border bg-card p-4 shadow-sm"><h2 className="text-sm font-black">Order selesai terakhir</h2><div className="mt-3 space-y-2">{[...myDone].sort((a,b)=>new Date(b.completedAt||b.createdAt).getTime()-new Date(a.completedAt||a.createdAt).getTime()).slice(0,10).map(o=><div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2"><div><p className="text-sm font-bold">{o.productName} × {o.qty}</p><p className="text-xs text-muted-foreground">{o.invoiceNo} · {fmtShort(o.completedAt||o.createdAt)}</p></div><div className="flex items-center gap-2">{active.permissions.canViewFinancials||active.role==='owner'?<span className="text-sm font-bold">{money(o.snapshot.revenue)}</span>:null}<Badge text={o.status}/></div></div>)}{!myDone.length&&<p className="py-6 text-center text-sm text-muted-foreground">Belum ada order selesai. Kerjakan order dari tab Pesanan!</p>}</div></div>
      </>:active.cloud?<PayrollPanel role="worker"/>:<div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Gaji Saya tersedia saat Worker login melalui Supabase.</div>}
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-card/95 p-2 backdrop-blur md:hidden">{(['orders','kinerja','payroll'] as const).map((s,i)=><button key={s} onClick={()=>setScreen(s)} className={`rounded-xl px-2 py-3 text-xs font-black ${screen===s?'bg-primary text-primary-foreground':'text-muted-foreground'}`}>{['Pesanan','Kinerja','Gaji'][i]}</button>)}</nav>

    <Modal open={notifOpen&&active.cloud} onClose={()=>setNotifOpen(false)} title={`Notifikasi${unread?` (${unread} baru)`:''}`} maxW="max-w-lg" footer={unread>0?<button onClick={()=>markRead()} className="rounded-lg border px-4 py-2 text-xs font-bold">Tandai semua dibaca</button>:null}>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {notifs.slice(0,50).map(n=><div key={n.id} className={`rounded-xl border p-3 ${n.read?'opacity-60':''}`}><div className="flex items-start justify-between gap-2"><div className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${levelDot[n.level]||levelDot.info}`}/><div><p className="text-sm font-bold">{n.title}</p><p className="text-xs text-muted-foreground">{n.detail}</p><p className="mt-1 text-[10px] text-muted-foreground">{fmtShort(n.createdAt)}</p></div></div>{!n.read&&<button onClick={()=>markRead([n.id])} className="shrink-0 rounded border px-2 py-1 text-[10px] font-bold">Dibaca</button>}</div></div>)}
        {!notifs.length&&<p className="py-10 text-center text-sm text-muted-foreground">Belum ada notifikasi. Order baru dan penugasan akan muncul di sini.</p>}
      </div>
    </Modal>
    <ConfirmDialog open={pending?.mode==='selesai'} onClose={()=>setPending(null)} onConfirm={restore=>void doTransition(pending!.order,'Selesai','',restore)} title="Selesaikan order?" message={<span>{pending?`${pending.order.productName} × ${pending.order.qty} — ${pending.order.invoiceNo}`:''} akan ditandai <strong>Selesai</strong>.</span>} confirmText="Ya, Selesaikan" checkbox={{label:'Kembalikan stok ke persediaan'}}/>
    <RefundDialog open={Boolean(pending?.mode==='refund'&&pending)} onClose={()=>setPending(null)} onConfirm={(reason,restore)=>void doTransition(pending!.order,'Refund',reason,restore)} orderLabel={pending?`${pending.order.invoiceNo} · ${pending.order.productName} × ${pending.order.qty}`:''}/>
  </main>
}

function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border bg-card p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div>}
function Badge({text}:{text:string}){const cls=text==='Selesai'?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':text==='Refund'||text==='Cancel'?'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200':text==='Diproses'?'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200':'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200';return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${cls}`}>{text}</span>}
function Mini({label,value,copy=false}:{label:string;value:string;copy?:boolean}){return <div><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span><div className="mt-1 flex items-center gap-2"><p className="break-all text-sm font-semibold">{value}</p>{copy&&value&&value!=='-'&&<button onClick={()=>navigator.clipboard?.writeText(value)} className="rounded border px-1.5 py-0.5 text-[10px] font-bold">Copy</button>}</div></div>}
