import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 인증 불필요 경로
const UNPROTECTED = new Set(['/', '/api/agent']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 에이전트 API는 별도 토큰 인증이므로 통과
  if (pathname.startsWith('/api/agent/')) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()  { return request.cookies.getAll(); },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  // 세션 갱신 (쿠키 업데이트 목적)
  const { data: { user } } = await supabase.auth.getUser();

  // 보호된 경로에 비로그인 상태 → 로그인 페이지로
  const protectedPaths = [
    '/home', '/register', '/lookup', '/report',
    '/visits', '/penalties', '/settings', '/change-password',
  ];
  if (!user && protectedPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 이미 로그인인데 로그인 페이지 접근 → 홈으로
  if (user && pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return response;
}

export const proxyConfig = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
};
