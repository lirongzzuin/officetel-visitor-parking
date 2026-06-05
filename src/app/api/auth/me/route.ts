import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';
import { todayKST } from '@/lib/api';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const supabase = createServiceClient();
  const today = todayKST();

  const [{ data: account }, { count: todayCount }] = await Promise.all([
    supabase
      .from('accounts')
      .select('unit_number, role, penalty_points, banned_until, must_change_password')
      .eq('id', user.id)
      .single(),
    supabase
      .from('visitor_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', user.id)
      .eq('valid_date', today)
      .eq('status', 'active'),
  ]);

  return ok({
    id: user.id,
    unit: account?.unit_number,
    role: account?.role,
    penalty_points: account?.penalty_points ?? 0,
    banned_until: account?.banned_until,
    must_change_password: account?.must_change_password,
    today_visitor_count: todayCount ?? 0,
  });
}
