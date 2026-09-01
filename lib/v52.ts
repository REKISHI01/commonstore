import { businessTotals, calculateProduct, id, type Expense, type Order, type Product } from './itemku'
import { automationNotifications, type AutomationRule, type NotificationItem } from './v4'

export type ApprovalRisk='Rendah'|'Sedang'|'Tinggi'
export type ApprovalStatus='Pending'|'Disetujui'|'Ditolak'|'Diterapkan'
export type ApprovalKind='price_change'|'discount_activation'
export type ApprovalRequest={
  id:string;kind:ApprovalKind;title:string;detail:string;risk:ApprovalRisk;status:ApprovalStatus;productId:string;productName:string;
  currentValue:number;suggestedValue:number;payload:Record<string,unknown>;createdAt:string;decidedAt?:string;appliedAt?:string
}
export type AutomationRunLog={id:string;createdAt:string;notificationsAdded:number;approvalsAdded:number;rulesChecked:number;note:string}
export type ReportFrequency='Harian'|'Mingguan'|'Bulanan'
export type ReportSchedule={id:string;name:string;frequency:ReportFrequency;enabled:boolean;nextRunAt:string;lastRunAt?:string;createdAt:string}
export type ScheduledReport={id:string;scheduleId:string;scheduleName:string;frequency:ReportFrequency;createdAt:string;periodStart:string;periodEnd:string;orderCount:number;revenue:number;grossProfit:number;expenses:number;netProfit:number;refunds:number;topProduct:string}

const safeParse=<T,>(key:string,fallback:T):T=>{if(typeof window==='undefined')return fallback;try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}}
const save=(key:string,value:unknown)=>{if(typeof window!=='undefined')localStorage.setItem(key,JSON.stringify(value))}
const APPROVAL_KEY='itemkuV52Approvals',RUN_KEY='itemkuV52AutomationRuns',SCHEDULE_KEY='itemkuV52ReportSchedules',REPORT_KEY='itemkuV52ScheduledReports'

export const loadApprovals=()=>safeParse<ApprovalRequest[]>(APPROVAL_KEY,[])
export const saveApprovals=(x:ApprovalRequest[])=>save(APPROVAL_KEY,x)
export const loadAutomationRuns=()=>safeParse<AutomationRunLog[]>(RUN_KEY,[])
export const saveAutomationRuns=(x:AutomationRunLog[])=>save(RUN_KEY,x.slice(0,100))
export const loadReportSchedules=()=>safeParse<ReportSchedule[]>(SCHEDULE_KEY,[])
export const saveReportSchedules=(x:ReportSchedule[])=>save(SCHEDULE_KEY,x)
export const loadScheduledReports=()=>safeParse<ScheduledReport[]>(REPORT_KEY,[])
export const saveScheduledReports=(x:ScheduledReport[])=>save(REPORT_KEY,x.slice(0,100))

const daysAgo=(iso:string)=>Math.max(0,(Date.now()-new Date(iso).getTime())/86_400_000)
const uniqProposal=(rows:ApprovalRequest[],kind:ApprovalKind,productId:string)=>!rows.some(x=>x.kind===kind&&x.productId===productId&&x.status==='Pending')

