import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

function kstDate(offsetDays = 0): string {
  return new Date(Date.now() + (9 + offsetDays * 24) * 3600_000).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);
  if (user.role !== 'admin') return err('FORBIDDEN', '관리자만 접근 가능합니다', 403);

  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();

  // Resolve target account (by unit_number param, or self)
  let targetId = user.id;
  if (body.unit) {
    const { data: acc } = await supabase
      .from('accounts')
      .select('id')
      .eq('unit_number', String(body.unit))
      .single();
    if (!acc) return err('NOT_FOUND', `${body.unit}호 계정을 찾을 수 없습니다`, 404);
    targetId = acc.id;
  }

  const today     = kstDate(0);
  const tomorrow  = kstDate(1);
  const yesterday = kstDate(-1);
  const day2      = kstDate(-2);
  const day5      = kstDate(-5);

  // Clear existing data for target account
  await Promise.all([
    supabase.from('visitor_registrations').delete().eq('account_id', targetId),
    supabase.from('favorites').delete().eq('account_id', targetId),
  ]);

  const { data: phRows } = await supabase
    .from('penalty_history')
    .select('id')
    .eq('account_id', targetId);
  if (phRows && phRows.length > 0) {
    const ids = phRows.map((r: { id: string }) => r.id);
    await supabase.from('disputes').delete().in('penalty_history_id', ids);
    await supabase.from('penalty_history').delete().eq('account_id', targetId);
  }

  // Seed visitor registrations
  await supabase.from('visitor_registrations').insert([
    { account_id: targetId, plate_normalized: '12가3456', plate_display: '12가 3456', nickname: '부모님', valid_date: today, status: 'active' },
    { account_id: targetId, plate_normalized: '78너1234', plate_display: '78너 1234', nickname: '동생', valid_date: today, status: 'active' },
    { account_id: targetId, plate_normalized: '99하1234', plate_display: '99하 1234', nickname: '택배', valid_date: tomorrow, status: 'active' },
    { account_id: targetId, plate_normalized: '45마9012', plate_display: '45마 9012', nickname: '친구', valid_date: yesterday, status: 'expired' },
    { account_id: targetId, plate_normalized: '55자9981', plate_display: '55자 9981', nickname: '친구 모임', valid_date: yesterday, status: 'expired' },
    { account_id: targetId, plate_normalized: '22나5678', plate_display: '22나 5678', nickname: '지인', valid_date: day2, status: 'cancelled', cancelled_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
    { account_id: targetId, plate_normalized: '33라8765', plate_display: '33라 8765', nickname: '택배2', valid_date: day5, status: 'expired' },
  ]);

  // Seed favorites
  await supabase.from('favorites').insert([
    { account_id: targetId, plate_normalized: '78너1234', plate_display: '78너 1234', nickname: '동생', emoji: '👨‍👧' },
    { account_id: targetId, plate_normalized: '45마9012', plate_display: '45마 9012', nickname: '부모님', emoji: '👪' },
    { account_id: targetId, plate_normalized: '99하1234', plate_display: '99하 1234', nickname: '택배', emoji: '📦' },
  ]);

  // Seed penalty history (net 0 → CLEAN state)
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400_000).toISOString();
  const twoMonthsAgo   = new Date(Date.now() - 60 * 86400_000).toISOString();
  const oneMonthAgo    = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data: penalty1 } = await supabase.from('penalty_history').insert({
    account_id: targetId,
    points: 2,
    type: 'penalty',
    reason: '등록 외 구역 주차',
    detail: 'B2층 402호 근처 소방시설물 근접 주차 민원 접수 및 현장 확인 완료',
    created_at: threeMonthsAgo,
  }).select().single();

  await supabase.from('penalty_history').insert({
    account_id: targetId,
    points: -2,
    type: 'reduction',
    reason: '벌점 자동 소멸',
    detail: '6개월 무사고 유지 보너스 벌점 감면 혜택 적용',
    created_at: twoMonthsAgo,
  });

  const { data: penalty2 } = await supabase.from('penalty_history').insert({
    account_id: targetId,
    points: 1,
    type: 'penalty',
    reason: '장기 미출차 알림',
    detail: '72시간 이상 동일 구역 방치 (규정 제 12조 위반)',
    created_at: oneMonthAgo,
  }).select().single();

  // Add a rejected dispute for penalty2
  if (penalty2) {
    await supabase.from('disputes').insert({
      penalty_history_id: penalty2.id,
      account_id: targetId,
      reason: '해당 기간 동안 차량을 사용하지 않은 이유는 출장 때문이었습니다.',
      status: 'rejected',
      admin_note: '증빙 자료 불충분으로 기각',
      created_at: new Date(Date.now() - 25 * 86400_000).toISOString(),
      resolved_at: new Date(Date.now() - 23 * 86400_000).toISOString(),
    });
  }

  // Update accounts.penalty_points = 1 (2 - 2 + 1 = 1)
  await supabase.from('accounts').update({ penalty_points: 1 }).eq('id', targetId);

  return ok({ message: '데모 데이터가 성공적으로 초기화되었습니다' });
}
