import { type NextRequest, NextResponse } from 'next/server'

const PROTECTED = [
  '/workspace',
  '/generate',
  '/gallery',
  '/video',
  '/audio',
  '/agents',
  '/workflows',
  '/datasets',
  '/training',
  '/models',
  '/billing',
  '/settings',
  '/team',
]

const AUTH_ONLY = ['/signin', '/signup', '/forgot-password']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has('aether_refresh')

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const isAuthOnly = AUTH_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/signin'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthOnly && hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/workspace'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
