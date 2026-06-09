import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const { penalty_history_id, reason } = await req.json();
  if (!penalty_history_id || !reason || reason.length < 10) {
    return err('UNAUTHORIZED', 'penalty_history_id와 사유(10자 이상)가 필요합니다', 400);
  }

  const supabase = createServiceClient();

  const { data: penalty } = await supabase
    .from('penalty_history')
    .select('id, account_id, points')
    .eq('id', penalty_history_id)
    .single();

  if (!penalty) return err('NOT_FOUND', '벌점 내역을 찾을 수 없습니다', 404);
  if (penalty.account_id !== user.id) return err('FORBIDDEN', '본인의 벌점만 이의제기할 수 있습니다', 403);
  if (penalty.points <= 0) return err('CONFLICT', '벌점 부과 내역만 이의제기할 수 있습니다', 409);

  const { data: existing } = await supabase
    .from('disputes')
    .select('id')
    .eq('penalty_history_id', penalty_history_id)
    .maybeSingle();

  if (existing) return err('CONFLICT', '이미 이의제기가 접수된 내역입니다', 409);

  const { data, error } = await supabase
    .from('disputes')
    .insert({
      penalty_history_id,
      account_id: user.id,
      reason,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return err('UNAUTHORIZED', '이의제기 접수에 실패했습니다', 500);
  return ok(data, 201);
}
