'use client';

export interface VisitorEntry {
  id: string;
  plate: string;
  nickname?: string;
  unit: string;
  date: string; // YYYY-MM-DD
  registeredAt: string;
  status: 'upcoming' | 'active' | 'expired' | 'cancelled';
}

export interface PenaltyEntry {
  id: string;
  date: string;
  type: 'penalty' | 'reduction' | 'expired';
  points: number; // positive = penalty, negative = reduction
  reason: string;
  detail?: string;
  disputeStatus?: 'none' | 'pending' | 'approved' | 'rejected';
}

export interface FavoriteVehicle {
  id: string;
  plate: string;
  nickname: string;
  emoji: string;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

const TODAY = today();
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];

// ------ Mock Data ------
export const MOCK_VISITORS: VisitorEntry[] = [
  {
    id: 'v1',
    plate: '12가3456',
    nickname: '부모님',
    unit: '1001',
    date: TODAY,
    registeredAt: `${TODAY}T08:30:00`,
    status: 'active',
  },
  {
    id: 'v2',
    plate: '78너1234',
    nickname: '동생',
    unit: '1001',
    date: TODAY,
    registeredAt: `${TODAY}T10:00:00`,
    status: 'active',
  },
  {
    id: 'v3',
    plate: '45마9012',
    nickname: '친구',
    unit: '1001',
    date: YESTERDAY,
    registeredAt: `${YESTERDAY}T14:00:00`,
    status: 'expired',
  },
  {
    id: 'v4',
    plate: '55자9981',
    nickname: '친구 모임',
    unit: '1001',
    date: YESTERDAY,
    registeredAt: `${YESTERDAY}T09:00:00`,
    status: 'expired',
  },
];

export const MOCK_PENALTIES: PenaltyEntry[] = [
  {
    id: 'p1',
    date: '2024-10-24',
    type: 'penalty',
    points: 2,
    reason: '등록 외 구역 주차',
    detail: 'B2층 402호 근처 소방시설물 근접 주차 민원 접수 및 현장 확인 완료',
    disputeStatus: 'none',
  },
  {
    id: 'p2',
    date: '2024-09-15',
    type: 'reduction',
    points: -2,
    reason: '벌점 자동 소멸',
    detail: '6개월 무사고 유지 보너스 벌점 감면 혜택 적용',
    disputeStatus: 'none',
  },
  {
    id: 'p3',
    date: '2024-08-02',
    type: 'penalty',
    points: 1,
    reason: '장기 미출차 알림',
    detail: '72시간 이상 동일 구역 방치 (규정 제 12조 위반)',
    disputeStatus: 'rejected',
  },
];

export const MOCK_FAVORITES: FavoriteVehicle[] = [
  { id: 'f1', plate: '78너1234', nickname: '동생', emoji: '👨‍👧' },
  { id: 'f2', plate: '45마9012', nickname: '부모님', emoji: '👪' },
  { id: 'f3', plate: '99하1234', nickname: '택배', emoji: '📦' },
];

// Quota info
export const DAILY_QUOTA = 10;

// Returns today's visitors for a given unit
export function getTodayVisitors(unit: string = '1001'): VisitorEntry[] {
  const today_ = today();
  return MOCK_VISITORS.filter((v) => v.unit === unit && v.date === today_);
}

// Current penalty score
export const CURRENT_PENALTY_SCORE = MOCK_PENALTIES.reduce((sum, p) => sum + p.points, 0);
export const MAX_PENALTY = 10;

// Auth helpers (localStorage-based for prototype)
export function getAuthUnit(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('officetel_unit');
}

export function setAuth(unit: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('officetel_unit', unit);
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('officetel_unit');
  localStorage.removeItem('officetel_pw_changed');
}

export function hasPwChanged(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('officetel_pw_changed') === 'true';
}

export function setPwChanged(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('officetel_pw_changed', 'true');
}

// Theme
export function getTheme(): 'light' | 'dark' | 'system' {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('officetel_theme') as 'light' | 'dark' | 'system') || 'system';
}

export function setTheme(theme: 'light' | 'dark' | 'system'): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('officetel_theme', theme);
}

// Night hours: 18:00 ~ 06:00 next day
export function isNightHours(): boolean {
  const h = new Date().getHours();
  return h >= 18 || h < 6;
}
