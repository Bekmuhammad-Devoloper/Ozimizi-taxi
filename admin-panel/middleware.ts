import { NextRequest, NextResponse } from 'next/server';

type Role = 'admin' | 'coordinator' | 'kitchen';

interface JwtPayload {
  role?: Role;
  exp?: number;
}

const HOME: Record<Role, string> = {
  admin: '/dashboard',
  coordinator: '/coordinator',
  kitchen: '/kitchen',
};

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
  // Telegram Mini App entry — must be reachable without a cookie so the
  // page can exchange initData for a JWT.
  const isTelegramEntry = path === '/tg' || path.startsWith('/tg/');
  // Coordinator workspace lives at /coordinator (singular). The admin-only
  // /coordinators page (plural — manages coordinator accounts) must NOT
  // match, hence the boundary check.
  const isCoordinator =
    path === '/coordinator' ||
    path.startsWith('/coordinator/') ||
    // Own-password page is shared by both roles.
    path === '/password';
  // Kitchen (oshxona) panel lives at /kitchen (singular). The admin-only
  // /kitchens pages (plural — manage kitchens) must NOT match.
  const isKitchen = path === '/kitchen' || path.startsWith('/kitchen/');

  const payload = decodeJwt(token);
  const isAuthed =
    !!payload &&
    (!payload.exp || payload.exp * 1000 > Date.now()) &&
    (payload.role === 'admin' ||
      payload.role === 'coordinator' ||
      payload.role === 'kitchen');

  if (!isAuthed) {
    if (isLogin || isTelegramEntry) return NextResponse.next();
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const role = payload!.role as Role;

  // Logged in — bounce off the login page
  if (isLogin) {
    return NextResponse.redirect(new URL(HOME[role], req.url));
  }

  // Role-walled sections
  if (role === 'kitchen') {
    if (!isKitchen) return NextResponse.redirect(new URL('/kitchen', req.url));
    return NextResponse.next();
  }
  if (isKitchen) {
    // Admins manage kitchens from /kitchens; coordinators have no access.
    return NextResponse.redirect(new URL(role === 'admin' ? '/kitchens' : HOME[role], req.url));
  }
  if (role === 'coordinator' && !isCoordinator) {
    return NextResponse.redirect(new URL('/coordinator', req.url));
  }
  if (role === 'admin' && isCoordinator && path !== '/password') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Static files (logo, PWA icons, manifest.json) must load without a login
  // cookie — the browser fetches the manifest anonymously, and a redirect
  // to /login would break "Add to home screen".
  matcher: [
    '/((?!_next|favicon|public|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|json|webmanifest|txt)$).*)',
  ],
};
