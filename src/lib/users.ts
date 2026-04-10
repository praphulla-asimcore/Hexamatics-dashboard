import { compare, hash } from 'bcryptjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import type { AppUser, InviteToken, UsersStore } from '@/types'

// /tmp is writable on Vercel; bundle path is read-only (initial seed only)
const TMP_FILE = '/tmp/hexa-users.json'
const BUNDLE_FILE = path.join(process.cwd(), 'src/data/users.json')

function readStore(): UsersStore {
  // Prefer /tmp (has any writes made this instance), fall back to bundle
  for (const file of [TMP_FILE, BUNDLE_FILE]) {
    try {
      if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf-8'))
    } catch {}
  }
  return { users: [], invites: [] }
}

function writeStore(store: UsersStore) {
  writeFileSync(TMP_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

// ─── Admin from env ───────────────────────────────────────────────────────────

function getAdminFromEnv(): { email: string; name: string; password: string } | null {
  const email = (process.env.ADMIN_EMAIL || '').trim()
  const password = (process.env.ADMIN_PASSWORD || '').trim()
  if (!email || !password) return null
  return { email, name: (process.env.ADMIN_NAME || 'Praphulla').trim(), password }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export async function validateUserCredentials(
  email: string,
  password: string
): Promise<AppUser | null> {
  // Check env-based admin first
  const admin = getAdminFromEnv()
  if (admin && email.toLowerCase() === admin.email.toLowerCase()) {
    if (password === admin.password) {
      return {
        id: 'admin',
        email: admin.email,
        name: admin.name,
        role: 'admin',
        passwordHash: '',
        createdAt: new Date().toISOString(),
      }
    }
    return null
  }

  // Check stored users
  const store = readStore()
  const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
  if (!user) return null

  const valid = await compare(password, user.passwordHash)
  return valid ? user : null
}

// ─── User management ──────────────────────────────────────────────────────────

export function getUsers(): AppUser[] {
  const store = readStore()
  const admin = getAdminFromEnv()
  const adminUser: AppUser[] = admin
    ? [{
        id: 'admin',
        email: admin.email,
        name: admin.name,
        role: 'admin',
        passwordHash: '',
        createdAt: '',
      }]
    : []
  return [...adminUser, ...store.users]
}

export function getInvites(): InviteToken[] {
  const store = readStore()
  const now = new Date().toISOString()
  return store.invites.filter((i) => i.expiresAt > now)
}

export async function createInvite(
  email: string,
  name: string,
  role: 'admin' | 'viewer',
  invitedBy: string
): Promise<InviteToken> {
  const store = readStore()

  // Check not already a user
  const exists = store.users.some((u) => u.email.toLowerCase() === email.toLowerCase())
  if (exists) throw new Error('User already exists')

  // Remove old invite for same email
  store.invites = store.invites.filter((i) => i.email.toLowerCase() !== email.toLowerCase())

  const token = Buffer.from(`${email}:${Date.now()}:${Math.random()}`).toString('base64url')
  const invite: InviteToken = {
    token,
    email,
    name,
    role,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy,
  }
  store.invites.push(invite)
  writeStore(store)
  return invite
}

export async function acceptInvite(
  token: string,
  password: string
): Promise<AppUser> {
  const store = readStore()
  const now = new Date().toISOString()
  const invite = store.invites.find((i) => i.token === token && i.expiresAt > now)
  if (!invite) throw new Error('Invalid or expired invite')

  const passwordHash = await hash(password, 10)
  const user: AppUser = {
    id: `u_${Date.now()}`,
    email: invite.email,
    name: invite.name,
    role: invite.role,
    passwordHash,
    createdAt: new Date().toISOString(),
  }

  store.users.push(user)
  store.invites = store.invites.filter((i) => i.token !== token)
  writeStore(store)
  return user
}

export function getInviteByToken(token: string): InviteToken | null {
  const store = readStore()
  const now = new Date().toISOString()
  return store.invites.find((i) => i.token === token && i.expiresAt > now) ?? null
}

export function deleteUser(id: string) {
  const store = readStore()
  store.users = store.users.filter((u) => u.id !== id)
  writeStore(store)
}

export function revokeInvite(token: string) {
  const store = readStore()
  store.invites = store.invites.filter((i) => i.token !== token)
  writeStore(store)
}
