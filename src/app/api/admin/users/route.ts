import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getUsers, deleteUser, createInvite, getInvites, revokeInvite } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin(req: NextRequest) {
  const session = await getSession()
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const users = getUsers()
  const invites = getInvites()
  return NextResponse.json({ users: users.map(u => ({ ...u, passwordHash: undefined })), invites })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const session = await getSession()
  const { action, email, name, role, userId, token } = await req.json()

  try {
    if (action === 'invite') {
      const invite = await createInvite(email, name, role ?? 'viewer', session!.user!.email!)
      const baseUrl = process.env.NEXTAUTH_URL || `https://${req.headers.get('host')}`
      return NextResponse.json({ invite, link: `${baseUrl}/invite/${invite.token}` })
    }
    if (action === 'delete') {
      deleteUser(userId)
      return NextResponse.json({ ok: true })
    }
    if (action === 'revoke') {
      revokeInvite(token)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
