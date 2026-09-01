import { NextResponse } from 'next/server'
import { cloudAdminConfigured, currentUser, jsonFrom, supabaseAdminFetch } from '@/lib/cloud-server'
import { apiStatus, readJson } from '@/lib/api-guard'

const num=(v:any)=>Number(v)||0
const esc=(v:string)=>encodeURIComponent(v)

const toScheme=(x:any)=>({
  id:x.id,baseSalary:num(x.base_salary),workerSharePercent:num(x.worker_share_percent),reservePercent:num(x.reserve_percent),
  effectiveFrom:x.effective_from,note:x.note||'',createdByName:x.created_by_name||'Owner',createdAt:x.created_at
})
const toRun=(x:any)=>({
  id:x.id,monthKey:x.month_key,periodStart:x.period_start,periodEnd:x.period_end,schemeSnapshot:x.scheme_snapshot,
  workerCount:num(x.worker_count),orderCount:num(x.order_count),grossOrderProfit:num(x.gross_order_profit),expensesTotal:num(x.expenses_total),
  netProfit:num(x.net_profit),reserveAmount:num(x.reserve_amount),fixedSalaryTotal:num(x.fixed_salary_total),
  distributableProfit:num(x.distributable_profit),workerShareTotal:num(x.worker_share_total),totalPayroll:num(x.total_payroll),
  ownerRemaining:num(x.owner_remaining),status:x.status,finalizedAt:x.finalized_at,paidAt:x.paid_at||undefined
})
const toItem=(x:any)=>({
  id:x.id,runId:x.run_id,monthKey:x.month_key,workerId:x.worker_id,workerName:x.worker_name,
  baseSalary:num(x.base_salary),sharePercent:num(x.share_percent),shareAmount:num(x.share_amount),totalPay:num(x.total_pay),
  businessSnapshot:x.business_snapshot||{},createdAt:x.created_at
})

async function rpc(name:string, body:any){
  return jsonFrom(await supabaseAdminFetch(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(body)}))
}

export async function GET(req:Request){
  try{
    const user=await currentUser()
    if(!cloudAdminConfigured)return NextResponse.json({error:'Payroll server belum dikonfigurasi. Tambahkan SUPABASE_SERVICE_ROLE_KEY di Vercel.'},{status:503})
    const url=new URL(req.url)
    const month=(url.searchParams.get('month')||new Date().toISOString().slice(0,7)).trim()
    if(!/^\d{4}-\d{2}$/.test(month))return NextResponse.json({error:'month harus YYYY-MM'},{status:400})

    const today=new Date().toISOString().slice(0,10)
    const activeRows=await jsonFrom(await supabaseAdminFetch(`/rest/v1/payroll_schemes?effective_from=lte.${today}&select=*&order=effective_from.desc,created_at.desc&limit=1`))
    const activeScheme=activeRows?.[0]?toScheme(activeRows[0]):null

    if(user.role==='owner'){
      const existing=await jsonFrom(await supabaseAdminFetch(`/rest/v1/payroll_runs?month_key=eq.${esc(month)}&select=*&limit=1`))
      const [schemeRows,runRows,itemRows]=await Promise.all([
        jsonFrom(await supabaseAdminFetch('/rest/v1/payroll_schemes?select=*&order=effective_from.desc,created_at.desc')),
        jsonFrom(await supabaseAdminFetch('/rest/v1/payroll_runs?select=*&order=month_key.desc')),
        jsonFrom(await supabaseAdminFetch(`/rest/v1/payroll_items?month_key=eq.${esc(month)}&select=*&order=worker_name.asc`)),
      ])
      const preview=existing?.[0]?null:await rpc('payroll_preview',{p_month_key:month})
      return NextResponse.json({
        role:'owner',activeScheme,schemeHistory:(schemeRows||[]).map(toScheme),runs:(runRows||[]).map(toRun),
        selectedRun:existing?.[0]?toRun(existing[0]):null,selectedItems:(itemRows||[]).map(toItem),preview
      })
    }

    const itemRows=await jsonFrom(await supabaseAdminFetch(`/rest/v1/payroll_items?worker_id=eq.${esc(user.id)}&select=*&order=month_key.desc`))
    const ownItems=(itemRows||[]).map(toItem)
    const runIds=[...new Set(ownItems.map((x:any)=>x.runId))]
    let runs:any[]=[]
    if(runIds.length){
      const filter=`(${runIds.join(',')})`
      runs=await jsonFrom(await supabaseAdminFetch(`/rest/v1/payroll_runs?id=in.${esc(filter)}&select=*&order=month_key.desc`))
    }
    const runMap=new Map((runs||[]).map((r:any)=>[r.id,toRun(r)]))
    return NextResponse.json({
      role:'worker',activeScheme,
      slips:ownItems.map((item:any)=>({item,run:runMap.get(item.runId)||null}))
    })
  }catch(e:any){return NextResponse.json({error:e.message||'Gagal mengambil payroll'},{status:apiStatus(e,500)})}
}

