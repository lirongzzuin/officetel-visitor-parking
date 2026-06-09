'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAuth, getAuthUnit } from '@/lib/store';
import { apiFetch } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [unit, setUnit] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getAuthUnit()) router.replace('/home');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!unit || !password) {
      setError('호수와 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{
        access_token: string;
        unit: string;
        role: string;
        must_change_password: boolean;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ unit, password }),
        skipAuth: true,
      });
      setAuth(data.unit, data.access_token, data.role);
      if (data.must_change_password && data.role !== 'admin') {
        window.location.href = '/change-password';
      } else {
        window.location.href = '/home';
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-8
      bg-[var(--color-background)]">

      {/* Logo & branding */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-20 h-20 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center
          mb-4 shadow-lg shadow-[var(--color-primary)]/20">
          <span className="material-symbols-outlined text-white text-[44px]"
            style={{ fontVariationSettings: "'FILL' 1" }}>
            local_parking
          </span>
        </div>
        <h1 className="text-[22px] font-bold text-[var(--color-on-surface)] tracking-tight">
          OO오피스텔 주차
        </h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1.5">
          로그인 후 이용해주세요
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-[var(--color-on-surface-variant)] px-1">호수</label>
          <div className="relative">
            <input
              type="text"
              inputMode="text"
              placeholder="예: 1001"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full h-12 px-4 pr-12 rounded-xl border-2 border-[var(--color-outline-variant)]
                bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                placeholder:text-[var(--color-outline)] text-base
                focus:border-[var(--color-primary)] focus:outline-none transition-colors"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined
              text-[var(--color-outline)] text-[20px]">home</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-[var(--color-on-surface-variant)] px-1">비밀번호</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 pr-12 rounded-xl border-2 border-[var(--color-outline-variant)]
                bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)]
                placeholder:text-[var(--color-outline)] text-base
                focus:border-[var(--color-primary)] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-outline)]
                hover:text-[var(--color-on-surface)] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">
                {showPw ? 'visibility_off' : 'visibility'}
              </span>
            </button>
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
          disabled={loading}
          className="w-full h-12 bg-[var(--color-primary)] text-white rounded-xl font-semibold
            flex items-center justify-center gap-2 mt-2 active:scale-[0.98] transition-all
            disabled:opacity-70 shadow-lg shadow-[var(--color-primary)]/20"
        >
          {loading
            ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : '로그인'}
        </button>
      </form>

      <p className="mt-6 text-sm text-center text-[var(--color-on-surface-variant)]">
        처음 로그인하시나요?{' '}
        <span className="text-[var(--color-primary)] font-semibold">초기 비밀번호: 호수 뒤에 0붙여 4자리 + 00 (예: 101호 → 010100)</span>
      </p>

      <footer className="mt-auto pt-12 text-center space-y-1">
        <p className="text-xs text-[var(--color-on-surface-variant)]/60">관리사무소 문의: {process.env.NEXT_PUBLIC_OFFICE_PHONE ?? '관리사무소'}</p>
        <p className="text-xs text-[var(--color-on-surface-variant)]/60">{process.env.NEXT_PUBLIC_OFFICE_HOURS ?? '평일 09:00 – 18:00'}</p>
      </footer>
    </main>
  );
}
