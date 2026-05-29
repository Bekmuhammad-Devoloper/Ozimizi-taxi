import { NextRequest, NextResponse } from 'next/server';

interface JwtPayload {
  role?: 'admin' | 'coordinator';
  exp?: number;
}

function decodeJwt(token: string | undefined): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  const path = req.nextUrl.pathname;
  const isLogin = path === '/login';
  // Coordinator workspace lives at /coordinator (singular). The admin-only
  // /coordinators page (plural — manages coordinator accounts) must NOT
  // match, hence the boundary check.
  const isCoordinator =
    path === '/coordinator' || path.startsWith('/coordinator/');

  const payload = decodeJwt(token);
  const isAuthed =
    !!payload &&
    (!payload.exp || payload.exp * 1000 > Date.now()) &&
    (payload.role === 'admin' || payload.role === 'coordinator');

  if (!isAuthed) {
    if (isLogin) return NextResponse.next();
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Logged in — bounce off the login page
  if (isLogin) {
    const home = payload!.role === 'coordinator' ? '/coordinator' : '/dashboard';
    return NextResponse.redirect(new URL(home, req.url));
  }

  // Role-walled sections
  if (payload!.role === 'coordinator' && !isCoordinator) {
    return NextResponse.redirect(new URL('/coordinator', req.url));
  }
  if (payload!.role === 'admin' && isCoordinator) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon|public).*)'],
};
