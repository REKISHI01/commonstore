import { NextResponse } from 'next/server'
import { accessToken, cloudPublicConfig, cloudServerConfigured } from '../../../../lib/cloud-server'
export async function GET(){
  try{if(!cloudServerConfigured)throw new Error('Supabase belum dikonfigurasi');return NextResponse.json({url:cloudPublicConfig.url,anonKey:cloudPublicConfig.anonKey,accessToken:await accessToken()})}catch(e:any){return NextResponse.json({error:e.message},{status:401})}
}
