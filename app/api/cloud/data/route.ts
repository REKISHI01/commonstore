import { NextResponse } from 'next/server'
import { currentUser, jsonFrom, supabaseFetch } from '../../../../lib/cloud-server'
import { apiStatus, readJson } from '../../../../lib/api-guard'

const tableMap:Record<string,string>={
  products:'products',orders:'orders',opportunities:'opportunities',audit_logs:'audit_logs',restocks:'restocks',expenses:'expenses',business_targets:'business_targets',price_history:'price_history',customer_notes:'customer_notes',profiles:'profiles',
  channel_rules:'channel_rules',suppliers:'suppliers',purchase_orders:'purchase_orders',inventory_ledger:'inventory_ledger',settlements:'settlements',disputes:'disputes',automation_rules:'automation_rules',notifications:'notifications',dashboard_preferences:'dashboard_preferences',customer_tags:'customer_tags'
}

const toProduct=(p:any)=>({id:p.id,name:p.name,game:p.game,category:p.category,sku:p.sku||'',supplier:p.supplier||'',stock:Number(p.stock)||0,reorderPoint:Number(p.reorder_point)||5,modal:Number(p.modal)||0,price:Number(p.price)||0,fee:Number(p.fee)||0,fixed:Number(p.fixed)||0,other:Number(p.other)||0,target:Number(p.target)||0,stockSince:p.stock_since,discountEnabled:Boolean(p.discount_enabled),discountPrice:Number(p.discount_price)||0,active:p.active!==false,updatedAt:p.updated_at})
const toOrder=(o:any)=>({id:o.id,invoiceNo:o.invoice_no||o.id,productId:o.product_id||'',productName:o.product_name,game:o.game,supplierSnapshot:o.supplier_snapshot||'',buyerIdentifier:o.buyer_identifier,serverId:o.server_id||'',channel:o.channel||'Itemku',qty:Number(o.qty)||1,note:o.note||'',status:o.status,assignedWorker:o.assigned_worker_name||undefined,assignedWorkerId:o.assigned_worker_id||undefined,refundReason:o.refund_reason||undefined,stockRestored:Boolean(o.stock_restored),snapshot:o.snapshot,createdAt:o.created_at,processingAt:o.processing_at||undefined,completedAt:o.completed_at||undefined,updatedAt:o.updated_at})
const toOpp=(x:any)=>({id:x.id,game:x.game,product:x.product,category:x.category,marketPrice:Number(x.market_price)||0,previousMarketPrice:Number(x.previous_market_price)||0,capital:Number(x.capital)||0,soldSignal:Number(x.sold_signal)||0,previousSoldSignal:Number(x.previous_sold_signal)||0,listingSignal:Number(x.listing_signal)||0,competitorCount:Number(x.competitor_count)||0,checkedAt:x.checked_at,note:x.note||'',trend:x.trend||'baru'})
const toRestock=(x:any)=>({id:x.id,productId:x.product_id,productName:x.product_name,supplier:x.supplier||'',qty:Number(x.qty)||0,unitCost:Number(x.unit_cost)||0,totalCost:Number(x.total_cost)||0,previousStock:Number(x.previous_stock)||0,newStock:Number(x.new_stock)||0,createdAt:x.created_at,note:x.note||''})
const toExpense=(x:any)=>({id:x.id,category:x.category,amount:Number(x.amount)||0,date:x.expense_date||x.created_at,note:x.note||''})
const toTarget=(x:any)=>({id:x.id,month:x.month_key,targetProfit:Number(x.target_profit)||0,targetRevenue:Number(x.target_revenue)||0})
const toHistory=(x:any)=>({id:x.id,productId:x.product_id,productName:x.product_name,field:x.field_name,fromValue:Number(x.from_value)||0,toValue:Number(x.to_value)||0,createdAt:x.created_at})
const toCustomerNote=(x:any)=>({id:x.id,buyerIdentifier:x.buyer_identifier,note:x.note||'',createdAt:x.created_at,updatedAt:x.updated_at||x.created_at})
const toAudit=(x:any)=>({id:x.id,action:x.action,detail:x.detail||'',actor:x.actor_name||'System',createdAt:x.created_at})
const toChannel=(x:any)=>({id:x.id,name:x.name,feePercent:Number(x.fee_percent)||0,fixedFee:Number(x.fixed_fee)||0,active:x.active!==false,note:x.note||'',updatedAt:x.updated_at||x.created_at})
const toSupplier=(x:any)=>({id:x.id,name:x.name,contact:x.contact||'',note:x.note||'',active:x.active!==false,createdAt:x.created_at,updatedAt:x.updated_at||x.created_at})
const toPO=(x:any)=>({id:x.id,poNo:x.po_no,supplierId:x.supplier_id||'',supplierName:x.supplier_name||'',productId:x.product_id||'',productName:x.product_name||'',qty:Number(x.qty)||0,unitCost:Number(x.unit_cost)||0,totalCost:Number(x.total_cost)||0,status:x.status,orderedAt:x.ordered_at||x.created_at,receivedAt:x.received_at||undefined,note:x.note||'',createdAt:x.created_at,updatedAt:x.updated_at||x.created_at})
const toLedger=(x:any)=>({id:x.id,productId:x.product_id||'',productName:x.product_name||'',delta:Number(x.delta)||0,stockBefore:Number(x.stock_before)||0,stockAfter:Number(x.stock_after)||0,reason:x.reason,referenceId:x.reference_id||undefined,note:x.note||'',createdAt:x.created_at,actor:x.actor_name||'System'})
const toSettlement=(x:any)=>({id:x.id,channel:x.channel,periodStart:x.period_start,periodEnd:x.period_end,expectedAmount:Number(x.expected_amount)||0,actualAmount:Number(x.actual_amount)||0,status:x.status,paidAt:x.paid_at||undefined,note:x.note||'',createdAt:x.created_at,updatedAt:x.updated_at||x.created_at})
const toDispute=(x:any)=>({id:x.id,orderId:x.order_id||'',invoiceNo:x.invoice_no||'',buyerIdentifier:x.buyer_identifier||'',reason:x.reason||'',chronology:x.chronology||'',status:x.status,assignedWorker:x.assigned_worker||undefined,createdAt:x.created_at,updatedAt:x.updated_at||x.created_at,resolvedAt:x.resolved_at||undefined})
const toRule=(x:any)=>({id:x.id,kind:x.kind,enabled:x.enabled!==false,threshold:Number(x.threshold)||0,label:x.label||'',createdAt:x.created_at,updatedAt:x.updated_at||x.created_at})
const toNotification=(x:any)=>({id:x.id,kind:x.kind,level:x.level,title:x.title,detail:x.detail||'',entityType:x.entity_type||undefined,entityId:x.entity_id||undefined,read:Boolean(x.is_read),createdAt:x.created_at})
const toPrefs=(x:any)=>({id:x.id,visibleCards:Array.isArray(x.visible_cards)?x.visible_cards:[],slaMinutes:Number(x.sla_minutes)||10,forecastDays:Number(x.forecast_days)||7})
const toTag=(x:any)=>({id:x.id,buyerIdentifier:x.buyer_identifier,tags:Array.isArray(x.tags)?x.tags:[]})

