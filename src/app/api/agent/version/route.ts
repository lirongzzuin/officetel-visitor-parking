import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api';
import { validateAgentToken } from '@/lib/auth';

// 현재 배포된 에이전트 최신 버전 — 에이전트 빌드 시 업데이트
const LATEST_AGENT_VERSION = process.env.AGENT_VERSION ?? '1.0.0';
const AGENT_DOWNLOAD_URL = `https://github.com/lirongzzuin/officetel-visitor-parking/releases/latest/download/officetel_agent.exe`;

export async function GET(req: NextRequest) {
  if (!validateAgentToken(req)) return err('AGENT_AUTH_FAILED', '에이전트 토큰 인증 실패', 401);

  return ok({ version: LATEST_AGENT_VERSION, download_url: AGENT_DOWNLOAD_URL });
}
