'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { MOCK_VISITORS, getAuthUnit, VisitorEntry } from '@/lib/store';
import { formatPlate } from '@/lib/plate';

const TABS = [
  { key: 'upcoming', label: '예정' },
  { key: 'today', label: '오늘' },
  { key: 'past', label: '지난 30일' },
] as const;

type Tab = (typeof TABS)[number]['key'];

const STATUS_CONFIG = {
  upcoming: { label: '예정', bg: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' },
  active: { label: '방문중', bg: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]', border: true },
  expired: { label: '만료', bg: 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]' },
  cancelled: { label: '취소', bg: 'bg-[var(--color-error-container)] text-[var(--color-error)]' },
};

function VisitorCard({ v, showReregister }: { v: VisitorEntry; showReregister?: boolean }) {
  const cfg = STATUS_CONFIG[v.status];
  return (
    <div className={`bg-[var(--color-surface-container-lowest)] rounded-2xl p-4 shadow-sm
      border ${v.status === 'active' ? 'border-l-4 border-l-[var(--color-primary)] border-[var(--color-outline-variant)]/20' : 'border-[var(--color-outline-variant)]/30'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${cfg.bg}`}>{cfg.label}</span>
          <div className="flex items-center gap-2 mt-2">
            <span className="font-bold text-[20px] text-[var(--color-on-surface)] plate-mono">
              {formatPlate(v.plate)}
            </span>
          </div>
          {v.nickname && (
            <p className="text-sm text-[var(--color-on-surface-variant)] mt-0.5">{v.nickname}</p>
          )}
        </div>
        {v.status === 'active' || v.status === 'upcoming' ? (
          <button className="text-xs text-[var(--color-error)] border border-[var(--color-error)]/20
            bg-[var(--color-error)]/5 px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform">
            취소
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-[var(--color-surface-container)]">
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-on-surface-variant)]">
          <span className="material-symbols-outlined text-[16px]">calendar_today</span>
          <span>{v.date}</span>
        </div>
        {showReregister && (
          <Link href={`/register?plate=${encodeURIComponent(v.plate)}&nickname=${encodeURIComponent(v.nickname ?? '')}`}>
            <span className="text-sm font-semibold text-[var(--color-primary)]">재등록</span>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function VisitsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('today');
  const [unit, setUnit] = useState('1001');

  useEffect(() => {
    const u = getAuthUnit();
    if (!u) { router.replace('/'); return; }
    setUnit(u);
  }, [router]);

  const today = new Date().toISOString().split('T')[0];
  const past30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const all = MOCK_VISITORS.filter((v) => v.unit === unit);
  const upcoming = all.filter((v) => v.status === 'upcoming' || (v.date > today));
  const todayList = all.filter((v) => v.date === today);
  const pastList = all.filter((v) => v.date < today && v.date >= past30);

  const lists: Record<Tab, VisitorEntry[]> = {
    upcoming,
    today: todayList,
    past: pastList,
  };
  const current = lists[tab];

  const tabOffsets: Record<Tab, string> = {
    upcoming: '0%',
    today: '100.5%',
    past: '201%',
  };

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
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
          {current.length === 0 ? (
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
            current.map((v) => (
              <VisitorCard key={v.id} v={v} showReregister={tab === 'past'} />
            ))
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