const uuidOrNull=(v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)?v:null

function fromRow(entity:string,x:any){
  if(entity==='products')return{id:x.id,name:x.name,game:x.game,category:x.category,sku:x.sku,supplier:x.supplier,stock:x.stock,reorder_point:x.reorderPoint,modal:x.modal,price:x.price,fee:x.fee,fixed:x.fixed,other:x.other,target:x.target,stock_since:x.stockSince,discount_enabled:x.discountEnabled,discount_price:x.discountPrice||0,active:x.active!==false,updated_at:x.updatedAt||new Date().toISOString()}
  if(entity==='orders')return{id:x.id,invoice_no:x.invoiceNo,product_id:x.productId||null,product_name:x.productName,game:x.game,supplier_snapshot:x.supplierSnapshot||'',buyer_identifier:x.buyerIdentifier,server_id:x.serverId||null,channel:x.channel||'Itemku',qty:x.qty,note:x.note,status:x.status,assigned_worker_name:x.assignedWorker||null,assigned_worker_id:uuidOrNull(x.assignedWorkerId),refund_reason:x.refundReason||null,stock_restored:Boolean(x.stockRestored),snapshot:x.snapshot,created_at:x.createdAt,processing_at:x.processingAt||null,completed_at:x.completedAt||null,updated_at:x.updatedAt||new Date().toISOString()}
  if(entity==='opportunities')return{id:x.id,game:x.game,product:x.product,category:x.category,market_price:x.marketPrice,previous_market_price:x.previousMarketPrice||0,capital:x.capital,sold_signal:x.soldSignal,previous_sold_signal:x.previousSoldSignal||0,listing_signal:x.listingSignal,competitor_count:x.competitorCount||0,checked_at:x.checkedAt,note:x.note,trend:x.trend||'baru'}
  if(entity==='audit_logs')return{id:x.id,action:x.action,detail:x.detail||'',actor_name:x.actor,created_at:x.createdAt}
  if(entity==='restocks')return{id:x.id,product_id:x.productId||null,product_name:x.productName,supplier:x.supplier,qty:x.qty,unit_cost:x.unitCost,total_cost:x.totalCost,previous_stock:x.previousStock,new_stock:x.newStock,created_at:x.createdAt,note:x.note}
  if(entity==='expenses')return{id:x.id,category:x.category,amount:x.amount,expense_date:x.date,note:x.note}
  if(entity==='business_targets')return{id:x.id,month_key:x.month,target_profit:x.targetProfit,target_revenue:x.targetRevenue}
  if(entity==='price_history')return{id:x.id,product_id:x.productId||null,product_name:x.productName,field_name:x.field,from_value:x.fromValue,to_value:x.toValue,created_at:x.createdAt}
  if(entity==='customer_notes')return{id:x.id,buyer_identifier:x.buyerIdentifier,note:x.note||'',created_at:x.createdAt,updated_at:x.updatedAt||x.createdAt}
  if(entity==='profiles')return{id:x.id,name:x.name,role:x.role,active:x.active,permissions:x.permissions||{},allowed_games:x.allowedGames||x.allowed_games||[]}
  if(entity==='channel_rules')return{id:x.id,name:x.name,fee_percent:x.feePercent,fixed_fee:x.fixedFee,active:x.active!==false,note:x.note||'',updated_at:x.updatedAt||new Date().toISOString()}
  if(entity==='suppliers')return{id:x.id,name:x.name,contact:x.contact||'',note:x.note||'',active:x.active!==false,created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||new Date().toISOString()}
  if(entity==='purchase_orders')return{id:x.id,po_no:x.poNo,supplier_id:x.supplierId||null,supplier_name:x.supplierName||'',product_id:x.productId||null,product_name:x.productName||'',qty:x.qty,unit_cost:x.unitCost,total_cost:x.totalCost,status:x.status,ordered_at:x.orderedAt,received_at:x.receivedAt||null,note:x.note||'',created_at:x.createdAt,updated_at:x.updatedAt||x.createdAt}
  if(entity==='inventory_ledger')return{id:x.id,product_id:x.productId||null,product_name:x.productName||'',delta:x.delta,stock_before:x.stockBefore,stock_after:x.stockAfter,reason:x.reason,reference_id:x.referenceId||null,note:x.note||'',created_at:x.createdAt,actor_name:x.actor||'System'}
  if(entity==='settlements')return{id:x.id,channel:x.channel,period_start:x.periodStart,period_end:x.periodEnd,expected_amount:x.expectedAmount,actual_amount:x.actualAmount,status:x.status,paid_at:x.paidAt||null,note:x.note||'',created_at:x.createdAt,updated_at:x.updatedAt||x.createdAt}
  if(entity==='disputes')return{id:x.id,order_id:x.orderId||null,invoice_no:x.invoiceNo||'',buyer_identifier:x.buyerIdentifier||'',reason:x.reason||'',chronology:x.chronology||'',status:x.status,assigned_worker:x.assignedWorker||null,created_at:x.createdAt,updated_at:x.updatedAt||x.createdAt,resolved_at:x.resolvedAt||null}
  if(entity==='automation_rules')return{id:x.id,kind:x.kind,enabled:x.enabled!==false,threshold:x.threshold,label:x.label||'',created_at:x.createdAt,updated_at:x.updatedAt||x.createdAt}
  if(entity==='notifications')return{id:x.id,kind:x.kind,level:x.level,title:x.title,detail:x.detail||'',entity_type:x.entityType||null,entity_id:x.entityId||null,is_read:Boolean(x.read),created_at:x.createdAt}
  if(entity==='dashboard_preferences')return{id:x.id||'owner',visible_cards:x.visibleCards||[],sla_minutes:x.slaMinutes||10,forecast_days:x.forecastDays||7,updated_at:new Date().toISOString()}
  if(entity==='customer_tags')return{id:x.id||x.buyerIdentifier.toLowerCase(),buyer_identifier:x.buyerIdentifier,tags:x.tags||[],updated_at:new Date().toISOString()}
  return x
}

