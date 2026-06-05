import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { validateAgentToken } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateAgentToken(req)) return err('AGENT_AUTH_FAILED', '에이전트 토큰 인증 실패', 401);

  const { id } = await params;
  const { result } = await req.json();
  const supabase = createServiceClient();

  await supabase
    .from('agent_commands')
    .update({ status: 'done', result, processed_at: new Date().toISOString() })
    .eq('id', id);

  return ok({ acked: id });
}
