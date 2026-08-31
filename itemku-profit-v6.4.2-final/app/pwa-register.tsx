'use client'
import { useEffect, useState } from 'react'

type PromptEvent = Event & { prompt:()=>Promise<void>; userChoice:Promise<{outcome:'accepted'|'dismissed'}> }
export function PWARegister(){
  const [prompt,setPrompt]=useState<PromptEvent|null>(null)
  useEffect(()=>{
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>null)
    const handler=(e:Event)=>{e.preventDefault();setPrompt(e as PromptEvent)}
    window.addEventListener('beforeinstallprompt',handler)
    return()=>window.removeEventListener('beforeinstallprompt',handler)
  },[])
  if(!prompt)return null
  return <button onClick={async()=>{await prompt.prompt();await prompt.userChoice;setPrompt(null)}} className="rounded-lg border px-3 py-2 text-xs font-bold" title="Install sebagai aplikasi">Install App</button>
}
