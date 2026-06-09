import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()           { return cookieStore.getAll(); },
        setAll(toSet)      { try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
      },
    },
  );
}

// Singleton: reused across warm serverless invocations
let _serviceClient: ReturnType<typeof createServerClient> | null = null;

/** Service role 클라이언트 — RLS 우회. 서버 전용, 절대 클라이언트에 노출 금지 */
export function createServiceClient() {
  if (!_serviceClient) {
    _serviceClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    );
  }
  return _serviceClient;
}
