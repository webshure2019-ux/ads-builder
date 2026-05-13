import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getRSAHealth } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// GET /api/rsa-health?client_account_id=...
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const clientAccountId  = searchParams.get('client_account_id') ?? ''
  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })

  try {
    const ads = await getRSAHealth(clientAccountId)
    return NextResponse.json({ ads })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to fetch RSA health') },
      { status: 500 },
    )
  }
}
