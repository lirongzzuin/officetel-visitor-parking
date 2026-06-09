import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, formatPlate, isValidPlate } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: reg } = await supabase
    .from('visitor_registrations')
    .select('id, account_id, status')
    .eq('id', id)
    .single();

  if (!reg) return err('NOT_FOUND', '등록을 찾을 수 없습니다', 404);
  if (reg.account_id !== user.id && user.role !== 'admin') {
    return err('FORBIDDEN', '본인 등록만 수정할 수 있습니다', 403);
  }
  if (reg.status === 'cancelled') return err('CONFLICT', '취소된 등록은 수정할 수 없습니다', 409);
  if (reg.status === 'expired')   return err('CONFLICT', '만료된 등록은 수정할 수 없습니다', 409);

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.nickname !== undefined) updates.nickname = body.nickname || null;
  if (body.valid_date) updates.valid_date = body.valid_date;
  if (body.plate) {
    if (!isValidPlate(body.plate)) return err('INVALID_PLATE', '올바른 차량번호 형식이 아닙니다', 400);
    updates.plate_normalized = normalizePlate(body.plate);
    updates.plate_display    = formatPlate(body.plate);
  }
  if (body.visit_start_time !== undefined) updates.visit_start_time = body.visit_start_time;
  if (body.visit_end_time !== undefined)   updates.visit_end_time   = body.visit_end_time;

  if (Object.keys(updates).length === 0) return err('UNAUTHORIZED', '수정할 항목이 없습니다', 400);

  const { data, error } = await supabase
    .from('visitor_registrations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return err('CONFLICT', '해당 날짜에 이미 등록된 차량번호입니다', 409);
    return err('UNAUTHORIZED', '수정에 실패했습니다', 500);
  }

  return ok(data);
}

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
