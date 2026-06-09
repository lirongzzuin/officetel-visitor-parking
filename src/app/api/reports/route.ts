import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ok, err, normalizePlate, formatPlate, isNightKST, todayKST } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';
import { notifyReport } from '@/lib/telegram';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const supabase = createServiceClient();
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('reports')
    .select(`
      id, plate_display, memo, status, created_at,
      reporter:reporter_account_id(unit_number),
      target:target_account_id(unit_number)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // 일반 유저는 자기가 신고한 것만
  if (user.role !== 'admin') {
    query = query.eq('reporter_account_id', user.id);
  }

  const { data, error, count } = await query;
  if (error) return err('NOT_FOUND', '신고 내역을 불러올 수 없습니다', 500);

  type ReportRow = {
    id: string;
    plate_display: string;
    memo: string | null;
    status: string;
    created_at: string;
    reporter: unknown;
    target: unknown;
  };

  const reports = (data ?? [] as ReportRow[]).map((r: ReportRow) => ({
    id: r.id,
    plate_display: r.plate_display,
    memo: r.memo,
    status: r.status,
    created_at: r.created_at,
    reporter_unit: (r.reporter as { unit_number: string } | null)?.unit_number ?? null,
    target_unit: (r.target as { unit_number: string } | null)?.unit_number ?? null,
  }));

  return ok({ reports, total: count ?? 0 });
}

const PENALTY_BAN_THRESHOLD = parseInt(process.env.NEXT_PUBLIC_PENALTY_LIMIT ?? '10');
const PENALTY_BAN_DAYS = parseInt(process.env.NEXT_PUBLIC_PENALTY_BAN_DAYS ?? '30');

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return err('UNAUTHORIZED', '로그인이 필요합니다', 401);

  const demoMode = process.env.DEMO_MODE === 'true';
  if (user.role !== 'admin' && !demoMode && !isNightKST()) {
    return err('TIME_RESTRICTED', '신고는 오후 6시~오전 6시에만 가능합니다', 403);
  }

  // FormData(사진 포함) 또는 JSON 모두 수용
  const contentType = req.headers.get('content-type') ?? '';
  let plate: string;
  let memo: string | null = null;
  let photoBuffer: Buffer | null = null;
  let photoMimeType = 'image/jpeg';

  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData();
    plate = (fd.get('plate') as string) ?? '';
    memo = (fd.get('memo') as string) || null;
    const photoFile = fd.get('photo') as File | null;
    if (photoFile && photoFile.size > 0) {
      const ab = await photoFile.arrayBuffer();
      photoBuffer = Buffer.from(ab);
      photoMimeType = photoFile.type || 'image/jpeg';
    }
  } else {
    const body = await req.json();
    plate = body.plate ?? '';
    memo = body.memo ?? null;
  }

  if (!plate) return err('INVALID_PLATE', 'plate는 필수입니다', 400);

  const plateNorm = normalizePlate(plate);
  const plateDisp = formatPlate(plate);
  const today = todayKST();
  const supabase = createServiceClient();

  // 60분 내 동일 plate 중복 신고 방지
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: dupe } = await supabase
    .from('reports')
    .select('id')
    .eq('plate_normalized', plateNorm)
    .gte('created_at', oneHourAgo)
    .limit(1);

  if (dupe && dupe.length > 0) {
    return err('CONFLICT', '60분 내 동일 차량 중복 신고는 불가합니다', 409);
  }

  // 오늘 방문 등록 여부 확인
  const { data: visitor } = await supabase
    .from('visitor_registrations')
    .select('id, account_id, accounts(unit_number)')
    .eq('plate_normalized', plateNorm)
    .eq('valid_date', today)
    .eq('status', 'active')
    .limit(1);

  const targetReg = visitor?.[0] as {
    id: string;
    account_id: string;
    accounts: { unit_number: string } | null;
  } | undefined;

  // 사진 Supabase Storage 업로드
  let photoPath: string | null = null;
  if (photoBuffer) {
    const fileName = `${today}/${Date.now()}.jpg`;
    const { data: stored } = await supabase.storage
      .from('report-photos')
      .upload(fileName, photoBuffer, { contentType: photoMimeType, upsert: false });
    photoPath = stored?.path ?? null;
  }

  // 신고 저장
  const { data: report } = await supabase
    .from('reports')
    .insert({
      reporter_account_id: user.id,
      plate_normalized: plateNorm,
      plate_display: plateDisp,
      memo: memo ?? null,
      photo_path: photoPath,
      target_account_id: targetReg?.account_id ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (!targetReg) {
    // 미등록 차량 → 텔레그램 알림
    void notifyReport({
      plateDisp,
      kind: 'unknown',
      reporterUnit: user.unit,
      memo,
      photoBuffer,
    });
    return ok({ kind: 'unknown', report_id: report?.id });
  }

  // 방문 등록 차량 → 벌점 부과
  await supabase
    .from('penalty_history')
    .insert({
      account_id: targetReg.account_id,
      points: 1,
      type: 'penalty',
      reason: '방문 차량 야간 주차 민원',
      detail: `신고 차량: ${plateDisp} / 접수자: ${user.unit}호`,
      imposed_by: user.id,
      report_id: report?.id,
    });

  // 누적 벌점 갱신
  const { data: acc } = await supabase
    .from('accounts')
    .select('penalty_points')
    .eq('id', targetReg.account_id)
    .single();

  const newPoints = (acc?.penalty_points ?? 0) + 1;
  const banned = newPoints >= PENALTY_BAN_THRESHOLD;
  const bannedUntil = banned
    ? new Date(Date.now() + PENALTY_BAN_DAYS * 86400_000).toISOString()
    : null;

  await supabase
    .from('accounts')
    .update({ penalty_points: newPoints, ...(banned ? { banned_until: bannedUntil } : {}) })
    .eq('id', targetReg.account_id);

  // 방문 등록 차량 → 텔레그램 알림
  void notifyReport({
    plateDisp,
    kind: 'visitor',
    unit: targetReg.accounts?.unit_number,
    reporterUnit: user.unit,
    memo,
    penaltyTotal: newPoints,
    photoBuffer,
  });

  return ok({
    kind: 'visitor',
    unit: targetReg.accounts?.unit_number,
    penalty_added: 1,
    total_penalty: newPoints,
    banned,
    report_id: report?.id,
  }, 201);
}
