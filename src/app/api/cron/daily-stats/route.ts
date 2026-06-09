import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { todayKST } from '@/lib/api';
import { sendTelegramMessage } from '@/lib/telegram';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const today = todayKST();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('visitor_registrations')
    .select('status')
    .eq('valid_date', today);

  if (error) {
    console.error('[cron/daily-stats] DB error:', error.message);
    return new Response('DB error', { status: 500 });
  }

  const rows = data ?? [];
  const total = rows.length;
  const cancelled = rows.filter((r: { status: string }) => r.status === 'cancelled').length;
  const active = total - cancelled;

  const dateLabel = today.replace(/-/g, '.');
  const statsData = { registered: active, cancelled, total, date: today };

  // DB에 통계 게시글 저장 (3일 후 본문 만료)
  const bodyExpires = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
  await supabase.from('posts').insert({
    type: 'daily_stats',
    title: `일일 통계 — ${dateLabel}`,
    body: `${dateLabel} 방문차량 등록 현황입니다.`,
    stats_data: statsData,
    account_id: null,
    body_expires_at: bodyExpires,
    pinned: false,
  }).then(({ error: e }: { error: { message: string } | null }) => {
    if (e && !e.message.includes('does not exist')) {
      console.error('[cron/daily-stats] post insert error:', e.message);
    }
  });

  // 텔레그램 알림 (유지)
  const text = [
    `[일일 통계]  ${dateLabel}`,
    '',
    `등록    ${active}건`,
    `취소    ${cancelled}건`,
    `합계    ${total}건`,
  ].join('\n');
  await sendTelegramMessage(text);

  return Response.json({ ok: true, date: today, active, cancelled, total });
}
