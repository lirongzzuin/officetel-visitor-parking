import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { validateAgentToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!validateAgentToken(req)) return err('AGENT_AUTH_FAILED', '에이전트 토큰 인증 실패', 401);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('agent_commands')
    .select('id, cmd, params, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);

  return ok({ commands: data ?? [] });
}
