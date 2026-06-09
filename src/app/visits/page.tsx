'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { useToast } from '@/components/Toast';
import { CalendarSheet } from '@/components/CalendarSheet';
import { getAuthUnit, clearAuth } from '@/lib/store';
import { liveFormat } from '@/lib/plate';
import { apiFetch } from '@/lib/api-client';

interface VisitorReg {
  id: string;
  plate_normalized: string;
  plate_display: string;
  nickname: string | null;
  valid_date: string;
  status: 'active' | 'cancelled' | 'expired';
  registered_at: string;
  cancelled_at: string | null;
  visit_start_time?: string;
  visit_end_time?: string;
}

const TABS = [
  { key: 'upcoming', label: '예정' },
  { key: 'today', label: '오늘' },
  { key: 'past', label: '지난 30일' },
] as const;

type Tab = (typeof TABS)[number]['key'];

const tabOffsets: Record<Tab, string> = {
  upcoming: '0%',
  today: '100.5%',
  past: '201%',
};

function getDisplayStatus(v: VisitorReg, today: string): 'upcoming' | 'active' | 'expired' | 'cancelled' {
  if (v.status === 'cancelled') return 'cancelled';
  if (v.status === 'expired') return 'expired';
  if (v.valid_date > today) return 'upcoming';
  return 'active';
}

