#!/usr/bin/env node
/**
 * OO오피스텔 주차 — 계정 시드 스크립트
 *
 * 실행 전 .env.local에 다음 변수가 있어야 합니다:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 실행:
 *   node --env-file=.env.local scripts/seed.mjs
 *
 * 멱등성 보장: 이미 존재하는 계정은 건너뜀
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음');
  console.error('   .env.local 파일을 확인하세요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 호수 목록 생성 ─────────────────────────────────────────
function getUnits() {
  const units = [];
  for (let floor = 2; floor <= 10; floor++) {
    for (let room = 1; room <= 5; room++) {
      const unit = `${floor}0${room}`;
      units.push(unit);
    }
  }
  return units;
}

// ── 계정 생성 ──────────────────────────────────────────────
async function createAccount(unit, role = 'resident', displayName = null) {
  const email    = `${unit}@officetel-parking.internal`;
  const password = unit;   // 초기 비밀번호 = 호수 (반드시 변경 필요)

  // 이미 존재하는지 확인
  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('unit_number', unit)
    .maybeSingle();

  if (existing) {
    process.stdout.write(`·`);
    return { skipped: true };
  }

  // Supabase Auth 계정 생성
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // 이메일 인증 건너뜀
  });

  if (authErr) {
    // 이미 존재하는 auth 사용자 → accounts만 insert
    if (!authErr.message.includes('already')) {
      console.error(`\n❌  auth 생성 실패 (${unit}): ${authErr.message}`);
      return { error: true };
    }
  }

  const userId = authData?.user?.id;
  if (!userId) return { error: true };

  // accounts 프로필 생성
  const { error: profileErr } = await supabase.from('accounts').insert({
    id: userId,
    unit_number: unit,
    display_name: displayName ?? `${unit}호 입주민`,
    role,
    must_change_password: true,
    penalty_points: 0,
    is_active: true,
  });

  if (profileErr && !profileErr.message.includes('duplicate')) {
    console.error(`\n❌  profile 생성 실패 (${unit}): ${profileErr.message}`);
    return { error: true };
  }

  process.stdout.write(role === 'admin' ? 'A' : '.');
  return { created: true, userId };
}

// ── 메인 ──────────────────────────────────────────────────
async function main() {
  console.log('OO오피스텔 주차 계정 시드 시작\n');

  // 관리자 계정
  const admins = [
    { unit: 'admin',   display: '관리자' },
    { unit: 'manager', display: '관리소장' },
  ];

  console.log('관리자 계정 생성:');
  for (const { unit, display } of admins) {
    const result = await createAccount(unit, 'admin', display);
    if (!result.skipped && !result.error) {
      const tmpPw = randomBytes(8).toString('hex');
      // 관리자는 보안을 위해 랜덤 초기 비밀번호
      await supabase.auth.admin.updateUserById(result.userId, { password: tmpPw });
      console.log(`\n  ✅  ${unit} → 초기 비밀번호: ${tmpPw}  (꼭 메모하세요!)`);
    } else if (result.skipped) {
      console.log(`\n  건너뜀 (이미 존재): ${unit}`);
    }
  }

  // 입주민 계정
  console.log('\n입주민 계정 생성 (. = 생성, · = 건너뜀):');
  const units   = getUnits();
  let created   = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const unit of units) {
    const result = await createAccount(unit, 'resident');
    if (result.created) created++;
    else if (result.skipped) skipped++;
    else failed++;
  }

  console.log(`\n\n결과:`);
  console.log(`  생성: ${created}개`);
  console.log(`  건너뜀: ${skipped}개 (이미 존재)`);
  console.log(`  실패: ${failed}개`);
  console.log(`  전체: ${units.length}세대 + 관리자 ${admins.length}명`);
  console.log('\n모든 입주민의 초기 비밀번호 = 호수 (예: 1001호 → 비밀번호 1001)');
  console.log('첫 로그인 시 비밀번호 변경이 강제됩니다.');
}

main().catch(console.error);
