const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

function nowKST(): string {
  return new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function line(label: string, value: string) {
  return `<b>${label}</b>  ${value}`;
}

export async function sendTelegramMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`${BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
  } catch {
    // ignore
  }
}

// ─── 입차 알림 ───────────────────────────────────────────────────────────────

export async function notifyEntry(plateDisp: string, unit: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const text = [
    '[입차]  <code>' + plateDisp + '</code>',
    '',
    line('세대', `${unit}호`),
    line('시각', nowKST()),
  ].join('\n');
  try {
    await fetch(`${BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error('[Telegram:entry]', e);
  }
}

// ─── 신고 알림 ───────────────────────────────────────────────────────────────

interface NotifyReportParams {
  plateDisp: string;
  kind: 'visitor' | 'unknown';
  unit?: string | null;
  reporterUnit: string;
  memo?: string | null;
  penaltyTotal?: number;
  photoBuffer?: Buffer | null;
}

function buildCaption(p: NotifyReportParams): string {
  const rows: string[] = [
    '[민원]  <code>' + p.plateDisp + '</code>',
    '',
    line('접수', nowKST()),
    line('신고자', `${p.reporterUnit}호`),
  ];

  if (p.kind === 'visitor') {
    rows.push(line('차량 상태', `방문 등록 차량 (${p.unit}호)`));
    rows.push(line('벌점', `${p.penaltyTotal ?? 1}점 누적`));
  } else {
    rows.push(line('차량 상태', '미등록 차량 — 관리자 확인 필요'));
  }

  if (p.memo) {
    rows.push('');
    rows.push(line('비고', p.memo));
  }

  rows.push('');
  rows.push('<i>주차 관리 목적으로 발송되는 알림입니다.</i>');

  return rows.join('\n');
}

export async function notifyReport(params: NotifyReportParams): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const caption = buildCaption(params);
  try {
    if (params.photoBuffer && params.photoBuffer.length > 0) {
      const form = new FormData();
      form.append('chat_id', CHAT_ID);
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      const blob = new Blob([params.photoBuffer as unknown as BlobPart], { type: 'image/jpeg' });
      form.append('photo', blob, 'report.jpg');
      const res = await fetch(`${BASE}/sendPhoto`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch(`${BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: caption, parse_mode: 'HTML' }),
      });
      if (!res.ok) throw new Error(await res.text());
    }
  } catch (e) {
    console.error('[Telegram:report]', e);
  }
}
