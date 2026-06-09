'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { useToast } from '@/components/Toast';
import { isNightHours, getAuthUnit, clearAuth } from '@/lib/store';
import { liveFormat } from '@/lib/plate';

type SubmitState = 'idle' | 'loading' | 'registered_visitor' | 'unknown' | 'household';

function ReportForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [isNight, setIsNight] = useState(false);
  const [plate, setPlate] = useState(params.get('plate') ?? '');
  const [memo, setMemo] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const { show, toastEl } = useToast();

  useEffect(() => {
    if (!getAuthUnit()) { clearAuth(); router.replace('/'); return; }
    setIsNight(isNightHours());
  }, [router]);

  function handlePlateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPlate(liveFormat(e.target.value));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!plate.trim()) {
      show('차량번호를 입력해주세요.', 'error');
      return;
    }
    setSubmitState('loading');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('officetel_token') : null;
      const fd = new FormData();
      fd.append('plate', plate);
      if (memo) fd.append('memo', memo);
      const photoFile = fileRef.current?.files?.[0];
      if (photoFile) fd.append('photo', photoFile);

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        const e = new Error(json.message ?? '신고에 실패했습니다') as Error & { code?: string };
        e.code = json.code;
        throw e;
      }
      const data = (json.data ?? json) as { kind: 'visitor' | 'unknown'; unit?: string; banned?: boolean };

      if (data.kind === 'visitor') {
        setSubmitState('registered_visitor');
      } else {
        setSubmitState('unknown');
      }
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === 'TIME_RESTRICTED') {
        setIsNight(false);
        setSubmitState('idle');
      } else {
        show(err.message ?? '신고에 실패했습니다', 'error');
        setSubmitState('idle');
      }
    }
  }

  const daytimeScreen = (
    <div className="flex flex-col items-center justify-center pt-16 px-6 text-center">
      <div className="w-24 h-24 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-[var(--color-outline)] text-[48px]">schedule</span>
      </div>
      <h2 className="text-[20px] font-bold text-[var(--color-on-surface)] mb-2">
        지금은 신고할 수 없습니다
      </h2>
      <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
        신고 기능은 매일 <strong>오후 6시부터 다음날 오전 6시</strong>까지 이용 가능합니다.
      </p>
    </div>
  );

  if (submitState === 'registered_visitor') {
    return (
      <div className="min-h-dvh bg-[var(--color-background)]">
        <AppHeader title="신고하기" showBack onBack={() => setSubmitState('idle')} />
        <main className="pt-20 pb-28 px-5 flex flex-col items-center justify-center min-h-[70dvh] text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center mb-5">
            <span className="material-symbols-outlined text-[var(--color-success)] text-[44px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
          </div>
          <h2 className="text-[20px] font-bold text-[var(--color-on-surface)] mb-2">신고가 접수되었습니다</h2>
          <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed max-w-xs">
            해당 차량은 방문 등록 차량으로, 등록 세대에게 알림이 전송되었으며 관리자가 확인합니다.
          </p>
          <div className="flex gap-3 mt-8 w-full max-w-xs">
            <button onClick={() => setSubmitState('idle')}
              className="flex-1 h-12 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]
                rounded-2xl font-semibold active:scale-95 transition-transform">
              다시 신고
            </button>
            <button onClick={() => router.push('/home')}
              className="flex-[2] h-12 bg-[var(--color-primary)] text-white rounded-2xl font-semibold
                shadow-lg shadow-[var(--color-primary)]/20 active:scale-95 transition-transform">
              홈으로
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (submitState === 'unknown') {
    return (
      <div className="min-h-dvh bg-[var(--color-background)]">
        <AppHeader title="신고하기" showBack onBack={() => setSubmitState('idle')} />
        <main className="pt-20 pb-28 px-5 flex flex-col items-center justify-center min-h-[70dvh] text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--color-tertiary)]/10 flex items-center justify-center mb-5">
            <span className="material-symbols-outlined text-[var(--color-tertiary)] text-[44px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>report_gmailerrorred</span>
          </div>
          <h2 className="text-[20px] font-bold text-[var(--color-on-surface)] mb-2">신고가 접수되었습니다</h2>
          <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed max-w-xs">
            미등록 차량으로 신고가 접수되었습니다. 관리자가 확인 후 조치하겠습니다.
          </p>
          <div className="flex gap-3 mt-8 w-full max-w-xs">
            <button onClick={() => setSubmitState('idle')}
              className="flex-1 h-12 bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]
                rounded-2xl font-semibold active:scale-95 transition-transform">
              다시 신고
            </button>
            <button onClick={() => router.push('/home')}
              className="flex-[2] h-12 bg-[var(--color-primary)] text-white rounded-2xl font-semibold
                shadow-lg shadow-[var(--color-primary)]/20 active:scale-95 transition-transform">
              홈으로
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {toastEl}
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handlePhotoChange} />

      <AppHeader title="신고하기" showBack onBack={() => router.back()} />

      <main className="pt-20 pb-32 px-5 space-y-6">
        <section>
          <p className="text-sm text-[var(--color-on-surface-variant)]">주차 민원 접수</p>
          <h2 className="text-[22px] font-bold text-[var(--color-on-surface)] mt-0.5">
            사진과 차량번호를<br />함께 등록해주세요
          </h2>
        </section>

        {!isNight && daytimeScreen}

        {isNight && (
          <>
            {/* Photo upload */}
            <section>
              {photoPreview ? (
                <div className="relative aspect-video rounded-2xl overflow-hidden shadow-lg border border-[var(--color-outline-variant)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="신고 사진" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPhotoPreview(null)}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 text-white
                      flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full aspect-video rounded-2xl border-2 border-dashed border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-low)] flex flex-col items-center justify-center gap-3
                    hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/3 transition-all active:scale-[0.98]"
                >
                  <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[var(--color-primary)] text-[28px]">photo_camera</span>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm text-[var(--color-primary)]">현장 사진 촬영하기</p>
                    <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
                      차량 번호판과 주변 환경이 잘 보이도록 촬영해 주세요
                    </p>
                  </div>
                </button>
              )}
            </section>

            {/* Plate input */}
            <section className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-on-surface-variant)] px-1">차량 번호</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="text"
                  placeholder="12가 3456"
                  value={plate}
                  onChange={handlePlateChange}
                  maxLength={10}
                  className="w-full h-12 px-4 pr-12 rounded-xl border-2 border-[var(--color-outline-variant)]
                    bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                    plate-mono text-base
                    placeholder:text-[var(--color-outline)] placeholder:font-normal
                    focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined
                  text-[var(--color-on-surface-variant)] text-[20px]">directions_car</span>
              </div>
              <p className="text-[11px] text-[var(--color-outline)] px-1">
                띄어쓰기 여부와 상관없이 자동으로 인식됩니다 (12가3456 = 12가 3456)
              </p>
            </section>

            {/* Memo */}
            <section className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-on-surface-variant)] px-1">
                상세 설명 <span className="font-normal text-[var(--color-outline)]">(선택)</span>
              </label>
              <textarea
                rows={4}
                placeholder="주차 위치나 위반 사항에 대해 자세히 적어주시면 빠른 조치가 가능합니다."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full p-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                  bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] text-sm
                  placeholder:text-[var(--color-outline)] resize-none
                  focus:border-[var(--color-primary)] focus:outline-none transition-colors"
              />
            </section>

            {/* Warning */}
            <div className="p-4 rounded-xl bg-[var(--color-surface-container-low)]
              border border-[var(--color-outline-variant)] flex items-start gap-3">
              <span className="material-symbols-outlined text-[var(--color-tertiary)] text-[20px] mt-0.5">info</span>
              <div>
                <p className="text-sm font-semibold text-[var(--color-on-surface)] mb-0.5">허위 신고 주의</p>
                <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
                  악의적인 허위 신고 시 서비스 이용이 제한될 수 있습니다.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {isNight && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-40
          bg-[var(--color-surface)]/90 backdrop-blur-md border-t border-[var(--color-outline-variant)]/30 pb-safe">
          <div className="px-5 py-4">
            <button
              onClick={handleSubmit}
              disabled={submitState === 'loading'}
              className="w-full h-14 bg-[var(--color-primary)] text-white rounded-2xl font-bold text-[17px]
                flex items-center justify-center gap-2 active:scale-[0.98] transition-all
                shadow-lg shadow-[var(--color-primary)]/20 disabled:opacity-70"
            >
              {submitState === 'loading'
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <>
                    <span className="material-symbols-outlined text-[22px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    신고하기
                  </>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportForm />
    </Suspense>
  );
}
