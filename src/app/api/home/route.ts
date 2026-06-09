import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, todayKST } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const today = todayKST();
  const supabase = createServiceClient();

  const [visitorsRes, favsRes] = await Promise.all([
    supabase
      .from('visitor_registrations')
      .select('id, plate_display, nickname, valid_date, status')
      .eq('account_id', user.id)
      .eq('valid_date', today)
      .eq('status', 'active')
      .order('registered_at', { ascending: false }),
    supabase
      .from('favorites')
      .select('id, plate_normalized, plate_display, nickname, emoji')
      .eq('account_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  return ok(
    {
      visitors: visitorsRes.data ?? [],
      favorites: favsRes.data ?? [],
      penalty_points: user.penalty_points ?? 0,
      unit: user.unit,
    },
    200,
    20,
  );
}
