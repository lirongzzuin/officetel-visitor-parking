'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/components/Toast';
import { CalendarSheet } from '@/components/CalendarSheet';
import { getAuthUnit, isDayHours, clearAuth } from '@/lib/store';
import { liveFormat } from '@/lib/plate';
import { apiFetch } from '@/lib/api-client';

interface Favorite {
  id: string;
  plate_display: string;
  plate_normalized: string;
  nickname: string;
  emoji: string;
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();

  const today = new Date();
  const todayStr = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 9 * 3600_000 + 86400_000).toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [plate, setPlate] = useState(params.get('plate') ? liveFormat(params.get('plate')!) : '');
  const [nickname, setNickname] = useState(params.get('nickname') ?? '');
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isDay, setIsDay] = useState(true);
  const [visitStartTime, setVisitStartTime] = useState('06:00');
  const [visitEndTime, setVisitEndTime] = useState('18:00');
  const { show, toastEl } = useToast();

  const loadInitial = useCallback(async () => {
    try {
      const favs = await apiFetch<Favorite[]>('/api/favorites');
      setFavorites(favs);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!getAuthUnit()) { clearAuth(); router.replace('/'); return; }
    setIsDay(isDayHours());
    loadInitial();
  }, [router, loadInitial]);

  const fmt = useCallback((d: Date) => {
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }, []);

  function handlePlateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPlate(liveFormat(e.target.value));
  }

  function selectFavorite(fav: Favorite) {
    setPlate(fav.plate_display);
    setNickname(fav.nickname);
  }

  function getValidDate(): string {
    if (selectedDate === 'today') return todayStr;
    if (selectedDate === 'tomorrow') return tomorrowStr;
    return customDate;
  }

  async function handleSubmit() {
    if (!plate.trim()) {
      show('차량번호를 입력해주세요.', 'error');
      return;
    }
    if (selectedDate === 'custom' && !customDate) {
      show('날짜를 선택해주세요.', 'error');
      return;
    }


    setLoading(true);
    try {
      await apiFetch('/api/visitors', {
        method: 'POST',
        body: JSON.stringify({
          plate,
          valid_date: getValidDate(),
          nickname: nickname || null,
          visit_start_time: visitStartTime,
          visit_end_time: visitEndTime,
        }),
      });

      if (favorite && plate.trim()) {
        try {
          await apiFetch('/api/favorites', {
            method: 'POST',
            body: JSON.stringify({ plate, nickname: nickname || plate.trim(), emoji: '🚗' }),
          });
        } catch {
          // Duplicate favorite is fine — ignore
        }
      }

      show('등록되었습니다 ✓', 'success');
      setTimeout(() => router.push('/home'), 1200);
    } catch (e: unknown) {
      show((e as Error).message ?? '등록에 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (!isDay) {
    return (
      <div className="min-h-dvh bg-[var(--color-background)]">
        <AppHeader title="방문 차량 등록" showBack onBack={() => router.back()} />
        <main className="pt-20 pb-28 px-6 flex flex-col items-center justify-center min-h-[70dvh] text-center">
          <div className="w-24 h-24 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-[var(--color-outline)] text-[48px]">nights_stay</span>
          </div>
          <h2 className="text-[20px] font-bold text-[var(--color-on-surface)] mb-2">
            지금은 등록할 수 없습니다
          </h2>
          <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
            차량 등록은 매일 <strong>오전 6시부터 오후 6시</strong>까지 이용 가능합니다.
          </p>
        </main>
      </div>
    );
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

        {/* Favorites quick-select */}
        {favorites.length > 0 && (
          <>
            <div className="px-5 mb-3">
              <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">즐겨찾기에서 선택</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar px-5 mb-6">
              {favorites.map((f) => (
                <button
                  key={f.id}
                  onClick={() => selectFavorite(f)}
                  className="whitespace-nowrap bg-[var(--color-surface-container-lowest)] border-2 border-[var(--color-outline-variant)]
                    px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-1.5
                    active:scale-95 transition-transform shrink-0"
                >
                  <span>{f.emoji}</span>
                  <span className="plate-mono text-[var(--color-on-surface)]">{f.plate_display}</span>
                  {f.nickname && <span className="text-[var(--color-on-surface-variant)] text-xs">· {f.nickname}</span>}
                </button>
              ))}
            </div>
            <div className="h-2 bg-[var(--color-surface-container-low)] mb-8" />
          </>
        )}

        {/* Step 1: Date */}
        <section className="px-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]
              text-[12px] font-bold flex items-center justify-center">1</span>
            <label className="font-semibold text-[var(--color-on-surface)]">방문 날짜 선택</label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* 오늘 */}
            {(['today', 'tomorrow'] as const).map((key) => {
              const isToday = key === 'today';
              const label = isToday ? '오늘' : '내일';
              const sub = fmt(isToday ? today : new Date(Date.now() + 86400000));
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
                  <span className="font-semibold text-[15px]">{label}</span>
                  <span className={`text-[11px] ${active ? 'text-white/70' : 'opacity-60'}`}>{sub}</span>
                </button>
              );
            })}

            {/* 날짜 선택 */}
            <button
              onClick={() => { setSelectedDate('custom'); setShowCalendar(true); }}
              className={`h-[72px] rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5
                transition-all active:scale-95
                ${selectedDate === 'custom'
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                  : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)]'}`}
            >
              <span className={`material-symbols-outlined text-[22px]
                ${selectedDate === 'custom' ? 'text-white' : 'text-[var(--color-primary)]'}`}>
                calendar_month
              </span>
              <span className={`text-[11px] font-semibold
                ${selectedDate === 'custom' ? 'text-white' : 'text-[var(--color-on-surface-variant)]'}`}>
                {selectedDate === 'custom' && customDate
                  ? `${parseInt(customDate.slice(5, 7))}월 ${parseInt(customDate.slice(8, 10))}일`
                  : '날짜 선택'}
              </span>
            </button>
          </div>

          {/* Selected custom date pill */}
          {selectedDate === 'custom' && customDate && (
            <button
              onClick={() => setShowCalendar(true)}
              className="mt-3 w-full h-11 px-4 rounded-xl border-2 border-[var(--color-primary)]/40
                bg-[var(--color-primary)]/5 flex items-center justify-between
                active:scale-[0.99] transition-transform"
            >
              <span className="text-sm font-semibold text-[var(--color-primary)]">
                {new Date(customDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
                })}
              </span>
              <span className="material-symbols-outlined text-[var(--color-primary)] text-[18px]">edit_calendar</span>
            </button>
          )}

          <CalendarSheet
            open={showCalendar}
            value={customDate}
            min={todayStr}
            max={new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]}
            onSelect={(d) => { setCustomDate(d); setShowCalendar(false); }}
            onClose={() => { setShowCalendar(false); if (!customDate) setSelectedDate('today'); }}
          />
        </section>

        <div className="h-2 bg-[var(--color-surface-container-low)] mb-8" />

        {/* Step 2: Visit time */}
        {(() => {
          const slots = Array.from({ length: 25 }, (_, i) => {
            const h = Math.floor(i / 2) + 6;
            const m = i % 2 === 0 ? '00' : '30';
            return `${String(h).padStart(2, '0')}:${m}`;
          });
          return (
            <section className="px-5 mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]
                  text-[12px] font-bold flex items-center justify-center">2</span>
                <label className="font-semibold text-[var(--color-on-surface)]">방문 허용 시간</label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[var(--color-on-surface-variant)] mb-2">시작 시간</p>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {slots.slice(0, -1).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setVisitStartTime(t);
                          if (t > visitEndTime) setVisitEndTime(t);
                        }}
                        className={`shrink-0 px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all
                          ${visitStartTime === t
                            ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-on-surface-variant)] mb-2">종료 시간</p>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {slots.slice(1).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setVisitEndTime(t)}
                        disabled={t < visitStartTime}
                        className={`shrink-0 px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all
                          disabled:opacity-30
                          ${visitEndTime === t
                            ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface-container-lowest)] border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--color-outline)] flex items-center gap-1.5 px-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                선택한 시간대에만 차단기가 열립니다 ({visitStartTime} – {visitEndTime})
              </p>
            </section>
          );
        })()}

        <div className="h-2 bg-[var(--color-surface-container-low)] mb-8" />

        {/* Step 3: Plate */}
        <section className="px-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]
              text-[12px] font-bold flex items-center justify-center">3</span>
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
                text-[12px] font-bold flex items-center justify-center">4</span>
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
                text-[12px] font-bold flex items-center justify-center">5</span>
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
