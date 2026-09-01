'use client'

import { id } from './itemku'
import { loadSyncQueue, saveSyncQueue, type SyncMutation, type SyncState } from './v4'

async function postMutation(m:SyncMutation){
  const res=await fetch('/api/cloud/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:m.entity,data:m.upserts,replace:false,deletedIds:m.deletedIds})})
  const text=await res.text();let body:any=null;try{body=text?JSON.parse(text):null}catch{body=text}
  if(!res.ok)throw new Error(body?.error||`Sync error ${res.status}`)
}

export function diffRows<T extends {id:string}>(before:T[],after:T[]){
  const old=new Map(before.map(x=>[x.id,JSON.stringify(x)]));
  const now=new Map(after.map(x=>[x.id,JSON.stringify(x)]));
  const upserts=after.filter(x=>old.get(x.id)!==JSON.stringify(x));
  const deletedIds=before.filter(x=>!now.has(x.id)).map(x=>x.id);
  return {upserts,deletedIds}
}

export async function queueDelta<T extends {id:string}>(entity:string,before:T[],after:T[],onState?:(s:SyncState)=>void){
  const {upserts,deletedIds}=diffRows(before,after);if(!upserts.length&&!deletedIds.length)return
  const mutation:SyncMutation={id:id('sync'),entity,upserts,deletedIds,createdAt:new Date().toISOString(),tries:0}
  const q=[...loadSyncQueue(),mutation];saveSyncQueue(q);onState?.(navigator.onLine?'pending':'offline')
  if(navigator.onLine)await flushSyncQueue(onState)
}

export async function queueUpserts(entity:string,upserts:any[],deletedIds:string[]=[],onState?:(s:SyncState)=>void){
  if(!upserts.length&&!deletedIds.length)return
  const q=[...loadSyncQueue(),{id:id('sync'),entity,upserts,deletedIds,createdAt:new Date().toISOString(),tries:0}];saveSyncQueue(q);onState?.(navigator.onLine?'pending':'offline');if(navigator.onLine)await flushSyncQueue(onState)
}

export async function flushSyncQueue(onState?:(s:SyncState)=>void){
  let q=loadSyncQueue();if(!q.length){onState?.('synced');return}if(!navigator.onLine){onState?.('offline');return}
  onState?.('pending')
  for(const m of [...q]){
    try{await postMutation(m);q=q.filter(x=>x.id!==m.id);saveSyncQueue(q)}catch(e:any){q=q.map(x=>x.id===m.id?{...x,tries:x.tries+1,lastError:e.message||'Sync gagal'}:x);saveSyncQueue(q);onState?.('error');return}
  }
  onState?.('synced')
}

export function bindSyncQueue(onState?:(s:SyncState)=>void){
  const run=()=>void flushSyncQueue(onState)
  const offline=()=>onState?.('offline')
  window.addEventListener('online',run)
  window.addEventListener('offline',offline)
  run()
  return()=>{window.removeEventListener('online',run);window.removeEventListener('offline',offline)}
}