type ActionBody =
  | {action:'save_scheme';baseSalary:number;workerSharePercent:number;reservePercent:number;effectiveFrom:string;note?:string}
  | {action:'finalize';month:string}
  | {action:'mark_paid';runId:string}

export async function POST(req:Request){
  try{
    const user=await currentUser()
    if(!cloudAdminConfigured)return NextResponse.json({error:'Payroll server belum dikonfigurasi. Tambahkan SUPABASE_SERVICE_ROLE_KEY di Vercel.'},{status:503})
    if(user.role!=='owner')return NextResponse.json({error:'Hanya Owner yang dapat mengubah payroll'},{status:403})
    const body=await readJson<ActionBody>(req,100_000)

    if(body.action==='save_scheme'){
      const baseSalary=num(body.baseSalary), share=num(body.workerSharePercent), reserve=num(body.reservePercent)
      if(baseSalary<0||share<0||share>100||reserve<0||reserve>100)return NextResponse.json({error:'Nilai skema tidak valid'},{status:400})
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom))return NextResponse.json({error:'effectiveFrom harus YYYY-MM-DD'},{status:400})
      const workers=await jsonFrom(await supabaseAdminFetch('/rest/v1/profiles?role=eq.worker&active=eq.true&select=id'))
      const workerCount=Array.isArray(workers)?workers.length:0
      if(workerCount*share>100)return NextResponse.json({error:`Share ${share}% × ${workerCount} Worker melebihi 100% profit distributable.`},{status:400})
      const row={base_salary:baseSalary,worker_share_percent:share,reserve_percent:reserve,effective_from:body.effectiveFrom,note:body.note||'',created_by:user.id,created_by_name:user.name||'Owner'}
      const saved=await jsonFrom(await supabaseAdminFetch('/rest/v1/payroll_schemes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)}))
      await jsonFrom(await supabaseAdminFetch('/rest/v1/audit_logs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:`log_${crypto.randomUUID().replaceAll('-','')}`,action:'PAYROLL_SCHEME_CHANGED',detail:`Skema baru: gaji ${baseSalary}, share ${share}%/Worker, cadangan ${reserve}%, berlaku ${body.effectiveFrom}`,actor_name:user.name||'Owner'})}))
      return NextResponse.json({ok:true,scheme:saved?.[0]?toScheme(saved[0]):null})
    }

    if(body.action==='finalize'){
      if(!/^\d{4}-\d{2}$/.test(body.month))return NextResponse.json({error:'month harus YYYY-MM'},{status:400})
      const runId=await rpc('finalize_payroll',{p_month_key:body.month,p_actor:user.id,p_actor_name:user.name||'Owner'})
      const rows=await jsonFrom(await supabaseAdminFetch(`/rest/v1/payroll_runs?id=eq.${esc(String(runId))}&select=*&limit=1`))
      return NextResponse.json({ok:true,run:rows?.[0]?toRun(rows[0]):null})
    }

    if(body.action==='mark_paid'){
      if(!body.runId)return NextResponse.json({error:'runId wajib diisi'},{status:400})
      await rpc('mark_payroll_paid',{p_run_id:body.runId,p_actor_name:user.name||'Owner'})
      const rows=await jsonFrom(await supabaseAdminFetch(`/rest/v1/payroll_runs?id=eq.${esc(body.runId)}&select=*&limit=1`))
      return NextResponse.json({ok:true,run:rows?.[0]?toRun(rows[0]):null})
    }

    return NextResponse.json({error:'Action tidak dikenal'},{status:400})
  }catch(e:any){return NextResponse.json({error:e.message||'Perubahan payroll gagal'},{status:apiStatus(e,500)})}
}
