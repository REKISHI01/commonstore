'use client'
import { useEffect } from 'react'
import { appendClientError } from '../lib/v51'
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{appendClientError({message:error.message||'Dashboard error',source:error.digest?`next-error:${error.digest}`:'next-error-boundary'})},[error])
  return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"><section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-[.18em] text-red-600">Recovery Mode · V6.4.2</p><h1 className="mt-2 text-2xl font-black">Dashboard mengalami error</h1><p className="mt-3 text-sm text-muted-foreground">Data lokal tidak otomatis dihapus. Coba muat ulang modul; jika masih gagal, buka Observability Center dan Recovery Center untuk diagnosis atau rollback.</p><pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-muted p-3 text-[11px]">{error.message||'Unknown error'}</pre><div className="mt-5 flex flex-wrap gap-2"><button className="btn-primary" onClick={reset}>Coba Lagi</button><button className="btn-secondary" onClick={()=>location.assign('/')}>Kembali ke Dashboard</button></div></section></main>
}
