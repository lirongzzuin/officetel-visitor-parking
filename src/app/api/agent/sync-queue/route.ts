import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { validateAgentToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!validateAgentToken(req)) return err('AGENT_AUTH_FAILED', '에이전트 토큰 인증 실패', 401);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('sync_queue')
    .select('id, action, payload, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  // 조회한 항목을 processing으로 마킹
  if (data && data.length > 0) {
    const ids = data.map((r: { id: string }) => r.id);
    await supabase
      .from('sync_queue')
      .update({ status: 'processing' })
      .in('id', ids);
  }

  return ok({ items: data ?? [] });
}
