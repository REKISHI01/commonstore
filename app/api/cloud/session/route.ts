import { NextResponse } from 'next/server'
import { cloudServerConfigured, currentUser } from '../../../../lib/cloud-server'
export async function GET(){
  if(!cloudServerConfigured)return NextResponse.json({user:null,configured:false})
  try{return NextResponse.json({user:await currentUser(),configured:true})}catch{return NextResponse.json({user:null,configured:true})}
}
