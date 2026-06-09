import { NextResponse, type NextRequest } from 'next/server';


const PROTECTED = [
  '/home', '/register', '/lookup', '/report',
  '/visits', '/penalties', '/settings', '/change-password', '/notices', '/guide',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 자산 · API는 통과
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const isLoggedIn = !!request.cookies.get('officetel_unit')?.value;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));

  // 비로그인 + 보호 경로 → 로그인
  if (!isLoggedIn && isProtected) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 로그인 + 로그인 페이지 → 홈
  if (isLoggedIn && pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
};
