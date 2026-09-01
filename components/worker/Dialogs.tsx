'use client'

import { useEffect, useRef, useState } from 'react'

export function Modal({open,onClose,title,children,footer,maxW='max-w-md'}:{
  open:boolean;onClose:()=>void;title:string;children:React.ReactNode;footer?:React.ReactNode;maxW?:string
}){
  const box=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open)return
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()}
    document.addEventListener('keydown',onKey)
    box.current?.querySelector<HTMLElement>('input,textarea,button')?.focus()
    return()=>document.removeEventListener('keydown',onKey)
  },[open,onClose])
  if(!open)return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden/>
    <div ref={box} role="dialog" aria-modal="true" aria-label={title} className={`relative w-full ${maxW} rounded-2xl border bg-card p-5 shadow-xl`}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-base font-black">{title}</h2><button onClick={onClose} aria-label="Tutup" className="rounded-lg border px-2 py-1 text-xs font-bold">✕</button></div>
      <div className="mt-3">{children}</div>
      {footer&&<div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>}
    </div>
  </div>
}

export function ConfirmDialog({open,onClose,onConfirm,title,message,confirmText='Ya, lanjutkan',checkbox}:{
  open:boolean;onClose:()=>void;onConfirm:(restore:boolean)=>void;title:string;message:React.ReactNode;confirmText?:string
  checkbox?:{label:string;initial?:boolean}
}){
  const [restore,setRestore]=useState(false)
  useEffect(()=>{if(open)setRestore(Boolean(checkbox?.initial))},[open,checkbox?.initial])
  return <Modal open={open} onClose={onClose} title={title} footer={<>
    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold">Batal</button>
    <button onClick={()=>onConfirm(restore)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">{confirmText}</button>
  </>}>
    <div className="space-y-3 text-sm text-muted-foreground">{message}</div>
    {checkbox&&<label className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm font-semibold"><input type="checkbox" checked={restore} onChange={e=>setRestore(e.target.checked)}/>{checkbox.label}</label>}
  </Modal>
}

export function RefundDialog({open,onClose,onConfirm,orderLabel}:{
  open:boolean;onClose:()=>void;onConfirm:(reason:string,restore:boolean)=>void;orderLabel:string
}){
  const [reason,setReason]=useState('')
  const [restore,setRestore]=useState(false)
  const [err,setErr]=useState('')
  useEffect(()=>{if(open){setReason('');setRestore(false);setErr('')}},[open])
  return <Modal open={open} onClose={onClose} title="Refund / Cancel order" footer={<>
    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold">Batal</button>
    <button onClick={()=>{const r=reason.trim();if(!r){setErr('Alasan wajib diisi');return}onConfirm(r,restore)}} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white">Kirim refund</button>
  </>}>
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{orderLabel}</p>
      <label className="grid gap-1.5 text-sm font-semibold">Alasan refund/cancel
        <textarea value={reason} onChange={e=>{setReason(e.target.value);setErr('')}} rows={3} className="rounded-lg border bg-background p-3 font-normal text-sm" placeholder="Contoh: pembeli membatalkan / item salah"/>
      </label>
      {err&&<p className="text-xs font-bold text-red-600">{err}</p>}
      <label className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm font-semibold"><input type="checkbox" checked={restore} onChange={e=>setRestore(e.target.checked)}/>Kembalikan stok ke persediaan</label>
    </div>
  </Modal>
}
