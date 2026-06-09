import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, formatPlate, isValidPlate, todayKST, isDayKST } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';


export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to   = sp.get('to');
  const date = sp.get('date');
  const supabase = createServiceClient();

  let query = supabase
    .from('visitor_registrations')
    .select('id, plate_normalized, plate_display, nickname, valid_date, status, registered_at, cancelled_at, visit_start_time, visit_end_time')
    .eq('account_id', user.id)
    .order('valid_date', { ascending: false })
    .order('registered_at', { ascending: false });

  if (from && to) {
    query = query.gte('valid_date', from).lte('valid_date', to);
  } else if (date) {
    query = query.eq('valid_date', date);
  } else {
    query = query.eq('valid_date', todayKST());
  }

  const { data } = await query;
  return ok(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const demoMode = process.env.DEMO_MODE === 'true';
  if (user.role !== 'admin' && !demoMode && !isDayKST()) {
    return err('TIME_RESTRICTED', '차량 등록은 오전 6시~오후 6시에만 가능합니다', 403);
  }

  // 정지 확인
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    const until = new Date(user.banned_until).toLocaleDateString('ko-KR');
    return err('BANNED', `벌점 초과로 ${until}까지 이용이 제한됩니다`, 403);
  }

  const body = await req.json();
  const { plate, valid_date, nickname, visit_start_time, visit_end_time } = body;

  if (!plate || !valid_date) return err('UNAUTHORIZED', 'plate와 valid_date는 필수입니다', 400);
  if (!isValidPlate(plate)) return err('INVALID_PLATE', '올바른 차량번호 형식이 아닙니다', 400);

  const startTime: string = visit_start_time ?? '06:00';
  const endTime: string   = visit_end_time   ?? '18:00';

  const timeRe = /^(0[6-9]|1[0-7]):[03]0$|^18:00$/;
  if (!timeRe.test(startTime)) {
    return err('UNAUTHORIZED', '시작 시간은 06:00~18:00 사이여야 합니다', 400);
  }
  if (!timeRe.test(endTime)) {
    return err('UNAUTHORIZED', '종료 시간은 06:00~18:00 사이여야 합니다', 400);
  }
  if (endTime < startTime) {
    return err('UNAUTHORIZED', '종료 시간은 시작 시간 이후여야 합니다', 400);
  }

  const plateNorm = normalizePlate(plate);
  const plateDisp = formatPlate(plate);

  const supabase = createServiceClient();

  // Probe whether time columns exist (one-time check)
  const { error: colErr } = await supabase
    .from('visitor_registrations')
    .select('visit_start_time')
    .limit(0);
  const hasTimeCols = !colErr;

  const insertPayload: Record<string, unknown> = {
    account_id: user.id,
    plate_normalized: plateNorm,
    plate_display: plateDisp,
    nickname: nickname ?? null,
    valid_date,
    status: 'active',
  };
  if (hasTimeCols) {
    insertPayload.visit_start_time = startTime;
    insertPayload.visit_end_time = endTime;
  }

  const { data, error } = await supabase
    .from('visitor_registrations')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return err('CONFLICT', '해당 날짜에 이미 등록된 차량번호입니다', 409);
    }
    return err('UNAUTHORIZED', '등록에 실패했습니다', 500);
  }

  // Cartan 동기화 큐에 enqueue
  await supabase.from('sync_queue').insert({
    action: 'add_visitor',
    payload: {
      plate_normalized: plateNorm,
      plate_display: plateDisp,
      unit_number: user.unit,
      valid_date,
      registration_id: data.id,
    },
    status: 'pending',
  });

  return ok(data, 201);
}
