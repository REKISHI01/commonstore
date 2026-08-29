export class ApiRequestError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

export function assertSameOrigin(req:Request){
  const origin=req.headers.get('origin')
  const fetchSite=req.headers.get('sec-fetch-site')
  if(fetchSite&& !['same-origin','same-site','none'].includes(fetchSite))throw new ApiRequestError('Request lintas situs ditolak',403)
  if(!origin)return
  const host=(req.headers.get('x-forwarded-host')||req.headers.get('host')||'').split(',')[0].trim()
  if(!host)return
  try{if(new URL(origin).host!==host)throw new ApiRequestError('Origin tidak valid',403)}catch(e){if(e instanceof ApiRequestError)throw e;throw new ApiRequestError('Origin tidak valid',403)}
}

export async function readJson<T=any>(req:Request,maxBytes=262_144):Promise<T>{
  assertSameOrigin(req)
  const type=req.headers.get('content-type')||''
  if(!type.toLowerCase().includes('application/json'))throw new ApiRequestError('Content-Type harus application/json',415)
  const len=Number(req.headers.get('content-length')||0)
  if(len>maxBytes)throw new ApiRequestError('Payload terlalu besar',413)
  const text=await req.text()
  if(new TextEncoder().encode(text).length>maxBytes)throw new ApiRequestError('Payload terlalu besar',413)
  try{return JSON.parse(text) as T}catch{throw new ApiRequestError('JSON tidak valid',400)}
}

export const apiStatus=(e:unknown,fallback=500)=>e instanceof ApiRequestError?e.status:fallback
