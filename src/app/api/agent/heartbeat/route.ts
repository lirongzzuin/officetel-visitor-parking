import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { validateAgentToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!validateAgentToken(req)) return err('AGENT_AUTH_FAILED', '에이전트 토큰 인증 실패', 401);

  const body = await req.json();
  const supabase = createServiceClient();

  await supabase.from('agent_heartbeats').insert({
    agent_version:     body.agent_version,
    cartan_ok:         body.cartan_ok,
    camera_ok:         body.camera_ok,
    last_sync_success: body.last_sync_success,
    queue_processed:   body.queue_processed ?? 0,
    error_count:       body.error_count ?? 0,
  });

  return ok({ received: true });
}
