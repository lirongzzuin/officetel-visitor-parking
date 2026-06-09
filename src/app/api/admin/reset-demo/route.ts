import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);
  if (user.role !== 'admin') return err('FORBIDDEN', '관리자만 접근 가능합니다', 403);

  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();

  // Resolve target account
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

  // Clear all data for the target account
  await supabase.from('visitor_registrations').delete().eq('account_id', targetId);
  await supabase.from('favorites').delete().eq('account_id', targetId);

  const { data: phRows } = await supabase
    .from('penalty_history')
    .select('id')
    .eq('account_id', targetId);

  if (phRows && phRows.length > 0) {
    const ids = phRows.map((r: { id: string }) => r.id);
    await supabase.from('disputes').delete().in('penalty_history_id', ids);
    await supabase.from('penalty_history').delete().eq('account_id', targetId);
  }

  await supabase.from('accounts')
    .update({ penalty_points: 0, banned_until: null })
    .eq('id', targetId);

  return ok({ message: '데이터가 초기화되었습니다' });
}
