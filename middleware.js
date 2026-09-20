import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/dashboard')) {
    const tokenCookie =
      req.cookies.get('__Secure-next-auth.session-token')?.value ||
      req.cookies.get('next-auth.session-token')?.value;

    if (!tokenCookie) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      const secretStr = process.env.NEXTAUTH_SECRET || "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem";
      const secretKey = new TextEncoder().encode(secretStr);
      const { payload } = await jwtVerify(tokenCookie, secretKey);

      if (!payload || !payload.id) {
        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }

      const isBoard = payload.role === 'BOARD' || payload.role === 'OWNER';
      const isPendingOrBlocked =
        payload.driverStatus === 'WAITING_FOR_APPROVAL' ||
        payload.driverStatus === 'INACTIVE' ||
        payload.driverStatus === 'SUSPENDED';

      if (!isBoard && isPendingOrBlocked && pathname !== '/dashboard') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    } catch (err) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
