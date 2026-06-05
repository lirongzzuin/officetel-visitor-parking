import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const { current_password, new_password } = await req.json();
  if (!new_password || new_password.length < 8) {
    return err('UNAUTHORIZED', '새 비밀번호는 8자 이상이어야 합니다', 400);
  }
  if (new_password === current_password) {
    return err('CONFLICT', '현재 비밀번호와 동일한 비밀번호로는 변경할 수 없습니다', 400);
  }

  const supabase = createServiceClient();

  // 현재 비밀번호로 재인증 (검증 목적)
  const email = `${user.unit}@officetel-parking.internal`;
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password: current_password,
  });
  if (authErr) return err('UNAUTHORIZED', '현재 비밀번호가 올바르지 않습니다', 401);

  // 비밀번호 변경
  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    password: new_password,
  });
  if (updateErr) return err('UNAUTHORIZED', '비밀번호 변경에 실패했습니다', 500);

  // must_change_password 해제
  await supabase.from('accounts').update({ must_change_password: false }).eq('id', user.id);

  return ok({ message: '비밀번호가 변경되었습니다' });
}
