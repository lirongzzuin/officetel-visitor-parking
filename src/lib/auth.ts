import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export interface AuthUser {
  id: string;
  unit: string;
  role: 'resident' | 'admin';
  penalty_points: number;
  banned_until: string | null;
}

// Module-level cache: survives across warm serverless invocations
// Key = Bearer token, Value = { user, expiresAt }
const TOKEN_CACHE = new Map<string, { user: AuthUser; expiresAt: number }>();
const CACHE_TTL = 30_000; // 30s — short enough to pick up role/ban changes

function pruneCache() {
  if (TOKEN_CACHE.size < 200) return;
  const now = Date.now();
  for (const [k, v] of TOKEN_CACHE) {
    if (v.expiresAt <= now) TOKEN_CACHE.delete(k);
  }
  // Hard-evict oldest 50 if still too large
  if (TOKEN_CACHE.size >= 200) {
    const sorted = [...TOKEN_CACHE.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    sorted.slice(0, 50).forEach(([k]) => TOKEN_CACHE.delete(k));
  }
}

export async function getRequestUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const now = Date.now();
  const cached = TOKEN_CACHE.get(token);
  if (cached && cached.expiresAt > now) return cached.user;

  const supabase = createServiceClient();

  // Validate token + fetch account in parallel where possible
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: account } = await supabase
    .from('accounts')
    .select('unit_number, role, penalty_points, banned_until, is_active')
    .eq('id', user.id)
    .single();

  if (!account?.is_active) return null;

  const authUser: AuthUser = {
    id: user.id,
    unit: account.unit_number,
    role: account.role,
    penalty_points: account.penalty_points,
    banned_until: account.banned_until,
  };

  pruneCache();
  TOKEN_CACHE.set(token, { user: authUser, expiresAt: now + CACHE_TTL });
  return authUser;
}

/** 캐시에서 특정 토큰 제거 (로그아웃 시) */
export function invalidateToken(token: string) {
  TOKEN_CACHE.delete(token);
}

export function validateAgentToken(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  return !!token && token === process.env.AGENT_TOKEN;
}
