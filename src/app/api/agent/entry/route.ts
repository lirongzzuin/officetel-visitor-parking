import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, formatPlate, todayKST } from '@/lib/api';
import { validateAgentToken } from '@/lib/auth';
import { notifyEntry } from '@/lib/telegram';

/**
 * POST /api/agent/entry
 * Cartan 게이트웨이 에이전트가 차량 입차를 감지했을 때 호출.
 * Body: { plate: string, timestamp?: string (ISO) }
 */
export async function POST(req: NextRequest) {
  if (!validateAgentToken(req)) return err('AGENT_AUTH_FAILED', '에이전트 토큰 인증 실패', 401);

  const body = await req.json();
  const rawPlate: string = body.plate ?? '';
  if (!rawPlate) return err('INVALID_PLATE', 'plate는 필수입니다', 400);

  const plateNorm = normalizePlate(rawPlate);
  const plateDisp = formatPlate(rawPlate);
  const today = todayKST();
  const supabase = createServiceClient();

  // 오늘 방문 등록 여부 확인
  const { data: visitor } = await supabase
    .from('visitor_registrations')
    .select('id, account_id, accounts(unit_number)')
    .eq('plate_normalized', plateNorm)
    .eq('valid_date', today)
    .eq('status', 'active')
    .limit(1);

  const reg = visitor?.[0] as {
    id: string;
    account_id: string;
    accounts: { unit_number: string } | null;
  } | undefined;

  if (reg?.accounts?.unit_number) {
    void notifyEntry(plateDisp, reg.accounts.unit_number);
  }

  return ok({ plate: plateDisp, unit: reg?.accounts?.unit_number ?? null });
}
