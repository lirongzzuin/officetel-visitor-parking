import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, isNightKST, todayKST } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  if (user.role !== 'admin' && !isNightKST()) {
    return err('TIME_RESTRICTED', '차량 조회는 오후 6시~오전 6시에만 가능합니다', 403);
  }

  const raw = req.nextUrl.searchParams.get('plate') ?? '';
  if (!raw) return err('INVALID_PLATE', 'plate 파라미터가 필요합니다', 400);

  const plateNorm = normalizePlate(raw);
  const today = todayKST();
  const supabase = createServiceClient();

  const [{ data: household }, { data: visitor }] = await Promise.all([
    // 세대 등록 차량 (미래: account_vehicles 테이블 추가 후 여기서 조회)
    // 현재는 visitor_registrations에서 오늘+활성 상태로 조회
    supabase
      .from('visitor_registrations')
      .select('account_id, plate_display')
      .eq('plate_normalized', plateNorm)
      .eq('valid_date', today)
      .eq('status', 'active')
      .limit(1),
    supabase
      .from('visitor_registrations')
      .select('account_id, accounts(unit_number)')
      .eq('plate_normalized', plateNorm)
      .eq('valid_date', today)
      .neq('status', 'cancelled')
      .limit(1),
  ]);

  if (visitor && visitor.length > 0) {
    const reg = visitor[0] as unknown as { account_id: string; accounts: { unit_number: string } | null };
    return ok({
      kind: 'visitor',
      unit: reg.accounts?.unit_number ?? '?',
      plate_display: normalizePlate(raw),
    });
  }

  return ok({ kind: 'unknown', plate_display: plateNorm });
}
