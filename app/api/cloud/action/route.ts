import { NextResponse } from 'next/server'
import { currentUser, jsonFrom, supabaseFetch } from '../../../../lib/cloud-server'
import { ApiRequestError, apiStatus, readJson } from '../../../../lib/api-guard'

const requiredText=(v:unknown,label:string,max=250)=>{const s=String(v??'').trim();if(!s)throw new ApiRequestError(`${label} wajib diisi`,400);if(s.length>max)throw new ApiRequestError(`${label} terlalu panjang`,400);return s}
const positiveInt=(v:unknown,label:string,max=100000)=>{const n=Number(v);if(!Number.isInteger(n)||n<1||n>max)throw new ApiRequestError(`${label} tidak valid`,400);return n}
const nonNegative=(v:unknown,label:string,max=1_000_000_000)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)throw new ApiRequestError(`${label} tidak valid`,400);return n}

export async function POST(req:Request){
  try{
    const {action,payload={}}=await readJson<{action:string;payload?:any}>(req,131072)
    await currentUser()
    const rpc:Record<string,{fn:string;body:(p:any)=>any}>={
      createOrder:{fn:'create_order_atomic',body:p=>({p_product_id:requiredText(p.productId,'Product ID',100),p_buyer_identifier:requiredText(p.buyerIdentifier,'Username/User ID',200),p_qty:positiveInt(p.qty,'Qty',10000),p_note:String(p.note||'').slice(0,1000),p_server_id:String(p.serverId||'').slice(0,200),p_channel:String(p.channel||'Itemku').slice(0,100)})},
      transitionOrder:{fn:'transition_order_atomic',body:p=>{const status=requiredText(p.status,'Status',30);if(!['Baru','Diproses','Menunggu','Selesai','Refund','Cancel'].includes(status))throw new ApiRequestError('Status order tidak valid',400);return{p_order_id:requiredText(p.orderId,'Order ID',100),p_status:status,p_refund_reason:String(p.refundReason||'').slice(0,1000),p_restore_stock:Boolean(p.restoreStock)}}},
      restock:{fn:'restock_product_atomic',body:p=>({p_product_id:requiredText(p.productId,'Product ID',100),p_qty:positiveInt(p.qty,'Qty',100000),p_unit_cost:nonNegative(p.unitCost,'Unit cost'),p_supplier:String(p.supplier||'').slice(0,200),p_note:String(p.note||'').slice(0,1000)})},
      adjustStock:{fn:'adjust_stock_atomic',body:p=>({p_product_id:requiredText(p.productId,'Product ID',100),p_new_stock:nonNegative(p.newStock,'Stok',100000000),p_note:String(p.note||'').slice(0,1000)})},
      receivePurchaseOrder:{fn:'receive_purchase_order_atomic',body:p=>({p_po_id:requiredText(p.purchaseOrderId,'Purchase Order ID',100)})},
      assignOrder:{fn:'assign_order_atomic',body:p=>({p_order_id:requiredText(p.orderId,'Order ID',100),p_worker_id:p.workerId?requiredText(p.workerId,'Worker ID',100):null})},
      markNotificationsRead:{fn:'worker_mark_notifications_read',body:p=>({p_ids:Array.isArray(p.ids)&&p.ids.length?p.ids.map((x:any)=>requiredText(x,'ID notifikasi',150)):null})},
    }
    const cfg=rpc[action]
    if(!cfg)return NextResponse.json({error:'Action tidak dikenal'},{status:400})
    const res=await supabaseFetch(`/rest/v1/rpc/${cfg.fn}`,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(cfg.body(payload))})
    return NextResponse.json({ok:true,result:await jsonFrom(res)})
  }catch(e:any){return NextResponse.json({error:e.message||'Action cloud gagal'},{status:apiStatus(e,500)})}
}
