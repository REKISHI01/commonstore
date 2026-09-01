import { cookies } from 'next/headers'

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ACCESS='itemku_v3_access'
const REFRESH='itemku_v3_refresh'

export const cloudServerConfigured = Boolean(URL && KEY && !URL.includes('YOUR_PROJECT') && KEY !== 'YOUR_ANON_KEY')
export const cloudAdminConfigured = Boolean(cloudServerConfigured && SERVICE_KEY && SERVICE_KEY !== 'YOUR_SERVICE_ROLE_KEY')
export const cloudPublicConfig = { url:URL, anonKey:KEY }

const baseHeaders=(token?:string,extra:Record<string,string>={})=>({apikey:KEY,Authorization:`Bearer ${token||KEY}`,'Content-Type':'application/json',...extra})

export async function saveTokens(access:string,refresh?:string,expiresIn=3600){
  const jar=await cookies()
  jar.set(ACCESS,access,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:Math.max(60,expiresIn)})
  if(refresh)jar.set(REFRESH,refresh,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*30})
}
export async function clearTokens(){const jar=await cookies();jar.delete(ACCESS);jar.delete(REFRESH)}
export async function rawTokens(){const jar=await cookies();return{access:jar.get(ACCESS)?.value||'',refresh:jar.get(REFRESH)?.value||''}}

async function refreshAccess(refresh:string){
  if(!refresh)throw new Error('Sesi cloud berakhir')
  const res=await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:baseHeaders(),body:JSON.stringify({refresh_token:refresh}),cache:'no-store'})
  const data=await res.json()
  if(!res.ok)throw new Error(data?.error_description||data?.msg||'Gagal memperbarui sesi')
  await saveTokens(data.access_token,data.refresh_token,data.expires_in||3600)
  return data.access_token as string
}

export async function accessToken(){
  if(!cloudServerConfigured)throw new Error('Supabase belum dikonfigurasi')
  const {access,refresh}=await rawTokens()
  if(!access)return refreshAccess(refresh)
  return access
}

export async function supabaseFetch(path:string,init:RequestInit={},retry=true):Promise<Response>{
  let token=await accessToken()
  let res=await fetch(`${URL}${path}`,{...init,headers:{...baseHeaders(token),...(init.headers||{})},cache:'no-store'})
  if(res.status===401&&retry){const {refresh}=await rawTokens();token=await refreshAccess(refresh);res=await fetch(`${URL}${path}`,{...init,headers:{...baseHeaders(token),...(init.headers||{})},cache:'no-store'})}
  return res
}


export async function supabaseAdminFetch(path:string,init:RequestInit={}):Promise<Response>{
  if(!cloudAdminConfigured)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server')
  return fetch(`${URL}${path}`,{
    ...init,
    headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json',...(init.headers||{})},
    cache:'no-store'
  })
}

export async function jsonFrom(res:Response){
  const text=await res.text();let data:any=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw new Error(data?.message||data?.error_description||data?.hint||data?.details||`Supabase error ${res.status}`)
  return data
}

export async function currentUser(){
  const token=await accessToken()
  const ures=await supabaseFetch('/auth/v1/user')
  const user=await jsonFrom(ures)
  const pres=await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,name,role,active,permissions,allowed_games`)
  const profile=(await jsonFrom(pres))?.[0]
  if(!profile)throw new Error('Akun belum memiliki profile/role. Hubungi Owner.')
  if(!profile.active)throw new Error('Akun dinonaktifkan')
  if(profile.role!=='owner'&&profile.role!=='worker')throw new Error('Role akun tidak valid')
  return {id:user.id,email:user.email,name:profile.name||user.email,role:profile.role,permissions:profile.permissions||{},allowedGames:profile.allowed_games||[]}
}
