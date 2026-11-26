import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 公网分享时的门禁：设了 SHARE_GATE 就必须带口令
// 链接形如 https://xxx/?k=口令，进来后写 cookie，之后正常访问
const GATE = process.env.SHARE_GATE

export function middleware(req: NextRequest) {
  if (!GATE) return NextResponse.next()

  const { searchParams } = req.nextUrl
  const key = searchParams.get('k')
  const cookie = req.cookies.get('wg')?.value

  if (key === GATE) {
    const url = req.nextUrl.clone()
    url.searchParams.delete('k')
    const res = NextResponse.redirect(url)
    res.cookies.set('wg', GATE, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  }

  if (cookie === GATE) return NextResponse.next()

  return new NextResponse('需要访问口令：在网址后面加上 ?k=口令', {
    status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
}
