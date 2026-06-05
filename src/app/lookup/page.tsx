'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { useToast } from '@/components/Toast';
import { MOCK_VISITORS, isNightHours, getAuthUnit } from '@/lib/store';
import { normalizePlate, formatPlate, samePlate } from '@/lib/plate';

interface SearchResult {
  type: 'household' | 'visitor' | 'not_found';
  unit?: string;
  plate: string;
}

interface RecentSearch {
  plate: string;
  time: string;
  result: 'household' | 'visitor' | 'not_found';
}

export default function LookupPage() {
  const router = useRouter();
  const [isNight, setIsNight] = useState(false);
  const [plate, setPlate] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const { show, toastEl } = useToast();

  useEffect(() => {
    if (!getAuthUnit()) { router.replace('/'); return; }
    setIsNight(isNightHours());
    const saved = localStorage.getItem('officetel_lookup_history');
    if (saved) setRecents(JSON.parse(saved));
  }, [router]);

  function handleSearch() {
    if (!plate.trim()) return;
    const norm = normalizePlate(plate);
    const today = new Date().toISOString().split('T')[0];

    // Check today's registered visitors (normalize both sides)
    const visitorMatch = MOCK_VISITORS.find(
      (v) => v.date === today && samePlate(v.plate, plate)
    );

    // Check household vehicles (mock: '78너1234' belongs to unit 1001)
    const householdPlates = ['78너1234'];
    const isHousehold = householdPlates.some((hp) => samePlate(hp, plate));

    let res: SearchResult;
    if (isHousehold) {
      res = { type: 'household', plate: norm };
    } else if (visitorMatch) {
      res = { type: 'visitor', unit: visitorMatch.unit, plate: norm };
    } else {
      res = { type: 'not_found', plate: norm };
      show('오늘 방문차량 현황에서 해당 번호를 찾을 수 없습니다.\n번호를 다시 확인해주세요.', 'warning');
    }

    setResult(res);

    // Save to recent
    const entry: RecentSearch = {
      plate: formatPlate(plate),
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      result: res.type,
    };
    const updated = [entry, ...recents.filter((r) => !samePlate(r.plate, plate))].slice(0, 5);
    setRecents(updated);
    localStorage.setItem('officetel_lookup_history', JSON.stringify(updated));
  }

  function clearHistory() {
    setRecents([]);
    localStorage.removeItem('officetel_lookup_history');
  }

  const resultConfig = {
    household: {
      icon: 'verified_user',
      iconColor: 'text-[var(--color-primary)]',
      iconBg: 'bg-[var(--color-primary)]/10',
      badge: '세대 등록',
      badgeBg: 'bg-[var(--color-primary)] text-white',
      message: '세대 등록 차량입니다',
      sub: '24시간 입출차가 허용된 차량입니다.',
    },
    visitor: {
      icon: 'check_circle',
      iconColor: 'text-[var(--color-success)]',
      iconBg: 'bg-[var(--color-success)]/10',
      badge: '등록 완료',
      badgeBg: 'bg-[var(--color-success)] text-white',
      message: `${result?.unit ?? ''}호에서 방문 등록한 차량입니다`,
      sub: '오늘 06:00 – 18:00 입차 가능한 차량입니다.',
    },
    not_found: {
      icon: 'help',
      iconColor: 'text-[var(--color-tertiary)]',
      iconBg: 'bg-[var(--color-tertiary)]/10',
      badge: '미등록',
      badgeBg: 'bg-[var(--color-tertiary)] text-white',
      message: '등록되지 않은 차량입니다',
      sub: '오늘 방문차량 명단에 없는 차량입니다. 신고하시겠습니까?',
    },
  };

  const daytimeScreen = (
    <div className="flex flex-col items-center justify-center pt-16 px-6 text-center">
      <div className="w-24 h-24 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-[var(--color-outline)] text-[48px]">schedule</span>
      </div>
      <h2 className="text-[20px] font-bold text-[var(--color-on-surface)] mb-2">
        지금은 조회할 수 없습니다
      </h2>
      <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
        차량 조회는 매일 <strong>오후 6시부터 다음날 오전 6시</strong>까지 이용 가능합니다.
      </p>
      <div className="mt-6 px-4 py-3 bg-[var(--color-surface-container)] rounded-2xl">
        <p className="text-sm text-[var(--color-on-surface-variant)]">
          현재 시각{' '}
          <span className="font-bold text-[var(--color-on-surface)]">
            {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {toastEl}
      <AppHeader title="차량 조회" showBack onBack={() => router.back()} />

      <main className="pt-20 pb-28 px-5 space-y-6">
        {/* Night hero */}
        {isNight && (
          <section className="relative overflow-hidden rounded-3xl h-44 flex flex-col justify-end p-6
            bg-[var(--color-inverse-surface)]">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="relative z-10 space-y-1">
              <div className="flex items-center gap-1.5 text-[var(--color-primary-fixed-dim)] text-xs mb-1">
                <span className="material-symbols-outlined text-[14px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>dark_mode</span>
                야간 주차 관리 모드 (18:00 – 06:00)
              </div>
              <h2 className="text-white text-[24px] font-bold leading-tight">
                조회할 차량의<br />번호를 입력하세요
              </h2>
            </div>
          </section>
        )}

        {!isNight && daytimeScreen}

        {isNight && (
          <>
            {/* Search */}
            <section className="space-y-3">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined
                  text-[var(--color-outline)] text-[22px]">directions_car</span>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="12가 3456"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  maxLength={10}
                  className="w-full h-16 pl-12 pr-4 rounded-2xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                    text-[20px] font-bold plate-mono
                    placeholder:text-[var(--color-outline-variant)] placeholder:font-normal placeholder:text-[18px]
                    focus:border-[var(--color-primary)] focus:outline-none focus:shadow-[0_0_0_4px_rgba(0,74,198,0.1)]
                    transition-all"
                />
              </div>
              <button
                onClick={handleSearch}
                className="w-full h-14 bg-[var(--color-primary)] text-white rounded-2xl font-bold text-[17px]
                  flex items-center justify-center gap-2 active:scale-[0.98] transition-all
                  shadow-lg shadow-[var(--color-primary)]/20"
              >
                <span className="material-symbols-outlined">search</span>
                조회하기
              </button>
            </section>

            {/* Result */}
            {result && (() => {
              const cfg = resultConfig[result.type];
              return (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[18px] font-bold text-[var(--color-on-surface)]">조회 결과</h3>
                    <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-3 py-1 rounded-full text-xs font-bold">
                      1건
                    </span>
                  </div>

                  <div className="bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-3xl p-5 shadow-sm space-y-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-2xl ${cfg.iconBg} flex items-center justify-center shrink-0`}>
                        <span className={`material-symbols-outlined ${cfg.iconColor} text-[28px]`}
                          style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start">
                          <span className="text-[24px] font-bold text-[var(--color-on-surface)] plate-mono">
                            {formatPlate(result.plate)}
                          </span>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${cfg.badgeBg}`}>
                            {cfg.badge}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--color-on-surface-variant)]">{cfg.message}</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[var(--color-surface-container)]">
                      <p className="text-xs text-[var(--color-on-surface-variant)]">{cfg.sub}</p>
                    </div>
                  </div>

                  {result.type === 'not_found' && (
                    <button
                      onClick={() => router.push(`/report?plate=${encodeURIComponent(plate)}`)}
                      className="w-full bg-[var(--color-error-container)] text-[var(--color-on-error-container)]
                        p-4 rounded-2xl flex items-center justify-between
                        border border-[var(--color-error)]/10 active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center text-[var(--color-error)]">
                          <span className="material-symbols-outlined text-[20px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}>report</span>
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-sm">미등록 차량 신고</p>
                          <p className="text-xs opacity-80">즉시 관리자에게 알림이 전송됩니다</p>
                        </div>
                      </div>
                      <span className="bg-[var(--color-error)] text-white px-3 py-1.5 rounded-xl text-xs font-bold">
                        신고
                      </span>
                    </button>
                  )}
                </section>
              );
            })()}

            {/* Recent searches */}
            {recents.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[18px] font-bold text-[var(--color-on-surface)]">최근 조회 기록</h3>
                  <button onClick={clearHistory}
                    className="text-xs font-semibold text-[var(--color-primary)]">전체 삭제</button>
                </div>
                <div className="space-y-2">
                  {recents.map((r, i) => (
                    <div key={i}
                      onClick={() => setPlate(r.plate)}
                      className="flex items-center justify-between p-4 bg-[var(--color-surface-container-low)]
                        rounded-2xl active:bg-[var(--color-surface-container-high)] transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-container-high)]
                          flex items-center justify-center text-[var(--color-outline)]">
                          <span className="material-symbols-outlined text-[20px]">history</span>
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--color-on-surface)] plate-mono">{r.plate}</p>
                          <p className="text-xs text-[var(--color-on-surface-variant)]">
                            {r.time} ·{' '}
                            <span className={
                              r.result === 'not_found' ? 'text-[var(--color-error)] font-semibold' :
                              r.result === 'household' ? 'text-[var(--color-primary)]' :
                              'text-[var(--color-success)]'
                            }>
                              {r.result === 'not_found' ? '미등록' : r.result === 'household' ? '세대차량' : '방문차량'}
                            </span>
                          </p>
                        </div>
                      </div>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        const updated = recents.filter((_, j) => j !== i);
                        setRecents(updated);
                        localStorage.setItem('officetel_lookup_history', JSON.stringify(updated));
                      }} className="w-10 h-10 flex items-center justify-center text-[var(--color-outline-variant)]">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Tip */}
            <div className="bg-[var(--color-tertiary)]/5 border border-[var(--color-tertiary)]/10
              p-5 rounded-3xl flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-[var(--color-tertiary)]/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[var(--color-tertiary)] text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
              </div>
              <div>
                <p className="font-semibold text-[var(--color-tertiary)] text-sm mb-1">스마트 팁</p>
                <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
                  차량번호는 띄어쓰기 여부와 상관없이 자동으로 인식됩니다.
                  예: 12가3456 = 12가 3456
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
