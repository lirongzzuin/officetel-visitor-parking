import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: reg } = await supabase
    .from('visitor_registrations')
    .select('id, account_id, plate_normalized, valid_date, status')
    .eq('id', id)
    .single();

  if (!reg) return err('NOT_FOUND', '등록을 찾을 수 없습니다', 404);
  if (reg.account_id !== user.id && user.role !== 'admin') {
    return err('FORBIDDEN', '본인 등록만 취소할 수 있습니다', 403);
  }
  if (reg.status === 'cancelled') return err('CONFLICT', '이미 취소된 등록입니다', 409);

  await supabase
    .from('visitor_registrations')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id);

  // Cartan 취소 동기화 큐
  await supabase.from('sync_queue').insert({
    action: 'remove_visitor',
    payload: { plate_normalized: reg.plate_normalized, valid_date: reg.valid_date },
    status: 'pending',
  });

  return ok({ message: '취소 완료' });
}
