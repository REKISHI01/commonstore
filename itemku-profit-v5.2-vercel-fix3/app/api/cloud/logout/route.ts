import { NextResponse } from 'next/server'
import { clearTokens, cloudPublicConfig, cloudServerConfigured, rawTokens } from '../../../../lib/cloud-server'
export async function POST(){
  try{const {access}=await rawTokens();if(access&&cloudServerConfigured)await fetch(`${cloudPublicConfig.url}/auth/v1/logout`,{method:'POST',headers:{apikey:cloudPublicConfig.anonKey,Authorization:`Bearer ${access}`},cache:'no-store'}).catch(()=>null)}finally{await clearTokens()}
  return NextResponse.json({ok:true})
}
