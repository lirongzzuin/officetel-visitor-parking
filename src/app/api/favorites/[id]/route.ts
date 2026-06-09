import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: fav } = await supabase
    .from('favorites')
    .select('id, account_id')
    .eq('id', id)
    .single();

  if (!fav) return err('NOT_FOUND', '즐겨찾기를 찾을 수 없습니다', 404);
  if (fav.account_id !== user.id && user.role !== 'admin') {
    return err('FORBIDDEN', '본인 즐겨찾기만 삭제할 수 있습니다', 403);
  }

  await supabase.from('favorites').delete().eq('id', id);
  return ok({ message: '삭제 완료' });
}
