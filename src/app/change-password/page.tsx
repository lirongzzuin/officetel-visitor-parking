'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setPwChanged, getAuthUnit, clearAuth } from '@/lib/store';
import { apiFetch } from '@/lib/api-client';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [unit, setUnitState] = useState('');
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState('');
  const [next_, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getAuthUnit();
    if (!u) { clearAuth(); router.replace('/'); return; }
    setUnitState(u);
    setReady(true);
  }, [router]);

  const checks = [
    { label: '8자 이상', ok: next_.length >= 8 },
    { label: '영문 포함', ok: /[a-zA-Z]/.test(next_) },
    { label: '숫자 포함', ok: /\d/.test(next_) },
    { label: '호수와 다름', ok: next_ !== unit && next_.length > 0 },
  ];
  const allOk = checks.every((c) => c.ok) && next_ === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allOk) return;
    setError('');
    setLoading(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next_ }),
      });
      setPwChanged();
      router.push('/home');
    } catch (e: unknown) {
      setError((e as Error).message ?? '비밀번호 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-8 bg-[var(--color-background)]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[var(--color-primary)] text-[32px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
          </div>
          <h1 className="text-[22px] font-bold text-[var(--color-on-surface)] text-center">
            안전을 위해 비밀번호를 변경해주세요
          </h1>
          <p className="text-sm text-[var(--color-on-surface-variant)] text-center mt-2">
            초기 비밀번호는 호수와 같습니다. 새 비밀번호를 설정해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: '현재 비밀번호', value: current, setter: setCurrent },
            { label: '새 비밀번호', value: next_, setter: setNext },
            { label: '새 비밀번호 확인', value: confirm, setter: setConfirm },
          ].map(({ label, value, setter }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--color-on-surface-variant)] px-1">{label}</label>
              <input
                type="password"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border-2 border-[var(--color-outline-variant)]
                  bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                  focus:border-[var(--color-primary)] focus:outline-none transition-colors"
              />
            </div>
          ))}

          {/* Validation checklist */}
          <div className="bg-[var(--color-surface-container-low)] rounded-xl p-4 space-y-2">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[18px] ${c.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-outline)]'}`}
                  style={{ fontVariationSettings: c.ok ? "'FILL' 1" : "'FILL' 0" }}>
                  {c.ok ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span className={`text-sm ${c.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                  {c.label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[18px] ${next_ && next_ === confirm ? 'text-[var(--color-success)]' : 'text-[var(--color-outline)]'}`}
                style={{ fontVariationSettings: next_ && next_ === confirm ? "'FILL' 1" : "'FILL' 0" }}>
                {next_ && next_ === confirm ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={`text-sm ${next_ && next_ === confirm ? 'text-[var(--color-success)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                비밀번호 일치
              </span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--color-error)] flex items-center gap-1.5 px-1">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!allOk || loading}
            className="w-full h-12 bg-[var(--color-primary)] text-white rounded-xl font-semibold
              flex items-center justify-center gap-2 mt-2 active:scale-[0.98] transition-all
              disabled:opacity-40 shadow-lg shadow-[var(--color-primary)]/20"
          >
            {loading
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : '변경하고 시작하기'}
          </button>
        </form>
      </div>
    </main>
  );
}
