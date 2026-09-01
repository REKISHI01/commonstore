import { NextResponse } from 'next/server'
import { cloudAdminConfigured, cloudServerConfigured } from '../../../lib/cloud-server'
export const dynamic='force-dynamic'
export async function GET(){return NextResponse.json({ok:true,app:'Itemku Profit',version:'6.4.2-payroll',cloudConfigured:cloudServerConfigured,payrollAdminConfigured:cloudAdminConfigured,time:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
