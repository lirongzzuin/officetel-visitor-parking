import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';

export async function POST(req: NextRequest) {
  const { unit, password } = await req.json();

  if (!unit || !password) {
    return err('UNAUTHORIZED', '호수와 비밀번호를 입력하세요', 400);
  }

  // Supabase Auth: 이메일 형식으로 변환 (unit 1001 → 1001@officetel-parking.internal)
  const email = `${String(unit).trim()}@officetel-parking.internal`;

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return err('UNAUTHORIZED', '호수 또는 비밀번호가 올바르지 않습니다', 401);
  }

  // 계정 프로필 조회
  const { data: account } = await supabase
    .from('accounts')
    .select('unit_number, role, must_change_password, is_active, banned_until, penalty_points')
    .eq('id', data.user.id)
    .single();

  if (!account?.is_active) {
    return err('FORBIDDEN', '비활성화된 계정입니다. 관리사무소에 문의하세요', 403);
  }

  if (account.banned_until && new Date(account.banned_until) > new Date()) {
    const until = new Date(account.banned_until).toLocaleDateString('ko-KR');
    return err('BANNED', `벌점 초과로 ${until}까지 이용이 제한됩니다`, 403);
  }

  return ok({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    unit: account.unit_number,
    role: account.role,
    must_change_password: account.must_change_password,
    penalty_points: account.penalty_points,
  });
}
