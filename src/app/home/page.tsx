'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import {
  getAuthUnit, MOCK_VISITORS, MOCK_FAVORITES, CURRENT_PENALTY_SCORE, MAX_PENALTY,
  isNightHours, DAILY_QUOTA, VisitorEntry,
} from '@/lib/store';
import { formatPlate } from '@/lib/plate';

export default function HomePage() {
  const router = useRouter();
  const [unit, setUnit] = useState('');
  const [todayVisitors, setTodayVisitors] = useState<VisitorEntry[]>([]);
  const [isNight, setIsNight] = useState(false);

  useEffect(() => {
    const u = getAuthUnit();
    if (!u) { router.replace('/'); return; }
    setUnit(u);
    const today = new Date().toISOString().split('T')[0];
    setTodayVisitors(MOCK_VISITORS.filter((v) => v.unit === u && v.date === today));
    setIsNight(isNightHours());
  }, [router]);

  const score = Math.max(0, CURRENT_PENALTY_SCORE);
  const penaltyPct = score / MAX_PENALTY;
  const circumference = 2 * Math.PI * 34;
  const offset = circumference * (1 - penaltyPct);

  const statusColor = score === 0 ? 'text-[var(--color-success)]'
    : score < 5 ? 'text-[var(--color-tertiary)]'
    : 'text-[var(--color-error)]';
  const statusLabel = score === 0 ? 'CLEAN' : score < 5 ? '주의' : '위험';
  const statusBg = score === 0 ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
    : score < 5 ? 'bg-[var(--color-tertiary-fixed)] text-[var(--color-tertiary)]'
    : 'bg-[var(--color-error-container)] text-[var(--color-error)]';

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      <AppHeader />

      <main className="pt-20 pb-28 px-5 space-y-6">
        {/* Greeting */}
        <section className="pt-2">
          <h2 className="text-[22px] font-bold text-[var(--color-on-surface)] tracking-tight">
            안녕하세요, {unit}호님
          </h2>
          <p className="text-sm text-[var(--color-on-surface-variant)] mt-1.5">
            오늘도 쾌적한 주차 문화를 함께 만들어요.
          </p>
        </section>

        {/* Hero CTA */}
        <section>
          <Link href="/register">
            <div className="w-full bg-gradient-to-r from-[var(--color-primary)] to-[#1d59cc]
              text-white py-5 px-6 rounded-2xl flex items-center justify-between
              shadow-lg shadow-[var(--color-primary)]/20 active:scale-[0.98] transition-transform card-press">
              <div>
                <p className="text-[18px] font-bold">방문차량 등록하기</p>
                <p className="text-xs opacity-80 mt-0.5">터치 한 번으로 간편하게 예약하세요</p>
              </div>
              <div className="bg-white/20 p-2.5 rounded-full">
                <span className="material-symbols-outlined text-[28px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
              </div>
            </div>
          </Link>
        </section>

        {/* Action Grid — lookup & report (night-aware) */}
        <section className="grid grid-cols-2 gap-3">
          <Link href="/lookup">
            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-2xl
              border border-[var(--color-outline-variant)]/40 shadow-sm flex flex-col gap-3
              active:scale-[0.98] transition-transform relative overflow-hidden">
              <div className="bg-[var(--color-primary)]/8 w-10 h-10 rounded-xl flex items-center justify-center text-[var(--color-primary)]">
                <span className="material-symbols-outlined text-[22px]">manage_search</span>
              </div>
              <div>
                <p className="font-semibold text-[var(--color-on-surface)] text-sm">차량 조회</p>
                {!isNight && (
                  <p className="text-[10px] text-[var(--color-outline)] mt-0.5 flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[11px]">schedule</span>
                    18:00 ~ 06:00
                  </p>
                )}
              </div>
            </div>
          </Link>

          <Link href="/report">
            <div className="bg-[var(--color-surface-container-lowest)] p-5 rounded-2xl
              border border-[var(--color-outline-variant)]/40 shadow-sm flex flex-col gap-3
              active:scale-[0.98] transition-transform">
              <div className="bg-[var(--color-error)]/8 w-10 h-10 rounded-xl flex items-center justify-center text-[var(--color-error)]">
                <span className="material-symbols-outlined text-[22px]">report</span>
              </div>
              <div>
                <p className="font-semibold text-[var(--color-on-surface)] text-sm">신고하기</p>
                {!isNight && (
                  <p className="text-[10px] text-[var(--color-outline)] mt-0.5 flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[11px]">schedule</span>
                    18:00 ~ 06:00
                  </p>
                )}
              </div>
            </div>
          </Link>
        </section>

        {/* Today's visitors */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[18px] font-bold text-[var(--color-on-surface)]">오늘의 방문등록</h3>
            <Link href="/visits" className="text-sm font-semibold text-[var(--color-primary)]">
              전체보기
            </Link>
          </div>

          {todayVisitors.length === 0 ? (
            <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl p-6 text-center
              border border-[var(--color-outline-variant)]/30">
              <span className="material-symbols-outlined text-[var(--color-outline)] text-[40px] mb-2 block">
                directions_car
              </span>
              <p className="text-sm text-[var(--color-on-surface-variant)]">오늘 등록된 방문차량이 없습니다</p>
              <Link href="/register">
                <span className="text-sm font-semibold text-[var(--color-primary)] mt-1 block">
                  지금 등록하기
                </span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {todayVisitors.map((v) => (
                <div key={v.id}
                  className="bg-[var(--color-surface-container-lowest)] rounded-2xl p-4
                    border border-[var(--color-outline-variant)]/30 shadow-sm
                    border-l-4 border-l-[var(--color-primary)]">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary)]
                          text-[11px] font-bold px-2 py-0.5 rounded-md">방문중</span>
                        <span className="font-bold text-[18px] text-[var(--color-on-surface)] plate-mono">
                          {formatPlate(v.plate)}
                        </span>
                      </div>
                      {v.nickname && (
                        <p className="text-xs text-[var(--color-on-surface-variant)]">{v.nickname}</p>
                      )}
                      <p className="text-xs text-[var(--color-on-surface-variant)] flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        06:00 – 18:00
                      </p>
                    </div>
                    <button className="text-xs text-[var(--color-error)] border border-[var(--color-error)]/20
                      bg-[var(--color-error)]/5 px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform">
                      취소
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quota bar */}
          <div className="mt-3 flex items-center gap-2 px-1">
            <div className="flex-1 h-1.5 bg-[var(--color-surface-container-high)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] rounded-full transition-all"
                style={{ width: `${(todayVisitors.length / DAILY_QUOTA) * 100}%` }}
              />
            </div>
            <span className="text-xs text-[var(--color-on-surface-variant)]">
              {todayVisitors.length}/{DAILY_QUOTA}대
            </span>
          </div>
        </section>

        {/* Frequent vehicles */}
        <section>
          <h3 className="text-[18px] font-bold text-[var(--color-on-surface)] mb-3">자주 오는 차량</h3>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {MOCK_FAVORITES.map((f) => (
              <Link key={f.id} href={`/register?plate=${encodeURIComponent(f.plate)}&nickname=${encodeURIComponent(f.nickname)}`}>
                <div className="whitespace-nowrap bg-[var(--color-on-surface)] text-[var(--color-surface)]
                  px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-1.5
                  active:scale-95 transition-transform shrink-0">
                  <span>{f.emoji}</span>
                  <span className="plate-mono">{formatPlate(f.plate)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Penalty status */}
        <section className="bg-[var(--color-surface-container-lowest)] rounded-2xl p-5
          border border-[var(--color-outline-variant)]/30 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[18px] font-bold text-[var(--color-on-surface)]">내 상태</h3>
            <Link href="/penalties">
              <span className="material-symbols-outlined text-[var(--color-on-surface-variant)]/40">
                chevron_right
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-5">
            {/* Gauge */}
            <div className="relative w-20 h-20 shrink-0">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none"
                  stroke="var(--color-surface-container-high)" strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none"
                  stroke={score === 0 ? 'var(--color-success)' : score < 5 ? '#f59e0b' : 'var(--color-error)'}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={score === 0 ? 0 : offset}
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xl font-bold ${statusColor}`}>{score}</span>
              </div>
            </div>
            <div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusBg}`}>
                {statusLabel}
              </span>
              <p className="text-sm text-[var(--color-on-surface-variant)] mt-2 leading-relaxed">
                {score === 0
                  ? '누적된 벌점이 없습니다. 쾌적한 주차 환경을 만들어주셔서 감사합니다!'
                  : `현재 벌점 ${score}점 / ${MAX_PENALTY}점 초과 시 이용이 제한됩니다.`}
              </p>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
