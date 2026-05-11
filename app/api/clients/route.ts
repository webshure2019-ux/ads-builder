import { NextRequest, NextResponse } from 'next/server'
import { listMccClients } from '@/lib/google-ads'
import { requireAuth } from '@/lib/auth'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  try {
    const clients = await listMccClients()
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('[/api/clients]', error)
    const message = googleAdsErrorMessage(error, 'Failed to fetch client accounts')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
