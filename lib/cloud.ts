import type { AuditLog, BusinessTarget, CustomerNote, Expense, Opportunity, Order, PriceHistory, Product, Restock, WorkerPermissions } from './itemku'

export type CloudUser = { id:string; email?:string; role?:'owner'|'worker'; name?:string; permissions?:WorkerPermissions; allowedGames?:string[] }
export type WorkerNotification = { id:string; kind:string; level:'info'|'warn'|'danger'|'success'; title:string; detail:string; entityType?:string; entityId?:string; read:boolean; createdAt:string }
export type CloudBundle = { products:Product[]; orders:Order[]; opportunities:Opportunity[]; audit:AuditLog[]; restocks:Restock[]; customerNotes:CustomerNote[]; expenses:Expense[]; targets:BusinessTarget[]; priceHistory:PriceHistory[]; profiles:any[]; v4?:any }

async function api(path:string, init:RequestInit={}) {
  const res = await fetch(`/api/cloud${path}`, { ...init, headers:{'Content-Type':'application/json', ...(init.headers||{})}, cache:'no-store' })
  const text = await res.text()
  let data:any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(data?.error || data?.message || `Cloud error ${res.status}`)
  return data
}

export async function cloudSessionInfo():Promise<{user:CloudUser|null;configured:boolean}> { const d=await api('/session'); return {user:d?.user||null,configured:Boolean(d?.configured)} }
export async function cloudSession():Promise<CloudUser|null> { return (await cloudSessionInfo()).user }
export async function cloudSignIn(email:string,password:string):Promise<CloudUser> { const d=await api('/login',{method:'POST',body:JSON.stringify({email,password})}); return d.user }
export async function cloudSignOut(){ await api('/logout',{method:'POST'}) }
export async function pullCloud():Promise<CloudBundle> { return api('/data') }
export async function syncEntity(entity:string, data:any[], replace=false, deletedIds:string[]=[]){ return api('/data',{method:'POST',body:JSON.stringify({entity,data,replace,deletedIds})}) }
export async function pullCloudOrders(params:{limit?:number;offset?:number;search?:string;status?:string;game?:string}={}){const q=new URLSearchParams({entity:'orders',limit:String(params.limit||50),offset:String(params.offset||0)});if(params.search)q.set('search',params.search);if(params.status)q.set('status',params.status);if(params.game)q.set('game',params.game);return api(`/data?${q.toString()}`) as Promise<{orders:Order[];limit:number;offset:number;hasMore:boolean}>}
export async function pushAll(data:CloudBundle){
  const entities:[string,any[]][]=[['products',data.products],['orders',data.orders],['opportunities',data.opportunities],['audit_logs',data.audit],['restocks',data.restocks],['customer_notes',data.customerNotes],['expenses',data.expenses],['business_targets',data.targets],['price_history',data.priceHistory]]
  for(const [entity,rows] of entities) await syncEntity(entity,rows,true)
}
export async function cloudAction(action:string,payload:any={}) { return api('/action',{method:'POST',body:JSON.stringify({action,payload})}) }
export async function markNotificationsRead(ids?:string[]) { return cloudAction('markNotificationsRead',{ids:ids&&ids.length?ids:undefined}) }
export async function getRealtimeToken(){ return api('/realtime-token') as Promise<{url:string;anonKey:string;accessToken:string}> }

export async function subscribeCloud(onChange:()=>void, onStatus?:(status:string)=>void, debounceMs=0) {
  let closed=false, ws:WebSocket|null=null, heartbeat:any=null, reconnect:any=null, fireTimer:any=null
  // debounceMs menggabungkan ledakan event realtime menjadi satu refresh —
  // mencegah re-pull penuh mengganggu worker di tengah proses.
  const fire=()=>{ if(debounceMs>0){ if(fireTimer)clearTimeout(fireTimer); fireTimer=setTimeout(onChange,debounceMs) } else onChange() }
  const connect=async()=>{
    try{
      const cfg=await getRealtimeToken()
      if(closed)return
      const base=cfg.url.replace(/^http/,'ws').replace(/\/$/,'')
      ws=new WebSocket(`${base}/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.anonKey)}&vsn=1.0.0`)
      ws.onopen=()=>{
        onStatus?.('Realtime aktif')
        const join={topic:'realtime:itemku-v4',event:'phx_join',payload:{config:{broadcast:{self:false},presence:{key:''},postgres_changes:[
          {event:'*',schema:'public',table:'orders'}, {event:'*',schema:'public',table:'products'}, {event:'*',schema:'public',table:'restocks'}, {event:'*',schema:'public',table:'customer_notes'}, {event:'*',schema:'public',table:'expenses'}, {event:'*',schema:'public',table:'business_targets'}, {event:'*',schema:'public',table:'opportunities'}, {event:'*',schema:'public',table:'price_history'}, {event:'*',schema:'public',table:'audit_logs'}, {event:'*',schema:'public',table:'profiles'}, {event:'*',schema:'public',table:'channel_rules'}, {event:'*',schema:'public',table:'suppliers'}, {event:'*',schema:'public',table:'purchase_orders'}, {event:'*',schema:'public',table:'inventory_ledger'}, {event:'*',schema:'public',table:'settlements'}, {event:'*',schema:'public',table:'disputes'}, {event:'*',schema:'public',table:'automation_rules'}, {event:'*',schema:'public',table:'notifications'}, {event:'*',schema:'public',table:'dashboard_preferences'}, {event:'*',schema:'public',table:'customer_tags'},
        ]},access_token:cfg.accessToken},ref:'1'}
        ws?.send(JSON.stringify(join))
        heartbeat=setInterval(()=>{ if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:String(Date.now())})) },25000)
      }
      ws.onmessage=(ev)=>{ try{const m=JSON.parse(ev.data); if(m.event==='postgres_changes'||m.event==='broadcast') fire()}catch{} }
      ws.onerror=()=>onStatus?.('Realtime terganggu')
      ws.onclose=()=>{ if(heartbeat)clearInterval(heartbeat); onStatus?.('Realtime terputus'); if(!closed)reconnect=setTimeout(connect,2500) }
    }catch{ onStatus?.('Realtime belum aktif'); if(!closed)reconnect=setTimeout(connect,5000) }
  }
  await connect()
  return ()=>{closed=true;if(heartbeat)clearInterval(heartbeat);if(reconnect)clearTimeout(reconnect);if(fireTimer)clearTimeout(fireTimer);try{ws?.close()}catch{}}
}
