'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { useTheme } from '@/providers/ThemeProvider';
import { getAuthUnit, getAuthRole, clearAuth } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { apiFetch } from '@/lib/api-client';

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

interface ReportItem {
  id: string;
  plate_display: string;
  memo: string | null;
  status: string;
  created_at: string;
  reporter_unit: string | null;
  target_unit: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { show, toastEl } = useToast();
  const [unit, setUnit] = useState('');
  const [role, setRole] = useState('');
  const [largeFontMode, setLargeFontMode] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [demoLoading, setDemoLoading] = useState<'seed' | 'reset' | null>(null);
  const [demoUnit, setDemoUnit] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [pwResetUnit, setPwResetUnit] = useState('');
  const [pwResetLoading, setPwResetLoading] = useState(false);
  const [pwResetResult, setPwResetResult] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    const u = getAuthUnit();
    if (!u) { clearAuth(); router.replace('/'); return; }
    setUnit(u);
    setRole(getAuthRole() ?? '');
    setLargeFontMode(document.documentElement.style.fontSize === '120%');
  }, [router]);

  function toggleLargeFont(on: boolean) {
    setLargeFontMode(on);
    document.documentElement.style.fontSize = on ? '120%' : '';
  }

  async function confirmLogout() {
    setLogoutLoading(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 서버 오류와 무관하게 로컬 인증 정보 삭제
    }
    clearAuth();
    window.location.href = '/';
  }

  async function handleSeedDemo() {
    setDemoLoading('seed');
    try {
      const body = demoUnit.trim() ? { unit: demoUnit.trim() } : {};
      await apiFetch('/api/admin/seed-demo', { method: 'POST', body: JSON.stringify(body) });
      const target = demoUnit.trim() ? `${demoUnit.trim()}호` : '내 계정';
      show(`${target}에 데모 데이터가 준비되었습니다.`, 'success');
    } catch (e: unknown) {
      show((e as Error).message ?? '데모 데이터 초기화에 실패했습니다', 'error');
    } finally {
      setDemoLoading(null);
    }
  }

  async function handleResetDemo() {
    const target = demoUnit.trim() ? `${demoUnit.trim()}호` : '내 계정';
    if (!confirm(`${target}의 모든 방문등록, 즐겨찾기, 벌점 데이터가 삭제됩니다.\n계속하시겠습니까?`)) return;
    setDemoLoading('reset');
    try {
      const body = demoUnit.trim() ? { unit: demoUnit.trim() } : {};
      await apiFetch('/api/admin/reset-demo', { method: 'POST', body: JSON.stringify(body) });
      show(`${target} 데이터가 초기화되었습니다.`, 'success');
    } catch (e: unknown) {
      show((e as Error).message ?? '초기화에 실패했습니다', 'error');
    } finally {
      setDemoLoading(null);
    }
  }

  async function handlePasswordReset() {
    if (!pwResetUnit.trim()) {
      show('호수를 입력하세요', 'error');
      return;
    }
    setPwResetLoading(true);
    setPwResetResult(null);
    try {
      const data = await apiFetch('/api/admin/reset-unit-password', {
        method: 'POST',
        body: JSON.stringify({ unit: pwResetUnit.trim() }),
      });
      const newPw = (data as { new_password: string }).new_password;
      setPwResetResult(newPw);
      show(`${pwResetUnit}호 비밀번호가 초기화되었습니다`, 'success');
    } catch (e: unknown) {
      show((e as Error).message ?? '초기화에 실패했습니다', 'error');
    } finally {
      setPwResetLoading(false);
    }
  }

  async function loadReports() {
    setReportsLoading(true);
    try {
      const data = await apiFetch<{ reports: ReportItem[]; total: number }>('/api/reports');
      setReports(data.reports);
    } catch { /* ignore */ }
    finally { setReportsLoading(false); }
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
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
              OO오피스텔 {role === 'admin' && <span className="text-[var(--color-primary)] font-semibold ml-1">관리자</span>}
            </p>
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

        {/* Account */}
        <section>
          <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">계정</p>
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
            <Row icon="lock" label="비밀번호 변경" onClick={() => router.push('/change-password')} />
            <Link href="/penalties">
              <Row icon="warning" label="벌점 / 이의제기" />
            </Link>
            <Row
              icon="report"
              label="신고 내역"
              onClick={() => { setShowReports(true); loadReports(); }}
            />
            <Row icon="logout" label="로그아웃" danger onClick={() => setShowLogoutConfirm(true)} />
          </div>
        </section>

        {/* Account management — admin only */}
        {role === 'admin' && (
          <section>
            <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">계정 관리</p>
            <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
              <div className="p-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-[22px] text-[var(--color-primary)]">apartment</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="호수 입력 (예: 101, 1001)"
                  value={pwResetUnit}
                  onChange={(e) => { setPwResetUnit(e.target.value.replace(/\D/g, '')); setPwResetResult(null); }}
                  className="flex-1 text-sm text-[var(--color-on-surface)] bg-transparent outline-none
                    placeholder:text-[var(--color-outline)]"
                />
              </div>
              <button
                onClick={handlePasswordReset}
                disabled={pwResetLoading}
                className="w-full flex items-center justify-between p-4 active:bg-[var(--color-surface-container)] text-left disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[22px] text-[var(--color-primary)]">lock_reset</span>
                  <span className="text-base text-[var(--color-on-surface)]">비밀번호 초기화</span>
                </div>
                {pwResetLoading
                  ? <span className="w-5 h-5 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-[var(--color-outline-variant)]">chevron_right</span>}
              </button>
              {pwResetResult && (
                <div className="px-4 py-3 bg-[var(--color-success)]/8 flex items-center gap-3">
                  <span className="material-symbols-outlined text-[var(--color-success)] text-[20px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <div>
                    <p className="text-xs text-[var(--color-on-surface-variant)]">초기화된 비밀번호</p>
                    <p className="font-bold text-base text-[var(--color-on-surface)] tracking-widest">{pwResetResult}</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-outline)] mt-2 px-1">
              초기화 비밀번호: 호수 4자리 + 00 (101호 → 010100, 1001호 → 100100)
            </p>
          </section>
        )}

        {/* Demo management — admin only */}
        {role === 'admin' && (
          <section>
            <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">데모 관리</p>
            <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
              {/* Target unit input */}
              <div className="p-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-[22px] text-[var(--color-primary)]">apartment</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="대상 호수 입력 (예: 1001, 비우면 내 계정)"
                  value={demoUnit}
                  onChange={(e) => setDemoUnit(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 text-sm text-[var(--color-on-surface)] bg-transparent outline-none
                    placeholder:text-[var(--color-outline)]"
                />
              </div>
              <button
                onClick={handleSeedDemo}
                disabled={!!demoLoading}
                className="w-full flex items-center justify-between p-4 active:bg-[var(--color-surface-container)] text-left disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[22px] text-[var(--color-primary)]">dataset</span>
                  <span className="text-base text-[var(--color-on-surface)]">데모 데이터 채우기</span>
                </div>
                {demoLoading === 'seed'
                  ? <span className="w-5 h-5 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-[var(--color-outline-variant)]">chevron_right</span>}
              </button>
              <button
                onClick={handleResetDemo}
                disabled={!!demoLoading}
                className="w-full flex items-center justify-between p-4 active:bg-[var(--color-surface-container)] text-left disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[22px] text-[var(--color-error)]">delete_sweep</span>
                  <span className="text-base text-[var(--color-error)]">데이터 전체 초기화</span>
                </div>
                {demoLoading === 'reset'
                  ? <span className="w-5 h-5 border-2 border-[var(--color-error)]/30 border-t-[var(--color-error)] rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-[var(--color-outline-variant)]">chevron_right</span>}
              </button>
            </div>
            <p className="text-[11px] text-[var(--color-outline)] mt-2 px-1">
              호수를 입력하면 해당 계정에 데모 데이터(방문등록 7건·즐겨찾기 3개·벌점 이력)를 생성합니다.
            </p>
          </section>
        )}

        {/* Help */}
        <section>
          <p className="text-xs font-bold text-[var(--color-on-surface-variant)] mb-2 px-1">지원</p>
          <div className="bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-outline-variant)]/30 overflow-hidden divide-y divide-[var(--color-outline-variant)]/20">
            <Row icon="menu_book" label="사용자 가이드" onClick={() => router.push('/guide')} />
          </div>
        </section>

        {/* App info */}
        <div className="text-center py-4">
          <p className="text-xs text-[var(--color-outline)]">OO오피스텔 주차 v1.0.0</p>
          <p className="text-xs text-[var(--color-outline)] mt-0.5">© 2026 OO오피스텔</p>
        </div>
      </main>

      <BottomNav />

      {/* 신고 내역 시트 */}
      {showReports && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={() => setShowReports(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50
            bg-[var(--color-surface)] rounded-t-3xl shadow-2xl max-h-[85dvh] flex flex-col
            animate-[slideUp_0.25s_ease-out]">
            <div className="flex-none px-5 pt-4 pb-3 border-b border-[var(--color-outline-variant)]/20">
              <div className="w-10 h-1.5 bg-[var(--color-outline-variant)]/40 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] font-bold text-[var(--color-on-surface)]">신고 내역</h3>
                <button onClick={() => setShowReports(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full
                    bg-[var(--color-surface-container-high)] active:scale-90 transition-transform">
                  <span className="material-symbols-outlined text-[18px] text-[var(--color-on-surface-variant)]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {reportsLoading ? (
                <div className="flex justify-center py-12">
                  <span className="w-6 h-6 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                </div>
              ) : reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <span className="material-symbols-outlined text-[var(--color-outline)] text-[40px] mb-3">report_off</span>
                  <p className="text-sm text-[var(--color-on-surface-variant)]">신고 내역이 없습니다</p>
                </div>
              ) : (
                reports.map((r) => {
                  const statusLabel = r.status === 'resolved' ? '처리완료' : r.status === 'dismissed' ? '기각' : '접수됨';
                  const statusColor = r.status === 'resolved'
                    ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                    : r.status === 'dismissed'
                    ? 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                    : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]';
                  const d = new Date(r.created_at);
                  const dateStr = d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
                  const timeStr = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={r.id}
                      className="bg-[var(--color-surface-container-lowest)] rounded-2xl p-4
                        border border-[var(--color-outline-variant)]/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[16px] text-[var(--color-on-surface)] plate-mono">
                          {r.plate_display}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                      {r.memo && (
                        <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">{r.memo}</p>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-[var(--color-outline)]">
                        <span>
                          {role === 'admin' && r.reporter_unit ? `신고자: ${r.reporter_unit}호` : ''}
                          {role === 'admin' && r.target_unit ? `  →  ${r.target_unit}호` : ''}
                          {role !== 'admin' ? (r.target_unit ? `대상: ${r.target_unit}호` : '미등록 차량') : ''}
                        </span>
                        <span>{dateStr} {timeStr}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex-none px-5 pb-8 pt-3 border-t border-[var(--color-outline-variant)]/20">
              <button onClick={() => setShowReports(false)}
                className="w-full h-12 rounded-2xl bg-[var(--color-surface-container-high)]
                  text-[var(--color-on-surface-variant)] font-semibold active:scale-95 transition-transform">
                닫기
              </button>
            </div>
          </div>
        </>
      )}

      {/* 로그아웃 확인 시트 */}
      {showLogoutConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50
            bg-[var(--color-surface)] rounded-t-3xl shadow-2xl px-5 pt-6 pb-10
            animate-[slideUp_0.25s_ease-out]">
            <div className="flex justify-center mb-5">
              <div className="w-10 h-1 rounded-full bg-[var(--color-outline-variant)]" />
            </div>
            <div className="flex flex-col items-center gap-2 mb-7">
              <div className="w-14 h-14 rounded-full bg-[var(--color-error)]/10
                flex items-center justify-center mb-1">
                <span className="material-symbols-outlined text-[var(--color-error)] text-[28px]">logout</span>
              </div>
              <h4 className="text-[18px] font-bold text-[var(--color-on-surface)]">로그아웃</h4>
              <p className="text-sm text-[var(--color-on-surface-variant)] text-center">
                로그아웃 하시겠습니까?<br />다시 로그인하려면 비밀번호가 필요합니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                disabled={logoutLoading}
                className="flex-1 h-14 rounded-2xl bg-[var(--color-surface-container-high)]
                  text-[var(--color-on-surface-variant)] font-semibold active:scale-95 transition-transform disabled:opacity-60"
              >
                취소
              </button>
              <button
                onClick={confirmLogout}
                disabled={logoutLoading}
                className="flex-[1.5] h-14 rounded-2xl bg-[var(--color-error)] text-white font-bold
                  flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70"
              >
                {logoutLoading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : '로그아웃'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
