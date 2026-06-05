'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/components/Toast';
import { getAuthUnit, MOCK_VISITORS, DAILY_QUOTA } from '@/lib/store';
import { liveFormat } from '@/lib/plate';
import { Suspense } from 'react';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const unit = getAuthUnit() ?? '1001';

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [plate, setPlate] = useState(params.get('plate') ? liveFormat(params.get('plate')!) : '');
  const [nickname, setNickname] = useState(params.get('nickname') ?? '');
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const { show, toastEl } = useToast();

  const todayVisitors = MOCK_VISITORS.filter((v) => v.unit === unit && v.date === todayStr);
  const remaining = DAILY_QUOTA - todayVisitors.length;
  const quotaExceeded = remaining <= 0;

  const fmt = useCallback((d: Date) => {
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }, []);

  function handlePlateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPlate(liveFormat(e.target.value));
  }

  function handleSubmit() {
    if (!plate.trim()) {
      show('차량번호를 입력해주세요.', 'error');
      return;
    }
    if (quotaExceeded) {
      show('오늘 등록 가능한 10대를 모두 사용했습니다.', 'error');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      show('등록되었습니다 ✓', 'success');
      setTimeout(() => router.push('/home'), 1200);
    }, 700);
  }

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {toastEl}
      <AppHeader title="방문 차량 등록" showBack onBack={() => router.back()} />

      <main className="pt-20 pb-40">
        {/* Hero banner */}
        <div className="px-5 mb-8">
          <div className="relative overflow-hidden rounded-2xl h-36 flex items-center px-6
            bg-gradient-to-br from-[var(--color-primary)] to-[#1d59cc] text-white shadow-lg">
            <div className="z-10">
              <h2 className="text-[22px] font-bold leading-tight">빠른 방문 예약</h2>
              <p className="text-sm opacity-80 mt-1">방문객을 위한 주차 공간을 미리 확보하세요.</p>
            </div>
            <span className="material-symbols-outlined absolute right-[-10px] bottom-[-20px] text-white/20 text-[140px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>directions_car</span>
          </div>
        </div>

        {/* Step 1: Date */}
        <section className="px-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]
              text-[12px] font-bold flex items-center justify-center">1</span>
            <label className="font-semibold text-[var(--color-on-surface)]">방문 날짜 선택</label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'today' as const, label: '오늘', sub: fmt(today) },
              { key: 'tomorrow' as const, label: '내일', sub: fmt(new Date(Date.now() + 86400000)) },
              { key: 'custom' as const, label: '날짜 선택', icon: 'calendar_month' },
            ].map(({ key, label, sub, icon }) => {
              const active = selectedDate === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={`h-[72px] rounded-2xl border-2 flex flex-col items-center justify-center
                    transition-all active:scale-95
                    ${active
                      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                      : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)]'}`}
                >
                  {icon
                    ? <span className={`material-symbols-outlined mb-0.5 ${active ? 'text-white' : 'text-[var(--color-primary)]'}`}>{icon}</span>
                    : <span className="font-semibold text-[15px]">{label}</span>
                  }
                  {sub && <span className={`text-[11px] ${active ? 'text-white/70' : 'opacity-60'}`}>{sub}</span>}
                  {icon && <span className={`text-[11px] ${active ? 'text-white/70' : 'opacity-60'}`}>{label}</span>}
                </button>
              );
            })}
          </div>

          {selectedDate === 'custom' && (
            <input
              type="date"
              min={todayStr}
              max={new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]}
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="mt-3 w-full h-12 px-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                focus:border-[var(--color-primary)] focus:outline-none"
            />
          )}
        </section>

        <div className="h-2 bg-[var(--color-surface-container-low)] mb-8" />

        {/* Step 2: Plate */}
        <section className="px-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]
              text-[12px] font-bold flex items-center justify-center">2</span>
            <label className="font-semibold text-[var(--color-on-surface)]">차량 번호 입력</label>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="text"
              placeholder="12가 3456"
              value={plate}
              onChange={handlePlateChange}
              maxLength={10}
              className="w-full h-[72px] px-5 pr-14 rounded-2xl border-2 border-[var(--color-outline-variant)]
                bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                text-center text-[28px] font-bold tracking-widest uppercase plate-mono
                placeholder:text-[var(--color-outline)]/50 placeholder:text-[20px] placeholder:font-normal
                focus:border-[var(--color-primary)] focus:outline-none focus:shadow-[0_0_0_4px_rgba(0,74,198,0.08)] transition-all"
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 material-symbols-outlined
              text-[var(--color-outline)] text-[22px]">sensor_door</span>
          </div>
          <p className="mt-2 text-xs text-[var(--color-outline)] flex items-center gap-1.5 px-1">
            <span className="material-symbols-outlined text-[14px]">info</span>
            정확한 차량 번호를 입력해야 차단기가 자동으로 열립니다.
          </p>
        </section>

        <div className="h-2 bg-[var(--color-surface-container-low)] mb-8" />

        {/* Step 3 & 4 */}
        <div className="grid grid-cols-2 gap-4 px-5 mb-8">
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]
                text-[12px] font-bold flex items-center justify-center">3</span>
              <label className="font-semibold text-[var(--color-on-surface)] text-sm">별칭 (선택)</label>
            </div>
            <input
              type="text"
              placeholder="예: 동생 차"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="h-14 px-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] text-sm
                focus:border-[var(--color-primary)] focus:outline-none transition-colors"
            />
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]
                text-[12px] font-bold flex items-center justify-center">4</span>
              <label className="font-semibold text-[var(--color-on-surface)] text-sm">즐겨찾기</label>
            </div>
            <button
              type="button"
              onClick={() => setFavorite((v) => !v)}
              className={`h-14 px-4 rounded-xl border-2 flex items-center justify-between transition-all
                ${favorite
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                  : 'border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]'}`}
            >
              <span className={`text-sm ${favorite ? 'text-[var(--color-primary)] font-semibold' : 'text-[var(--color-on-surface-variant)]'}`}>
                {favorite ? '등록됨' : '해제'}
              </span>
              <span
                className={`material-symbols-outlined ${favorite ? 'text-[var(--color-primary)]' : 'text-[var(--color-outline-variant)]'}`}
                style={{ fontVariationSettings: favorite ? "'FILL' 1" : "'FILL' 0" }}
              >star</span>
            </button>
          </section>
        </div>

        {/* Info card */}
        <div className="mx-5 p-5 bg-[var(--color-primary)]/5 rounded-2xl border border-[var(--color-primary)]/10
          flex items-start gap-4">
          <span className="material-symbols-outlined text-[var(--color-primary)] text-[22px] mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
          <div>
            <p className="font-semibold text-[var(--color-primary)] text-sm mb-1.5">방문 시 안내사항</p>
            <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
              방문 차량은 당일 오전 6시부터 오후 6시까지 입차할 수 있습니다.
              등록되지 않은 차량은 입차가 제한됩니다.
            </p>
          </div>
        </div>
      </main>

      {/* Sticky bottom */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-40
        bg-[var(--color-surface)]/90 backdrop-blur-md border-t border-[var(--color-outline-variant)]/30 pb-safe">
        <div className="px-5 pt-4 pb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-primary)]" />
            </span>
            <p className="text-sm text-[var(--color-on-surface-variant)]">
              오늘{' '}
              <span className="text-[var(--color-primary)] font-bold">
                {todayVisitors.length} / {DAILY_QUOTA}대
              </span>
              {' '}등록 완료
            </p>
          </div>

          {quotaExceeded ? (
            <div className="w-full h-14 bg-[var(--color-surface-container-high)] rounded-2xl
              flex items-center justify-center">
              <p className="text-sm text-[var(--color-error)] font-semibold">
                오늘 등록 가능한 10대를 모두 사용했습니다
              </p>
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-14 bg-[var(--color-primary)] text-white rounded-2xl font-bold text-[17px]
                flex items-center justify-center gap-3 active:scale-[0.97] transition-all
                shadow-[0_8px_20px_-4px_rgba(0,74,198,0.4)] disabled:opacity-70"
            >
              {loading
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <>
                    <span>등록 완료하기</span>
                    <span className="material-symbols-outlined text-[22px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
