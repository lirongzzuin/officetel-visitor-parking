/**
 * API 라우트용 인증 헬퍼
 */
import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export interface AuthUser {
  id: string;
  unit: string;
  role: 'resident' | 'admin';
  penalty_points: number;
  banned_until: string | null;
}

/** Bearer 토큰으로 현재 사용자 조회. 실패 시 null 반환 */
export async function getRequestUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const supabase = createServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: account } = await supabase
    .from('accounts')
    .select('unit_number, role, penalty_points, banned_until, is_active')
    .eq('id', user.id)
    .single();

  if (!account || !account.is_active) return null;

  return {
    id: user.id,
    unit: account.unit_number,
    role: account.role,
    penalty_points: account.penalty_points,
    banned_until: account.banned_until,
  };
}

/** 에이전트 토큰 검증 */
export function validateAgentToken(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  return !!token && token === process.env.AGENT_TOKEN;
}
