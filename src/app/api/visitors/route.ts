import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, formatPlate, isValidPlate, todayKST } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

const DAILY_QUOTA = parseInt(process.env.NEXT_PUBLIC_DAILY_QUOTA ?? '10');

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const date = req.nextUrl.searchParams.get('date') ?? todayKST();
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('visitor_registrations')
    .select('id, plate_normalized, plate_display, nickname, valid_date, status, registered_at')
    .eq('account_id', user.id)
    .eq('valid_date', date)
    .order('registered_at', { ascending: false });

  return ok(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  // 정지 확인
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    const until = new Date(user.banned_until).toLocaleDateString('ko-KR');
    return err('BANNED', `벌점 초과로 ${until}까지 이용이 제한됩니다`, 403);
  }

  const body = await req.json();
  const { plate, valid_date, nickname } = body;

  if (!plate || !valid_date) return err('UNAUTHORIZED', 'plate와 valid_date는 필수입니다', 400);
  if (!isValidPlate(plate)) return err('INVALID_PLATE', '올바른 차량번호 형식이 아닙니다', 400);

  const plateNorm = normalizePlate(plate);
  const plateDisp = formatPlate(plate);

  const supabase = createServiceClient();

  // 일일 한도 확인
  const { count } = await supabase
    .from('visitor_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', user.id)
    .eq('valid_date', valid_date)
    .eq('status', 'active');

  if ((count ?? 0) >= DAILY_QUOTA) {
    return err('QUOTA_EXCEEDED', `하루 최대 ${DAILY_QUOTA}대까지 등록 가능합니다`, 429);
  }

  const { data, error } = await supabase
    .from('visitor_registrations')
    .insert({
      account_id: user.id,
      plate_normalized: plateNorm,
      plate_display: plateDisp,
      nickname: nickname ?? null,
      valid_date,
      status: 'active',
    })
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
