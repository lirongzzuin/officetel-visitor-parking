'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { useTheme } from '@/providers/ThemeProvider';
import { getAuthUnit, clearAuth } from '@/lib/store';
import { useToast } from '@/components/Toast';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200
        ${on ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-outline-variant)]'}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
        ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function Row({
  icon, label, right, danger, onClick,
}: {
  icon: string; label: string; right?: React.ReactNode; danger?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 transition-colors
        active:bg-[var(--color-surface-container)] text-left"
    >
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined text-[22px] ${danger ? 'text-[var(--color-error)]' : 'text-[var(--color-primary)]'}`}>
          {icon}
        </span>
        <span className={`text-base ${danger ? 'text-[var(--color-error)]' : 'text-[var(--color-on-surface)]'}`}>
          {label}
        </span>
      </div>
      {right ?? <span className="material-symbols-outlined text-[var(--color-outline-variant)]">chevron_right</span>}
    </button>
  );
}

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { show, toastEl } = useToast();
  const [unit, setUnit] = useState('');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [expiryAlert, setExpiryAlert] = useState(true);
  const [penaltyAlert, setPenaltyAlert] = useState(true);
  const [largeFontMode, setLargeFontMode] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    const u = getAuthUnit();
    if (!u) { router.replace('/'); return; }
    setUnit(u);
    setLargeFontMode(document.documentElement.style.fontSize === '120%');
  }, [router]);

  function toggleLargeFont(on: boolean) {
    setLargeFontMode(on);
    document.documentElement.style.fontSize = on ? '120%' : '';
  }

  function handleLogout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      clearAuth();
      router.replace('/');
    }
  }

  const themeLabels: Record<ThemeMode, string> = {
    system: '시스템 설정',
    light: '라이트 모드',
    dark: '다크 모드',
  };

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {toastEl}
      <AppHeader showBack onBack={() => router.back()} />

      <main className="pt-20 pb-28 px-5 space-y-5">
        {/* Profile card */}
        <section className="bg-[var(--color-surface-container-lowest)] rounded-2xl p-4 shadow-sm
          border border-[var(--color-outline-variant)]/30 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-[var(--color-primary)] text-[28px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          </div>
          <div>
            <p className="font-bold text-[18px] text-[var(--color-on-surface)]">{unit}호 입주민</p>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">OO오피스텔</p>
          </div>
        </section>

        {/* Display */}
        <section>
          <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">화면 설정</p>
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
            <Row
              icon="dark_mode"
              label={`테마: ${themeLabels[theme as ThemeMode]}`}
              onClick={() => setShowThemePicker((v) => !v)}
            />
            {showThemePicker && (
              <div className="px-4 pb-3 pt-1 space-y-2 bg-[var(--color-surface-container-low)]">
                {(['system', 'light', 'dark'] as ThemeMode[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTheme(t); setShowThemePicker(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors
                      ${theme === t ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-surface-container-high)]'}`}
                  >
                    <span className={`text-sm ${theme === t ? 'text-[var(--color-primary)] font-semibold' : 'text-[var(--color-on-surface)]'}`}>
                      {themeLabels[t]}
                    </span>
                    {theme === t && (
                      <span className="material-symbols-outlined text-[var(--color-primary)] text-[18px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <Row
              icon="format_size"
              label="큰 글씨 모드"
              right={<Toggle on={largeFontMode} onChange={toggleLargeFont} />}
            />
          </div>
        </section>

        {/* Notifications */}
        <section>
          <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">알림</p>
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
            <Row
              icon="notifications_active"
              label="푸시 알림"
              right={<Toggle on={pushEnabled} onChange={setPushEnabled} />}
            />
            <Row
              icon="event"
              label="주차 만료 전 알림"
              right={<Toggle on={expiryAlert} onChange={setExpiryAlert} />}
            />
            <Row
              icon="report"
              label="벌점 알림"
              right={<Toggle on={penaltyAlert} onChange={setPenaltyAlert} />}
            />
          </div>
        </section>

        {/* Account */}
        <section>
          <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">계정</p>
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
            <Row icon="lock" label="비밀번호 변경" onClick={() => router.push('/change-password')} />
            <Link href="/penalties">
              <Row icon="warning" label="벌점 / 이의제기" />
            </Link>
            <Row icon="logout" label="로그아웃" danger onClick={handleLogout} />
          </div>
        </section>

        {/* Help */}
        <section>
          <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">지원</p>
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
            <Row icon="menu_book" label="사용자 가이드" onClick={() => show('준비 중입니다.', 'info')} />
            <Row icon="quiz" label="자주 묻는 질문" onClick={() => show('준비 중입니다.', 'info')} />
            <Row icon="support_agent" label="고객센터 문의" onClick={() => show('관리사무소: 010-XXXX-XXXX', 'info')} />
          </div>
        </section>

        {/* App info */}
        <div className="text-center py-4">
          <p className="text-xs text-[var(--color-outline)]">OO오피스텔 주차 v1.0.0</p>
          <p className="text-xs text-[var(--color-outline)] mt-0.5">© 2026 OO오피스텔</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
