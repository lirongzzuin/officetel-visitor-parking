import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, todayKST } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const sp = req.nextUrl.searchParams;
  const type = sp.get('type');     // daily_stats | notice | announcement | null=all
  const page = parseInt(sp.get('page') ?? '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  let query = supabase
    .from('posts')
    .select('id, type, title, body, stats_data, account_id, created_at, body_expires_at, pinned, accounts(unit_number)', { count: 'exact' })
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type && type !== 'all') query = query.eq('type', type);

  const { data, error, count } = await query;
  if (error) {
    if (error.message.includes('does not exist')) return ok({ posts: [], total: 0 });
    return err('NOT_FOUND', '게시글을 불러올 수 없습니다', 500);
  }

  type PostRow = {
    id: string; type: string; title: string; body: string | null;
    stats_data: unknown; account_id: string | null;
    created_at: string; body_expires_at: string; pinned: boolean;
    accounts: unknown;
  };
  const now = new Date();
  const posts = (data ?? [] as PostRow[]).map((p: PostRow) => {
    const expired = new Date(p.body_expires_at) < now;
    return {
      ...p,
      body: expired ? null : p.body,
      expired,
      accounts: undefined,
      author_unit: (p.accounts as unknown as { unit_number: string } | null)?.unit_number ?? null,
    };
  });

  return ok({ posts, total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);
  if (user.role !== 'admin') return err('FORBIDDEN', '관리자만 게시글을 작성할 수 있습니다', 403);

  const body = await req.json().catch(() => ({}));
  const { type = 'notice', title, content, stats_data, pinned = false, ttl_hours = 72 } = body;

  if (!title?.trim()) return err('INVALID_PLATE', '제목을 입력하세요', 400);

  const supabase = createServiceClient();
  const expires = new Date(Date.now() + ttl_hours * 3600_000).toISOString();

  const { data, error } = await supabase
    .from('posts')
    .insert({
      type,
      title: title.trim(),
      body: content?.trim() ?? null,
      stats_data: stats_data ?? null,
      account_id: user.id,
      body_expires_at: expires,
      pinned,
    })
    .select()
    .single();

  if (error) return err('NOT_FOUND', '게시글 작성에 실패했습니다', 500);
  return ok(data, 201);
}
