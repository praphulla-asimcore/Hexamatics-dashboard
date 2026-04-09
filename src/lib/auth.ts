import type { AuthOptions, User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { validateUserCredentials } from './users'

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) return null
        const user = await validateUserCredentials(credentials.email, credentials.password)
        if (!user) return null
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // @ts-expect-error extended field
          role: user.role,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).id = token.id
      }
      return session
    },
  },
}