const STATUS_CONFIG = {
  upcoming: { label: '예정', bg: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' },
  active: { label: '방문중', bg: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' },
  expired: { label: '만료', bg: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]' },
  cancelled: { label: '취소', bg: 'bg-[var(--color-error-container)] text-[var(--color-error)]' },
};

export default function VisitsPage() {
  const router = useRouter();
  const { show, toastEl } = useToast();
  const [tab, setTab] = useState<Tab>('today');
  const [allVisitors, setAllVisitors] = useState<VisitorReg[]>([]);
  const [loading, setLoading] = useState(true);

  // Cancel confirm state
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VisitorReg | null>(null);
  const [editPlate, setEditPlate] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [showEditCalendar, setShowEditCalendar] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const past30 = new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
  const next30 = new Date(Date.now() + 9 * 3600_000 + 30 * 86400_000).toISOString().slice(0, 10);
  const todayMin = today;

  const loadVisitors = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<VisitorReg[]>(`/api/visitors?from=${past30}&to=${next30}`);
      setAllVisitors(data);
    } catch {
      show('데이터를 불러오지 못했습니다', 'error');
    } finally {
      setLoading(false);
    }
  }, [past30, next30]);

  useEffect(() => {
    const u = getAuthUnit();
    if (!u) { clearAuth(); router.replace('/'); return; }
    loadVisitors();
  }, [router, loadVisitors]);

  const upcoming = allVisitors.filter((v) => v.valid_date > today && v.status === 'active');
  const todayList = allVisitors.filter((v) => v.valid_date === today);
  const pastList = allVisitors.filter((v) => v.valid_date < today && v.valid_date >= past30);
  const lists: Record<Tab, VisitorReg[]> = { upcoming, today: todayList, past: pastList };
  const current = lists[tab];

  async function handleCancel() {
    if (!cancelId) return;
    setCancelLoading(true);
    try {
      await apiFetch(`/api/visitors/${cancelId}`, { method: 'DELETE' });
      show('취소되었습니다', 'success');
      setAllVisitors((prev) =>
        prev.map((v) => v.id === cancelId ? { ...v, status: 'cancelled' as const, cancelled_at: new Date().toISOString() } : v)
      );
    } catch (e: unknown) {
      show((e as Error).message ?? '취소에 실패했습니다', 'error');
    } finally {
      setCancelLoading(false);
      setCancelId(null);
    }
  }

  function openEdit(v: VisitorReg) {
    setEditTarget(v);
    setEditPlate(v.plate_display);
    setEditNickname(v.nickname ?? '');
    setEditDate(v.valid_date);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditTarget(null);
  }

  async function handleEdit() {
    if (!editTarget) return;
    setEditLoading(true);
    try {
      const updated = await apiFetch<VisitorReg>(`/api/visitors/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          plate: editPlate,
          nickname: editNickname || null,
          valid_date: editDate,
        }),
      });
      show('수정되었습니다', 'success');
      closeEdit();
      setAllVisitors((prev) => prev.map((v) => v.id === updated.id ? updated : v));
    } catch (e: unknown) {
      show((e as Error).message ?? '수정에 실패했습니다', 'error');
    } finally {
      setEditLoading(false);
    }
  }

  function renderCard(v: VisitorReg) {
    const ds = getDisplayStatus(v, today);
    const cfg = STATUS_CONFIG[ds];
    const isEditable = v.status === 'active';
    const isCancellable = v.status === 'active';

    return (
      <div key={v.id} className={`bg-[var(--color-surface-container-lowest)] rounded-2xl p-4 shadow-sm
        border ${ds === 'active' || ds === 'upcoming'
          ? 'border-l-4 border-l-[var(--color-primary)] border-[var(--color-outline-variant)]/20'
          : 'border-[var(--color-outline-variant)]/30'}`}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${cfg.bg}`}>{cfg.label}</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="font-bold text-[20px] text-[var(--color-on-surface)] plate-mono">
                {v.plate_display}
              </span>
            </div>
            {v.nickname && (
              <p className="text-sm text-[var(--color-on-surface-variant)] mt-0.5">{v.nickname}</p>
            )}
          </div>
          {(isCancellable || isEditable) && (
            <div className="flex gap-2">
              {isEditable && (
                <button
                  onClick={() => openEdit(v)}
                  className="text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/20
                    bg-[var(--color-primary)]/5 px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform">
                  수정
                </button>
              )}
              {isCancellable && (
                <button
                  onClick={() => setCancelId(v.id)}
                  className="text-xs text-[var(--color-error)] border border-[var(--color-error)]/20
                    bg-[var(--color-error)]/5 px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform">
                  취소
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-[var(--color-surface-container)]">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>
              <span>{v.valid_date}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              <span>{v.visit_start_time ?? '06:00'} – {v.visit_end_time ?? '18:00'}</span>
            </div>
          </div>
          {tab === 'past' && v.status !== 'cancelled' && (
            <Link href={`/register?plate=${encodeURIComponent(v.plate_display)}&nickname=${encodeURIComponent(v.nickname ?? '')}`}>
              <span className="text-sm font-semibold text-[var(--color-primary)]">재등록</span>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {toastEl}
      <AppHeader title="방문 차량 관리" showBack onBack={() => router.back()} />

      <main className="pt-20 pb-28 px-5">
        <div className="py-5">
          <h2 className="text-[26px] font-bold text-[var(--color-on-surface)] tracking-tight">
            방문 차량 관리
          </h2>
          <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">
            우리 집에 방문할 차량을 미리 등록하고 확인하세요.
          </p>
        </div>

        {/* Tabs */}
        <div className="sticky top-14 bg-[var(--color-background)] z-40 py-3">
          <div className="flex bg-[var(--color-surface-container-low)] rounded-xl p-1 relative">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2 text-center text-sm font-semibold z-10 transition-colors
                  ${tab === key ? 'text-[var(--color-on-surface)]' : 'text-[var(--color-on-surface-variant)]'}`}
              >
                {label}
                {key === 'upcoming' && upcoming.length > 0 && (
                  <span className="ml-1 text-[10px] bg-[var(--color-primary)] text-white px-1.5 py-0.5 rounded-full">
                    {upcoming.length}
                  </span>
                )}
              </button>
            ))}
            <div
              className="absolute top-1 bottom-1 left-1 w-[calc(33.33%-2.66px)]
                bg-[var(--color-surface-container-highest)] rounded-lg shadow-sm transition-transform duration-300"
              style={{ transform: `translateX(${tabOffsets[tab]})` }}
            />
          </div>
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <span className="w-7 h-7 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
            </div>
          ) : current.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[var(--color-outline)] text-[40px]">
                  directions_car
                </span>
              </div>
              <h3 className="text-[18px] font-bold text-[var(--color-on-surface)] mb-2">
                {tab === 'upcoming' ? '예정된 방문이 없어요'
                  : tab === 'today' ? '오늘 등록된 차량이 없어요'
                  : '최근 30일 기록이 없어요'}
              </h3>
              <p className="text-sm text-[var(--color-on-surface-variant)] mb-5">
                방문객을 위해 주차 공간을 미리 신청해보세요.
              </p>
              <Link href="/register">
                <div className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-xl font-semibold
                  flex items-center gap-2 shadow-md shadow-[var(--color-primary)]/20 active:scale-95 transition-transform">
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                  방문 차량 등록하기
                </div>
              </Link>
            </div>
          ) : (
            current.map((v) => renderCard(v))
          )}
        </div>
      </main>

      <BottomNav />

      {/* Cancel confirm sheet */}
      {cancelId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm" onClick={() => setCancelId(null)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-[70]
            bg-[var(--color-surface)] rounded-t-3xl shadow-2xl px-5 pt-5 pb-10
            animate-[slideUp_0.25s_ease-out]">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-[var(--color-outline-variant)]" />
            </div>
            <div className="flex flex-col items-center gap-2 mb-6">
              <div className="w-14 h-14 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center mb-1">
                <span className="material-symbols-outlined text-[var(--color-error)] text-[28px]">cancel</span>
              </div>
              <h4 className="text-[17px] font-bold text-[var(--color-on-surface)]">등록 취소</h4>
              <p className="text-sm text-[var(--color-on-surface-variant)] text-center">
                이 방문 등록을 취소하시겠습니까?<br />취소 후 다시 등록할 수 있습니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelId(null)}
                disabled={cancelLoading}
                className="flex-1 h-14 rounded-2xl bg-[var(--color-surface-container-high)]
                  text-[var(--color-on-surface-variant)] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                돌아가기
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelLoading}
                className="flex-[1.5] h-14 rounded-2xl bg-[var(--color-error)] text-white font-bold
                  flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70">
                {cancelLoading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : '등록 취소'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit bottom sheet */}
      {editOpen && editTarget && (
        <>
          <div
            ref={backdropRef}
            onClick={closeEdit}
            className="fixed inset-0 bg-black/60 z-[60]"
          />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-[70]
            bg-[var(--color-surface)] rounded-t-[32px] shadow-2xl sheet-enter max-h-[90dvh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-[var(--color-outline-variant)]/40 rounded-full mx-auto mt-4 mb-5" />
            <div className="px-5 pb-10 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[var(--color-primary)] text-[26px]">edit</span>
                </div>
                <div>
                  <h4 className="text-[20px] font-bold text-[var(--color-on-surface)]">등록 수정</h4>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    차량번호, 별칭, 날짜를 변경할 수 있습니다.
                  </p>
                </div>
              </div>

              {/* Plate */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-2 block">차량번호</label>
                <input
                  type="text"
                  inputMode="text"
                  value={editPlate}
                  onChange={(e) => setEditPlate(liveFormat(e.target.value))}
                  maxLength={10}
                  className="w-full h-14 px-4 rounded-2xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                    text-center text-[22px] font-bold plate-mono
                    focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>

              {/* Nickname */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-2 block">
                  별칭 <span className="font-normal text-[var(--color-outline)]">(선택)</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 부모님 차"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] text-sm
                    focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>

              {/* Date */}
              <div>
                <label className="text-sm font-bold text-[var(--color-on-surface)] mb-2 block">방문 날짜</label>
                <button
                  type="button"
                  onClick={() => setShowEditCalendar(true)}
                  className="w-full h-12 px-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                    flex items-center justify-between
                    focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                >
                  <span className={editDate ? 'text-[var(--color-on-surface)]' : 'text-[var(--color-outline)]/50'}>
                    {editDate
                      ? new Date(editDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                          year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
                        })
                      : '날짜 선택'}
                  </span>
                  <span className="material-symbols-outlined text-[var(--color-primary)] text-[18px]">edit_calendar</span>
                </button>
                <CalendarSheet
                  open={showEditCalendar}
                  value={editDate}
                  min={todayMin}
                  max={new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]}
                  onSelect={(d) => { setEditDate(d); setShowEditCalendar(false); }}
                  onClose={() => setShowEditCalendar(false)}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeEdit}
                  className="flex-1 h-14 rounded-2xl bg-[var(--color-surface-container-high)]
                    text-[var(--color-on-surface-variant)] font-semibold active:scale-95 transition-transform"
                >
                  취소
                </button>
                <button
                  onClick={handleEdit}
                  disabled={editLoading || !editPlate.trim()}
                  className="flex-[2] h-14 rounded-2xl bg-[var(--color-primary)] text-white font-semibold
                    shadow-lg shadow-[var(--color-primary)]/20 active:scale-95 transition-transform
                    disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {editLoading
                    ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : '수정 저장'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
