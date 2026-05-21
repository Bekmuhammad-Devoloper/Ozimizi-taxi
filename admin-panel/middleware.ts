import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  const isLogin = req.nextUrl.pathname === '/login';
  if (!token && !isLogin) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (token && isLogin) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon|public).*)'],
};
