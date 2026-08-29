import { NextResponse } from 'next/server'
import { clearTokens, cloudPublicConfig, cloudServerConfigured, currentUser, saveTokens } from '../../../../lib/cloud-server'
import { apiStatus, readJson } from '../../../../lib/api-guard'

export async function POST(req:Request){
  try{
    if(!cloudServerConfigured)return NextResponse.json({error:'Supabase belum dikonfigurasi'},{status:503})
    const {email,password}=await readJson<{email:string;password:string}>(req,16384)
    if(!email||!password||typeof email!=='string'||typeof password!=='string')return NextResponse.json({error:'Email dan sandi wajib diisi'},{status:400});if(email.length>320||password.length>500)return NextResponse.json({error:'Kredensial tidak valid'},{status:400})
    const res=await fetch(`${cloudPublicConfig.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:cloudPublicConfig.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),password}),cache:'no-store'})
    const data=await res.json()
    if(!res.ok)return NextResponse.json({error:data?.error_description||data?.msg||'Login gagal'},{status:401})
    await saveTokens(data.access_token,data.refresh_token,data.expires_in||3600)
    try{
      const user=await currentUser()
      return NextResponse.json({user})
    }catch(e){
      await clearTokens()
      throw e
    }
  }catch(e:any){return NextResponse.json({error:e.message||'Login gagal'},{status:apiStatus(e,500)})}
}
