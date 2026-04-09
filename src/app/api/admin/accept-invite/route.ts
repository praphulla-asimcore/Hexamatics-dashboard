import { NextRequest, NextResponse } from 'next/server'
import { acceptInvite, getInviteByToken } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  const invite = getInviteByToken(token)
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  return NextResponse.json({ email: invite.email, name: invite.name })
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json()
  if (!token || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  try {
    await acceptInvite(token, password)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
