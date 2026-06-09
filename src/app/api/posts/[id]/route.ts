import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);
  if (user.role !== 'admin') return err('FORBIDDEN', '관리자만 삭제할 수 있습니다', 403);

  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) return err('NOT_FOUND', '삭제에 실패했습니다', 500);

  return ok({ deleted: id });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);
  if (user.role !== 'admin') return err('FORBIDDEN', '관리자만 수정할 수 있습니다', 403);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { pinned } = body;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('posts')
    .update({ pinned })
    .eq('id', id)
    .select()
    .single();

  if (error) return err('NOT_FOUND', '수정에 실패했습니다', 500);
  return ok(data);
}
