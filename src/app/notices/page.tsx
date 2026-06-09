'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { getAuthUnit, getAuthRole, clearAuth } from '@/lib/store';
import { apiFetch } from '@/lib/api-client';

interface Post {
  id: string;
  type: 'daily_stats' | 'notice' | 'announcement';
  title: string;
  body: string | null;
  stats_data: { registered: number; cancelled: number; total: number; date?: string } | null;
  author_unit: string | null;
  created_at: string;
  body_expires_at: string;
  pinned: boolean;
  expired: boolean;
}

const TYPE_TABS = [
  { key: 'all', label: '전체' },
  { key: 'daily_stats', label: '통계' },
  { key: 'notice', label: '공지' },
] as const;
type TabKey = (typeof TYPE_TABS)[number]['key'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1) return '방금 전';
  if (h < 24) return `${h}시간 전`;
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function dateStr(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function StatsCard({ stats, compact }: { stats: Post['stats_data']; compact?: boolean }) {
  if (!stats) return null;
  const items = [
    { label: '등록', value: stats.registered, color: 'text-[var(--color-primary)]' },
    { label: '취소', value: stats.cancelled, color: 'text-[var(--color-error)]' },
    { label: '합계', value: stats.total, color: 'text-[var(--color-on-surface)]' },
  ];
  if (compact) {
    return (
      <div className="flex gap-3 mt-2">
        {items.map(({ label, value, color }) => (
          <span key={label}
            className="text-xs bg-[var(--color-surface-container-high)] px-2.5 py-1 rounded-full">
            <span className="text-[var(--color-on-surface-variant)]">{label} </span>
            <span className={`font-bold ${color}`}>{value}</span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3 mt-3">
      {items.map(({ label, value, color }) => (
        <div key={label}
          className="bg-[var(--color-surface-container-low)] rounded-xl p-3 text-center">
          <p className="text-xs text-[var(--color-on-surface-variant)] mb-1">{label}</p>
          <p className={`text-[22px] font-bold ${color}`}>{value}</p>
          <p className="text-[10px] text-[var(--color-outline)]">건</p>
        </div>
      ))}
    </div>
  );
}

function PostCard({ post, onDelete, isAdmin }: {
  post: Post;
  onDelete: (id: string) => void;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const typeLabel = post.type === 'daily_stats' ? '통계'
    : post.type === 'announcement' ? '중요'
    : '공지';
  const typeBg = post.type === 'daily_stats'
    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
    : post.type === 'announcement'
    ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
    : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]';

  return (
    <div className={`bg-[var(--color-surface-container-lowest)] rounded-2xl border
      ${post.pinned ? 'border-[var(--color-primary)]/30 border-l-4 border-l-[var(--color-primary)]'
        : 'border-[var(--color-outline-variant)]/30'} shadow-sm overflow-hidden`}>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 active:bg-[var(--color-surface-container-low)] transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${typeBg}`}>
                {typeLabel}
              </span>
              {post.pinned && (
                <span className="material-symbols-outlined text-[var(--color-primary)] text-[14px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>push_pin</span>
              )}
            </div>
            <p className="font-semibold text-[var(--color-on-surface)] text-sm leading-snug line-clamp-2">
              {post.title}
            </p>

            {/* 만료 전: 본문 미리보기 or 통계 compact */}
            {!post.expired && post.body && !expanded && (
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-1.5 line-clamp-2 leading-relaxed">
                {post.body}
              </p>
            )}
            {!post.expired && post.type === 'daily_stats' && post.stats_data && !expanded && (
              <StatsCard stats={post.stats_data} compact />
            )}

            {/* 만료 후: 숫자만 */}
            {post.expired && post.stats_data && (
              <StatsCard stats={post.stats_data} compact />
            )}
            {post.expired && !post.stats_data && (
              <p className="text-xs text-[var(--color-outline)] mt-1.5 italic">만료된 게시글입니다</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-[11px] text-[var(--color-outline)]">{timeAgo(post.created_at)}</p>
            <span className={`material-symbols-outlined text-[var(--color-outline-variant)] text-[18px]
              transition-transform ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
          </div>
        </div>
      </button>

      {/* 펼침 상태 */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--color-outline-variant)]/20 pt-3 space-y-3">
          {/* 본문 (만료 전) */}
          {!post.expired && post.body && (
            <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
              {post.body}
            </p>
          )}

          {/* 통계 (daily_stats) */}
          {post.type === 'daily_stats' && post.stats_data && (
            <StatsCard stats={post.stats_data} />
          )}

          {/* 만료 안내 */}
          {post.expired && !post.stats_data && (
            <p className="text-sm text-[var(--color-outline)] italic text-center py-2">
              게시글 내용이 만료되어 삭제되었습니다
            </p>
          )}

          {/* 메타 */}
          <div className="flex items-center justify-between text-[11px] text-[var(--color-outline)] pt-1">
            <span>
              {post.author_unit ? `${post.author_unit}호 관리자` : '시스템'}
              {' · '}{dateStr(post.created_at)}
            </span>
            {!post.expired && (
              <span>
                {dateStr(post.body_expires_at)} 만료
              </span>
            )}
          </div>

          {/* 관리자 액션 */}
          {isAdmin && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onDelete(post.id)}
                className="text-xs text-[var(--color-error)] border border-[var(--color-error)]/20
                  bg-[var(--color-error)]/5 px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform">
                삭제
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NoticesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Write sheet (admin)
  const [writeOpen, setWriteOpen] = useState(false);
  const [writeTitle, setWriteTitle] = useState('');
  const [writeBody, setWriteBody] = useState('');
  const [writeType, setWriteType] = useState<'notice' | 'announcement'>('notice');
  const [writePinned, setWritePinned] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);

  const load = useCallback(async (p = 1, replace = true) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const typeParam = tab === 'all' ? '' : `&type=${tab}`;
      const res = await apiFetch<{ posts: Post[]; total: number }>(
        `/api/posts?page=${p}${typeParam}`
      );
      setPosts((prev) => replace ? res.posts : [...prev, ...res.posts]);
      setTotal(res.total);
      setPage(p);
    } catch (e: unknown) {
      if ((e as Error & { status?: number }).status === 401) { clearAuth(); router.replace('/'); }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tab]);

  useEffect(() => {
    const u = getAuthUnit();
    if (!u) { clearAuth(); router.replace('/'); return; }
    setIsAdmin(getAuthRole() === 'admin');
  }, [router]);

  useEffect(() => { load(1, true); }, [load]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/posts/${deleteId}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== deleteId));
      setTotal((t) => t - 1);
    } catch { /* ignore */ }
    finally { setDeleteLoading(false); setDeleteId(null); }
  }

  async function handleWrite() {
    if (!writeTitle.trim()) return;
    setWriteLoading(true);
    try {
      const raw = await apiFetch<Post>('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          type: writeType,
          title: writeTitle,
          content: writeBody || null,
          pinned: writePinned,
          ttl_hours: 72,
        }),
      });
      const data: Post = { ...raw, expired: false, author_unit: null };
      setPosts((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      setWriteOpen(false);
      setWriteTitle(''); setWriteBody(''); setWritePinned(false);
    } catch { /* ignore */ }
    finally { setWriteLoading(false); }
  }

  const hasMore = posts.length < total;

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      <AppHeader
        title="소식"
        rightAction={isAdmin ? (
          <button
            onClick={() => setWriteOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full
              bg-[var(--color-primary)]/10 active:scale-90 transition-transform">
            <span className="material-symbols-outlined text-[var(--color-primary)] text-[20px]">edit</span>
          </button>
        ) : undefined}
      />

      <main className="pt-20 pb-28 px-5">
        {/* Tabs */}
        <div className="sticky top-14 bg-[var(--color-background)] z-40 py-3">
          <div className="flex bg-[var(--color-surface-container-low)] rounded-xl p-1 relative">
            {TYPE_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2 text-center text-sm font-semibold z-10 transition-colors
                  ${tab === key ? 'text-[var(--color-on-surface)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                {label}
              </button>
            ))}
            <div
              className="absolute top-1 bottom-1 left-1 w-[calc(33.33%-2.66px)]
                bg-[var(--color-surface-container-highest)] rounded-lg shadow-sm transition-transform duration-300"
              style={{ transform: `translateX(${TYPE_TABS.findIndex((t) => t.key === tab) * 100.5}%)` }}
            />
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <span className="w-7 h-7 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[var(--color-outline)] text-[40px]">newspaper</span>
              </div>
              <h3 className="text-[18px] font-bold text-[var(--color-on-surface)] mb-2">
                아직 게시글이 없습니다
              </h3>
              <p className="text-sm text-[var(--color-on-surface-variant)]">
                통계 및 공지사항이 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            <>
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  isAdmin={isAdmin}
                  onDelete={(id) => setDeleteId(id)}
                />
              ))}
              {hasMore && (
                <button
                  onClick={() => load(page + 1, false)}
                  disabled={loadingMore}
                  className="w-full py-3 text-sm font-semibold text-[var(--color-primary)]
                    flex items-center justify-center gap-2 active:opacity-70 disabled:opacity-50">
                  {loadingMore
                    ? <span className="w-4 h-4 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                    : '더 보기'}
                </button>
              )}
            </>
          )}
        </div>
      </main>

      <BottomNav />

      {/* Delete confirm */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50
            bg-[var(--color-surface)] rounded-t-3xl shadow-2xl px-5 pt-6 pb-10 animate-[slideUp_0.25s_ease-out]">
            <div className="flex justify-center mb-5">
              <div className="w-10 h-1 rounded-full bg-[var(--color-outline-variant)]" />
            </div>
            <div className="flex flex-col items-center gap-2 mb-7">
              <div className="w-14 h-14 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center mb-1">
                <span className="material-symbols-outlined text-[var(--color-error)] text-[28px]">delete</span>
              </div>
              <h4 className="text-[18px] font-bold text-[var(--color-on-surface)]">게시글 삭제</h4>
              <p className="text-sm text-[var(--color-on-surface-variant)] text-center">
                이 게시글을 삭제하시겠습니까?<br />삭제된 게시글은 복구할 수 없습니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} disabled={deleteLoading}
                className="flex-1 h-14 rounded-2xl bg-[var(--color-surface-container-high)]
                  text-[var(--color-on-surface-variant)] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                취소
              </button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-[1.5] h-14 rounded-2xl bg-[var(--color-error)] text-white font-bold
                  flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70">
                {deleteLoading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : '삭제'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Write sheet (admin) */}
      {writeOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setWriteOpen(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50
            bg-[var(--color-surface)] rounded-t-[32px] shadow-2xl max-h-[90dvh] overflow-y-auto
            animate-[slideUp_0.25s_ease-out]">
            <div className="w-12 h-1.5 bg-[var(--color-outline-variant)]/40 rounded-full mx-auto mt-4 mb-5" />
            <div className="px-5 pb-10 space-y-4">
              <h4 className="text-[20px] font-bold text-[var(--color-on-surface)]">공지 작성</h4>

              {/* 유형 */}
              <div className="flex gap-2">
                {(['notice', 'announcement'] as const).map((t) => (
                  <button key={t}
                    onClick={() => setWriteType(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
                      ${writeType === t
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'}`}>
                    {t === 'notice' ? '공지' : '중요'}
                  </button>
                ))}
              </div>

              {/* 제목 */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-2 block">제목</label>
                <input
                  type="text"
                  placeholder="제목을 입력하세요"
                  value={writeTitle}
                  onChange={(e) => setWriteTitle(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] text-sm
                    focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>

              {/* 내용 */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-2 block">
                  내용 <span className="font-normal text-[var(--color-outline)]">(선택 · 3일 후 삭제)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="내용을 입력하세요"
                  value={writeBody}
                  onChange={(e) => setWriteBody(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] text-sm
                    placeholder:text-[var(--color-outline)] resize-none
                    focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>

              {/* 고정 */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-container-low)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={writePinned}
                  onChange={(e) => setWritePinned(e.target.checked)}
                  className="w-4 h-4 accent-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-on-surface)]">상단 고정</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setWriteOpen(false)}
                  className="flex-1 h-14 rounded-2xl bg-[var(--color-surface-container-high)]
                    text-[var(--color-on-surface-variant)] font-semibold active:scale-95 transition-transform">
                  취소
                </button>
                <button onClick={handleWrite} disabled={writeLoading || !writeTitle.trim()}
                  className="flex-[2] h-14 rounded-2xl bg-[var(--color-primary)] text-white font-bold
                    flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70">
                  {writeLoading
                    ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : '게시'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