const ownerOnly=new Set(['opportunities','audit_logs','restocks','expenses','business_targets','price_history','customer_notes','channel_rules','suppliers','purchase_orders','inventory_ledger','settlements','disputes','automation_rules','notifications','dashboard_preferences','customer_tags'])

export async function GET(req:Request){
  try{
    const user=await currentUser();const url=new URL(req.url);const entity=url.searchParams.get('entity')
    const q=(table:string,select='*',order='',extra='')=>supabaseFetch(`/rest/v1/${table}?select=${encodeURIComponent(select)}${order?`&order=${order}`:''}${extra}`).then(jsonFrom)
    if(entity==='orders'){
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||50));const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);const search=(url.searchParams.get('search')||'').trim();const status=(url.searchParams.get('status')||'').trim();const game=(url.searchParams.get('game')||'').trim();
      let extra=`&limit=${limit}&offset=${offset}`;if(status&&status!=='Semua')extra+=`&status=eq.${encodeURIComponent(status)}`;if(game&&game!=='Semua')extra+=`&game=eq.${encodeURIComponent(game)}`;if(search){const s=search.replace(/[,*()]/g,' ');extra+=`&or=${encodeURIComponent(`invoice_no.ilike.*${s}*,buyer_identifier.ilike.*${s}*,product_name.ilike.*${s}*`)}`}
      const rows=await q('orders','*','created_at.desc',extra);const canFinancial=user.role==='owner'||Boolean(user.permissions?.canViewFinancials);const mapped=(rows||[]).map(toOrder).map((o:any)=>canFinancial?o:{...o,snapshot:{...o.snapshot,unitModal:0,fixedCost:0,otherUnitCost:0,capital:0,totalCost:0,profit:0}});return NextResponse.json({orders:mapped,limit,offset,hasMore:mapped.length===limit})
    }
    // notifications diambil untuk semua role: RLS membatasi worker hanya ke recipient_id miliknya.
    // Tabel owner-only dilewati untuk worker (RLS memang mengembalikan kosong) agar bundle worker ringan.
    const [products,orders,opps,audit,restocks,expenses,targets,history,customerNotes,profiles,channels,suppliers,pos,ledger,settlements,disputes,rules,notifications,prefs,tags]=await Promise.all([
      q('products','*','created_at.asc'),q('orders','*','created_at.asc'),
      user.role==='owner'?q('opportunities','*','checked_at.desc'):Promise.resolve([]),user.role==='owner'?q('audit_logs','*','created_at.desc'):Promise.resolve([]),user.role==='owner'?q('restocks','*','created_at.desc'):Promise.resolve([]),user.role==='owner'?q('expenses','*','expense_date.desc'):Promise.resolve([]),user.role==='owner'?q('business_targets','*','month_key.desc'):Promise.resolve([]),user.role==='owner'?q('price_history','*','created_at.desc'):Promise.resolve([]),user.role==='owner'?q('customer_notes','*','updated_at.desc'):Promise.resolve([]),
      user.role==='owner'?q('profiles','id,name,role,active,permissions,allowed_games','created_at.asc'):q('profiles','id,name,role,active,permissions,allowed_games','created_at.asc',`&id=eq.${encodeURIComponent(user.id)}`),
      user.role==='owner'?q('channel_rules','*','name.asc'):Promise.resolve([]),user.role==='owner'?q('suppliers','*','name.asc'):Promise.resolve([]),user.role==='owner'?q('purchase_orders','*','created_at.desc'):Promise.resolve([]),user.role==='owner'?q('inventory_ledger','*','created_at.desc'):Promise.resolve([]),user.role==='owner'?q('settlements','*','created_at.desc'):Promise.resolve([]),user.role==='owner'?q('disputes','*','created_at.desc'):Promise.resolve([]),user.role==='owner'?q('automation_rules','*','kind.asc'):Promise.resolve([]),q('notifications','*','created_at.desc'),user.role==='owner'?q('dashboard_preferences','*','updated_at.desc'):Promise.resolve([]),user.role==='owner'?q('customer_tags','*','updated_at.desc'):Promise.resolve([]),
    ])
    const canFinancial=user.role==='owner'||Boolean(user.permissions?.canViewFinancials);const canStock=user.role==='owner'||user.permissions?.canViewStock!==false
    const mappedProducts=(products||[]).map(toProduct).map((p:any)=>({...p,stock:canStock?p.stock:0,modal:canFinancial?p.modal:0,fixed:canFinancial?p.fixed:0,other:canFinancial?p.other:0}))
    const mappedOrders=(orders||[]).map(toOrder).map((o:any)=>canFinancial?o:{...o,snapshot:{...o.snapshot,unitModal:0,fixedCost:0,otherUnitCost:0,capital:0,totalCost:0,profit:0}})
    return NextResponse.json({products:mappedProducts,orders:mappedOrders,opportunities:user.role==='owner'?(opps||[]).map(toOpp):[],audit:(audit||[]).slice(0,1000).map(toAudit),restocks:user.role==='owner'?(restocks||[]).map(toRestock):[],expenses:user.role==='owner'?(expenses||[]).map(toExpense):[],targets:user.role==='owner'?(targets||[]).map(toTarget):[],priceHistory:user.role==='owner'?(history||[]).map(toHistory):[],customerNotes:user.role==='owner'?(customerNotes||[]).map(toCustomerNote):[],profiles:user.role==='owner'?profiles:[profiles.find((p:any)=>p.id===user.id)].filter(Boolean),v4:{channelRules:(channels||[]).map(toChannel),suppliers:(suppliers||[]).map(toSupplier),purchaseOrders:(pos||[]).map(toPO),inventoryLedger:(ledger||[]).map(toLedger),settlements:(settlements||[]).map(toSettlement),disputes:(disputes||[]).map(toDispute),automationRules:(rules||[]).map(toRule),notifications:(notifications||[]).map(toNotification),dashboardPreferences:prefs?.[0]?toPrefs(prefs[0]):null,customerTags:(tags||[]).map(toTag)}})
  }catch(e:any){return NextResponse.json({error:e.message||'Gagal mengambil data cloud'},{status:401})}
}

