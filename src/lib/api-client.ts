'use client';

/** 클라이언트용 fetch 래퍼 — Bearer 토큰 자동 첨부 */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit & { skipAuth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (!options?.skipAuth) {
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('officetel_token')
      : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = json.message ?? `요청 실패 (${res.status})`;
    const err = new Error(msg) as Error & { code?: string; status?: number };
    err.code = json.code;
    err.status = res.status;
    throw err;
  }

  return (json.data ?? json) as T;
}