export function runAutomation(input:{products:Product[];orders:Order[];rules:AutomationRule[];notifications:NotificationItem[];approvals?:ApprovalRequest[]}){
  const notifications=automationNotifications(input.products,input.orders,input.rules,input.notifications)
  const addedNotifications=Math.max(0,notifications.length-input.notifications.length)
  const approvals=[...(input.approvals||loadApprovals())]
  const lowMargin=input.rules.find(x=>x.enabled&&x.kind==='low_margin')
  const aging=input.rules.find(x=>x.enabled&&x.kind==='aging_stock')
  if(lowMargin){
    for(const p of input.products.filter(x=>x.active)){
      const calc=calculateProduct(p)
      if(calc.margin<lowMargin.threshold&&uniqProposal(approvals,'price_change',p.id)){
        const suggested=Math.max(p.price+1,Math.ceil(calc.targetPrice/100)*100)
        approvals.unshift({id:id('approval'),kind:'price_change',title:`Review harga ${p.name}`,detail:`Margin ${calc.margin.toFixed(1)}% di bawah batas ${lowMargin.threshold}%.`,risk:calc.profit<0?'Tinggi':'Sedang',status:'Pending',productId:p.id,productName:p.name,currentValue:p.price,suggestedValue:suggested,payload:{price:suggested},createdAt:new Date().toISOString()})
      }
    }
  }
  if(aging){
    for(const p of input.products.filter(x=>x.active&&x.stock>0&&!x.discountEnabled&&daysAgo(x.stockSince)>=aging.threshold)){
      if(!uniqProposal(approvals,'discount_activation',p.id))continue
      const calc=calculateProduct(p)
      const safe=Math.ceil(Math.max(calc.bep*1.03,p.price*.95)/100)*100
      if(safe>=p.price)continue
      approvals.unshift({id:id('approval'),kind:'discount_activation',title:`Diskon stok menua ${p.name}`,detail:`Stok berumur ${Math.floor(daysAgo(p.stockSince))} hari. Harga saran tetap di atas BEP + buffer.`,risk:'Sedang',status:'Pending',productId:p.id,productName:p.name,currentValue:p.price,suggestedValue:safe,payload:{discountEnabled:true,discountPrice:safe},createdAt:new Date().toISOString()})
    }
  }
  const addedApprovals=Math.max(0,approvals.length-(input.approvals||loadApprovals()).length)
  const log:AutomationRunLog={id:id('autorun'),createdAt:new Date().toISOString(),notificationsAdded:addedNotifications,approvalsAdded:addedApprovals,rulesChecked:input.rules.filter(x=>x.enabled).length,note:'Rule diperiksa; aksi sensitif hanya dibuat sebagai approval.'}
  const runs=[log,...loadAutomationRuns()].slice(0,100)
  saveApprovals(approvals);saveAutomationRuns(runs)
  return {notifications,approvals,log}
}

export function decideApproval(rows:ApprovalRequest[],approvalId:string,status:'Disetujui'|'Ditolak'){
  const now=new Date().toISOString();const next=rows.map(x=>x.id===approvalId?{...x,status,decidedAt:now}:x);saveApprovals(next);return next
}

export function applyApproval(rows:ApprovalRequest[],products:Product[],approvalId:string){
  const req=rows.find(x=>x.id===approvalId)
  if(!req||req.status!=='Disetujui')throw new Error('Approval belum disetujui')
  const now=new Date().toISOString();let found=false
  const nextProducts=products.map(p=>{if(p.id!==req.productId)return p;found=true;if(req.kind==='price_change')return {...p,price:Number(req.payload.price)||req.suggestedValue,updatedAt:now};if(req.kind==='discount_activation')return {...p,discountEnabled:true,discountPrice:Number(req.payload.discountPrice)||req.suggestedValue,updatedAt:now};return p})
  if(!found)throw new Error('Produk approval tidak ditemukan')
  const nextRows=rows.map(x=>x.id===approvalId?{...x,status:'Diterapkan' as const,appliedAt:now}:x);saveApprovals(nextRows)
  return {products:nextProducts,approvals:nextRows,request:req}
}

export function nextReportAt(frequency:ReportFrequency,from=new Date()){
  const d=new Date(from);d.setSeconds(0,0)
  if(frequency==='Harian'){d.setDate(d.getDate()+1);d.setHours(8,0,0,0)}
  else if(frequency==='Mingguan'){const add=((1-d.getDay()+7)%7)||7;d.setDate(d.getDate()+add);d.setHours(8,0,0,0)}
  else{d.setMonth(d.getMonth()+1,1);d.setHours(8,0,0,0)}
  return d.toISOString()
}

export function makeReportSchedule(name:string,frequency:ReportFrequency):ReportSchedule{const now=new Date();return {id:id('report_schedule'),name:name.trim()||`Laporan ${frequency}`,frequency,enabled:true,nextRunAt:nextReportAt(frequency,now),createdAt:now.toISOString()}}

