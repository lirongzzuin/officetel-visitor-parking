import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);
  if (user.role !== 'admin') return err('FORBIDDEN', '관리자만 접근 가능합니다', 403);

  const body = await req.json().catch(() => ({}));
  const unit = String(body.unit ?? '').trim();
  if (!unit) return err('INVALID_PLATE', '호수를 입력하세요', 400);

  const supabase = createServiceClient();

  const { data: acc } = await supabase
    .from('accounts')
    .select('id, unit_number')
    .eq('unit_number', unit)
    .single();

  if (!acc) return err('NOT_FOUND', `${unit}호 계정을 찾을 수 없습니다`, 404);

  // 초기화 비밀번호: 호수 4자리 zero-pad + "00"  (101 → 010100, 1001 → 100100)
  const newPassword = unit.padStart(4, '0') + '00';

  const { error } = await supabase.auth.admin.updateUserById(acc.id, { password: newPassword });
  if (error) return err('NOT_FOUND', `비밀번호 초기화 실패: ${error.message}`, 500);

  await supabase.from('accounts').update({ must_change_password: true }).eq('id', acc.id);

  return ok({ unit: acc.unit_number, new_password: newPassword });
}
