/**
 * 공통 API 유틸리티
 */
import { NextResponse } from 'next/server';

export type ApiError =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'BANNED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'TIME_RESTRICTED'
  | 'INVALID_PLATE'
  | 'AGENT_AUTH_FAILED';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function err(code: ApiError, message: string, status: number) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/** 한국 차량번호 정규화 */
export function normalizePlate(raw: string): string {
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

/** 한국 차량번호 표시 포맷 */
export function formatPlate(raw: string): string {
  const n = normalizePlate(raw);
  const m = n.match(/^(\d{2,3})([가-힣])(\d{4})$/);
  return m ? `${m[1]}${m[2]} ${m[3]}` : n;
}

/** 유효한 한국 차량번호인지 검사 */
export function isValidPlate(raw: string): boolean {
  const n = normalizePlate(raw);
  // 신형: 12가3456 / 123가4567
  // 구형은 일단 통과
  return /^(\d{2,3}[가-힣]\d{4}|\d{3,4}[가-힣]\d{4})$/.test(n) || n.length >= 5;
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 현재 KST 시간이 야간(18:00~06:00)인지 */
export function isNightKST(): boolean {
  const h = new Date(Date.now() + 9 * 3600_000).getUTCHours();
  return h >= 18 || h < 6;
}
