import { NextResponse } from 'next/server'
import { cloudServerConfigured } from '../../../lib/cloud-server'
export const dynamic='force-dynamic'
export async function GET(){return NextResponse.json({ok:true,app:'Itemku Profit',version:'5.2.0-automation',cloudConfigured:cloudServerConfigured,time:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
