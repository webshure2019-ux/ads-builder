import { NextResponse } from 'next/server'
import { listMccClients } from '@/lib/google-ads'

export async function GET() {
  try {
    const clients = await listMccClients()
    return NextResponse.json({ clients })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