function periodFor(frequency:ReportFrequency,end=new Date()){const start=new Date(end);if(frequency==='Harian')start.setDate(start.getDate()-1);else if(frequency==='Mingguan')start.setDate(start.getDate()-7);else start.setDate(start.getDate()-30);return {start,end}}
function topProduct(orders:Order[],start:Date,end:Date){const map=new Map<string,number>();for(const o of orders){const t=new Date(o.completedAt||o.createdAt);if(o.status!=='Selesai'||t<start||t>end)continue;map.set(o.productName,(map.get(o.productName)||0)+o.qty)}return [...map.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'-'}
export function generateScheduledReport(schedule:ReportSchedule,orders:Order[],expenses:Expense[],now=new Date()):ScheduledReport{const {start,end}=periodFor(schedule.frequency,now);const totals=businessTotals(orders,expenses,start,end);const refunds=orders.filter(o=>o.status==='Refund'&&new Date(o.completedAt||o.createdAt)>=start&&new Date(o.completedAt||o.createdAt)<=end).length;return {id:id('scheduled_report'),scheduleId:schedule.id,scheduleName:schedule.name,frequency:schedule.frequency,createdAt:now.toISOString(),periodStart:start.toISOString(),periodEnd:end.toISOString(),orderCount:totals.orderCount,revenue:totals.revenue,grossProfit:totals.grossProfit,expenses:totals.expenses,netProfit:totals.netProfit,refunds,topProduct:topProduct(orders,start,end)}}

export function runDueReportSchedules(schedules:ReportSchedule[],orders:Order[],expenses:Expense[],now=new Date()){
  const reports=loadScheduledReports();let generated=0
  const next=schedules.map(s=>{if(!s.enabled||new Date(s.nextRunAt)>now)return s;reports.unshift(generateScheduledReport(s,orders,expenses,now));generated++;return {...s,lastRunAt:now.toISOString(),nextRunAt:nextReportAt(s.frequency,now)}})
  saveReportSchedules(next);saveScheduledReports(reports);return {schedules:next,reports:reports.slice(0,100),generated}
}

export function maintenanceSnapshot(notifications:NotificationItem[]){
  const keys=typeof localStorage==='undefined'?[]:Object.keys(localStorage);let bytes=0
  if(typeof localStorage!=='undefined')for(const k of keys){bytes+=(k.length+(localStorage.getItem(k)||'').length)*2}
  const oldRead=notifications.filter(n=>n.read&&Date.now()-new Date(n.createdAt).getTime()>30*86_400_000).length
  const runs=loadAutomationRuns(),reports=loadScheduledReports(),approvals=loadApprovals()
  return {localStorageKeys:keys.length,localStorageBytes:bytes,oldReadNotifications:oldRead,automationLogs:runs.length,scheduledReports:reports.length,pendingApprovals:approvals.filter(x=>x.status==='Pending').length,oldResolvedApprovals:approvals.filter(x=>x.status!=='Pending'&&Date.now()-new Date(x.decidedAt||x.appliedAt||x.createdAt).getTime()>90*86_400_000).length}
}

export function safeMaintenance(notifications:NotificationItem[]){
  const cutoff30=Date.now()-30*86_400_000,cutoff90=Date.now()-90*86_400_000
  const nextNotifications=notifications.filter(n=>!(n.read&&new Date(n.createdAt).getTime()<cutoff30))
  saveAutomationRuns(loadAutomationRuns().slice(0,50));saveScheduledReports(loadScheduledReports().slice(0,50));saveApprovals(loadApprovals().filter(x=>x.status==='Pending'||new Date(x.decidedAt||x.appliedAt||x.createdAt).getTime()>=cutoff90))
  return {notifications:nextNotifications,removedNotifications:notifications.length-nextNotifications.length}
}

export function exportV52Backup(){return JSON.stringify({version:5.2,approvals:loadApprovals(),automationRuns:loadAutomationRuns(),reportSchedules:loadReportSchedules(),scheduledReports:loadScheduledReports()},null,2)}
export function restoreV52Backup(json:string){const d=JSON.parse(json);const x=d?.v52||d;if(Array.isArray(x.approvals))saveApprovals(x.approvals);if(Array.isArray(x.automationRuns))saveAutomationRuns(x.automationRuns);if(Array.isArray(x.reportSchedules))saveReportSchedules(x.reportSchedules);if(Array.isArray(x.scheduledReports))saveScheduledReports(x.scheduledReports)}
