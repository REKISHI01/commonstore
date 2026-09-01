// Antrean aksi worker saat offline. Tersimpan di localStorage dan dikirim ulang
// otomatis ketika kembali online. Aksi yang ditolak permanen oleh server
// (permission/lock/konflik) dibuang dari antrean dan dilaporkan ke pemanggil.

const QUEUE_KEY = 'itemkuWorkerActionQueue'

export type QueuedAction = { id:string; action:string; payload:any; queuedAt:string; tries:number }

export function loadQueue():QueuedAction[]{ try{ const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'); return Array.isArray(q)?q:[] }catch{ return [] } }
function saveQueue(q:QueuedAction[]){ try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) }catch{} }
export function enqueueAction(action:string, payload:any):QueuedAction[]{
  const q=[...loadQueue(), { id:`q_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, action, payload, queuedAt:new Date().toISOString(), tries:0 }]
  saveQueue(q); return q
}
function dequeue(id:string){ saveQueue(loadQueue().filter(x=>x.id!==id)) }

export function isNetworkError(e:unknown):boolean{
  return e instanceof TypeError || /failed to fetch|networkerror|load failed|internet disconnected/i.test(String((e as any)?.message||e))
}

// Kirim seluruh antrean secara berurutan. Berhenti di item pertama yang masih
// gagal jaringan (sisanya tetap antre); item yang ditolak server dibuang.
export async function flushWorkerQueue():Promise<{ sent:number; dropped:{id:string; reason:string}[] }>{
  const dropped:{id:string; reason:string}[]=[]; let sent=0
  for(const item of loadQueue()){
    try{
      const res=await fetch('/api/cloud/action',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:item.action, payload:item.payload}), cache:'no-store' })
      if(res.ok){ dequeue(item.id); sent++; continue }
      const data=await res.json().catch(()=>null)
      dropped.push({ id:item.id, reason:data?.error||`Gagal ${res.status}` }); dequeue(item.id)
    }catch(e){
      if(isNetworkError(e)) break
      dropped.push({ id:item.id, reason:String((e as any)?.message||e) }); dequeue(item.id)
    }
  }
  return { sent, dropped }
}
