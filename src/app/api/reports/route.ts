import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, formatPlate, isNightKST, todayKST } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

const PENALTY_BAN_THRESHOLD = parseInt(process.env.NEXT_PUBLIC_PENALTY_LIMIT ?? '10');
const PENALTY_BAN_DAYS = parseInt(process.env.NEXT_PUBLIC_PENALTY_BAN_DAYS ?? '30');

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  if (user.role !== 'admin' && !isNightKST()) {
    return err('TIME_RESTRICTED', '신고는 오후 6시~오전 6시에만 가능합니다', 403);
  }

  const body = await req.json();
  const { plate, memo } = body;
  if (!plate) return err('INVALID_PLATE', 'plate는 필수입니다', 400);

  const plateNorm = normalizePlate(plate);
  const plateDisp = formatPlate(plate);
  const today = todayKST();
  const supabase = createServiceClient();

  // 60분 내 동일 plate 중복 신고 방지
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: dupe } = await supabase
    .from('reports')
    .select('id')
    .eq('plate_normalized', plateNorm)
    .gte('created_at', oneHourAgo)
    .limit(1);

  if (dupe && dupe.length > 0) {
    return err('CONFLICT', '60분 내 동일 차량 중복 신고는 불가합니다', 409);
  }

  // 오늘 방문 등록 여부 확인
  const { data: visitor } = await supabase
    .from('visitor_registrations')
    .select('id, account_id, accounts(unit_number)')
    .eq('plate_normalized', plateNorm)
    .eq('valid_date', today)
    .eq('status', 'active')
    .limit(1);

  const targetReg = visitor?.[0] as {
    id: string;
    account_id: string;
    accounts: { unit_number: string } | null;
  } | undefined;

  // 신고 저장
  const { data: report } = await supabase
    .from('reports')
    .insert({
      reporter_account_id: user.id,
      plate_normalized: plateNorm,
      plate_display: plateDisp,
      memo: memo ?? null,
      target_account_id: targetReg?.account_id ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (!targetReg) {
    return ok({ kind: 'unknown', report_id: report?.id });
  }

  // 방문 등록 차량 → 벌점 부과
  const { data: penaltyRow } = await supabase
    .from('penalty_history')
    .insert({
      account_id: targetReg.account_id,
      points: 1,
      type: 'penalty',
      reason: '야간 미등록 주차 신고',
      detail: `신고 차량: ${plateDisp} / 신고자: ${user.unit}호`,
      imposed_by: user.id,
      report_id: report?.id,
    })
    .select()
    .single();

  // 누적 벌점 갱신
  const { data: acc } = await supabase
    .from('accounts')
    .select('penalty_points')
    .eq('id', targetReg.account_id)
    .single();

  const newPoints = (acc?.penalty_points ?? 0) + 1;
  const banned = newPoints >= PENALTY_BAN_THRESHOLD;
  const bannedUntil = banned
    ? new Date(Date.now() + PENALTY_BAN_DAYS * 86400_000).toISOString()
    : null;

  await supabase
    .from('accounts')
    .update({ penalty_points: newPoints, ...(banned ? { banned_until: bannedUntil } : {}) })
    .eq('id', targetReg.account_id);

  return ok({
    kind: 'visitor',
    unit: targetReg.accounts?.unit_number,
    penalty_added: 1,
    total_penalty: newPoints,
    banned,
    report_id: report?.id,
  }, 201);
}
