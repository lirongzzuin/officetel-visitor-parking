import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, formatPlate, isValidPlate } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('favorites')
    .select('id, plate_normalized, plate_display, nickname, emoji')
    .eq('account_id', user.id)
    .order('created_at', { ascending: false });

  return ok(data ?? [], 200, 30);
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const { plate, nickname, emoji } = await req.json();
  if (!plate || !nickname) return err('UNAUTHORIZED', 'plate와 nickname이 필요합니다', 400);
  if (!isValidPlate(plate)) return err('INVALID_PLATE', '올바른 차량번호 형식이 아닙니다', 400);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('favorites')
    .insert({
      account_id: user.id,
      plate_normalized: normalizePlate(plate),
      plate_display: formatPlate(plate),
      nickname,
      emoji: emoji ?? '🚗',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return err('CONFLICT', '이미 즐겨찾기에 등록된 차량입니다', 409);
    return err('UNAUTHORIZED', '즐겨찾기 추가에 실패했습니다', 500);
  }

  return ok(data, 201);
}
