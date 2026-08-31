'use client'
import { useEffect } from 'react'
import { appendClientError } from '../lib/v51'
export default function ClientMonitor(){
  useEffect(()=>{
    const onError=(e:ErrorEvent)=>appendClientError({message:e.message||'Client error',source:e.filename?`${e.filename}:${e.lineno||0}`:'window.error'})
    const onReject=(e:PromiseRejectionEvent)=>appendClientError({message:typeof e.reason==='string'?e.reason:e.reason?.message||'Unhandled promise rejection',source:'unhandledrejection'})
    window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onReject)
    return()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject)}
  },[])
  return null
}