export async function POST(req:Request){
  try{
    const {entity,data,replace,deletedIds=[]}=await readJson<{entity:string;data:any[];replace?:boolean;deletedIds?:string[]}>(req,4_000_000);const user=await currentUser();if(user.role!=='owner')return NextResponse.json({error:'Hanya Owner yang boleh sinkronisasi data'},{status:403});const table=tableMap[entity];if(!table||!Array.isArray(data))return NextResponse.json({error:'Entity/data tidak valid'},{status:400});if(data.length>10000||deletedIds.length>10000)return NextResponse.json({error:'Terlalu banyak record dalam satu request'},{status:413});if(ownerOnly.has(entity)&&user.role!=='owner')return NextResponse.json({error:'Owner only'},{status:403})
    let rows=data.map((x:any)=>fromRow(entity,x))
    // Optimistic conflict detection for frequently edited records. If cloud was changed after
    // the local copy was loaded, keep the mutation in the offline queue instead of silently overwriting it.
    if(['products','orders','suppliers','purchase_orders','settlements','disputes','channel_rules','automation_rules'].includes(entity)){
      for(const row of rows){
        const clientUpdated=row.updated_at ? new Date(row.updated_at).getTime() : 0
        if(!clientUpdated)continue
        const remote=await jsonFrom(await supabaseFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(String(row.id))}&select=id,updated_at&limit=1`))
        const remoteUpdated=remote?.[0]?.updated_at?new Date(remote[0].updated_at).getTime():0
        if(remoteUpdated>clientUpdated+1500)return NextResponse.json({error:`Konflik perubahan ${entity}:${row.id}. Tarik data cloud lalu ulangi perubahan.`},{status:409})
      }
      const stamp=new Date().toISOString();rows=rows.map((r:any)=>Object.prototype.hasOwnProperty.call(r,'updated_at')?{...r,updated_at:stamp}:r)
    }
    if(['orders','restocks','price_history','purchase_orders','inventory_ledger'].includes(entity)&&rows.length){const cloudProducts=await jsonFrom(await supabaseFetch('/rest/v1/products?select=id'));const valid=new Set((cloudProducts||[]).map((x:any)=>String(x.id)));rows=rows.map((x:any)=>({...x,product_id:x.product_id&&valid.has(String(x.product_id))?x.product_id:null}))}
    if(entity==='customer_notes'){const seen=new Set<string>();rows=[...rows].reverse().filter((x:any)=>{const k=String(x.buyer_identifier||'').trim().toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true}).reverse()}
    if(entity==='business_targets'){const seen=new Set<string>();rows=[...rows].reverse().filter((x:any)=>{const k=String(x.month_key||'');if(!k||seen.has(k))return false;seen.add(k);return true}).reverse()}
    const conflict=entity==='business_targets'?'month_key':entity==='customer_notes'?'buyer_key':entity==='channel_rules'?'id':entity==='dashboard_preferences'?'id':entity==='customer_tags'?'buyer_key':'id'
    if(rows.length){const res=await supabaseFetch(`/rest/v1/${table}?on_conflict=${conflict}`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});await jsonFrom(res)}
    if(Array.isArray(deletedIds)&&deletedIds.length){for(const rid of deletedIds)await jsonFrom(await supabaseFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(String(rid))}`,{method:'DELETE'}))}
    if(replace){const existing=await jsonFrom(await supabaseFetch(`/rest/v1/${table}?select=id`));const ids=new Set(rows.map((x:any)=>String(x.id)));const remove=(existing||[]).map((x:any)=>String(x.id)).filter((x:string)=>!ids.has(x));for(const rid of remove)await jsonFrom(await supabaseFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(rid)}`,{method:'DELETE'}))}
    return NextResponse.json({ok:true,count:rows.length,deleted:Array.isArray(deletedIds)?deletedIds.length:0})
  }catch(e:any){return NextResponse.json({error:e.message||'Sync gagal'},{status:apiStatus(e,500)})}
}
