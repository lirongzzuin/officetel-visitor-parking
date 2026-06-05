-- ============================================================
-- OO오피스텔 주차 초기 스키마
-- Supabase SQL Editor 또는 CLI로 실행:
--   supabase db push  (또는 SQL Editor에 붙여넣기)
-- ============================================================

-- 확장
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 계정 프로필 (auth.users 를 1:1 확장) ──────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_number   VARCHAR(10)  UNIQUE NOT NULL,   -- "201" ~ "1005"
  display_name  VARCHAR(100),
  role          TEXT         NOT NULL DEFAULT 'resident'
                             CHECK (role IN ('resident','admin')),
  penalty_points INTEGER     NOT NULL DEFAULT 0,
  banned_until  TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 방문차량 등록 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visitor_registrations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id),
  plate_normalized VARCHAR(20) NOT NULL,   -- 공백·하이픈 제거, 대문자
  plate_display    VARCHAR(20) NOT NULL,   -- 표시용 (12가 3456)
  nickname         VARCHAR(50),
  valid_date       DATE        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','cancelled','expired')),
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at     TIMESTAMPTZ,
  -- 같은 날 같은 차량 중복 방지
  UNIQUE (plate_normalized, valid_date)
);

CREATE INDEX idx_vr_account_date ON visitor_registrations(account_id, valid_date);
CREATE INDEX idx_vr_plate_date   ON visitor_registrations(plate_normalized, valid_date);

-- ── 즐겨찾기 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favorites (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id),
  plate_normalized VARCHAR(20) NOT NULL,
  plate_display    VARCHAR(20) NOT NULL,
  nickname         VARCHAR(50) NOT NULL,
  emoji            VARCHAR(10) DEFAULT '🚗',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, plate_normalized)
);

-- ── 신고 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_account_id  UUID        NOT NULL REFERENCES accounts(id),
  plate_normalized     VARCHAR(20) NOT NULL,
  plate_display        VARCHAR(20) NOT NULL,
  memo                 TEXT,
  photo_path           TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','resolved','dismissed')),
  target_account_id    UUID        REFERENCES accounts(id),  -- 벌점 귀속 세대
  resolution_note      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ
);

CREATE INDEX idx_reports_plate ON reports(plate_normalized, created_at);

-- 60분 내 같은 plate 중복 신고 방지 (서비스 레이어에서 추가 검증)
CREATE UNIQUE INDEX idx_reports_dedup
  ON reports(plate_normalized, (DATE_TRUNC('hour', created_at)))
  WHERE status = 'pending';

-- ── 벌점 이력 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penalty_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES accounts(id),
  points        INTEGER     NOT NULL,   -- 양수=부과, 음수=감면
  type          TEXT        NOT NULL CHECK (type IN ('penalty','reduction','expired')),
  reason        VARCHAR(200) NOT NULL,
  detail        TEXT,
  imposed_by    UUID        REFERENCES accounts(id),
  report_id     UUID        REFERENCES reports(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 이의제기 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disputes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  penalty_history_id  UUID        NOT NULL REFERENCES penalty_history(id),
  account_id          UUID        NOT NULL REFERENCES accounts(id),
  reason              VARCHAR(500) NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','approved','rejected')),
  admin_note          TEXT,
  resolved_by         UUID        REFERENCES accounts(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

-- ── 운영 설정 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO settings VALUES
  ('daily_visitor_quota',   '10',  '세대당 하루 방문차량 최대 등록 수',       NOW()),
  ('penalty_ban_threshold', '10',  '벌점 이용 제한 기준 (이상 시 정지)',       NOW()),
  ('penalty_ban_days',      '30',  '벌점 초과 정지 기간 (일)',                NOW()),
  ('visitor_start_hour',    '6',   '방문차량 허용 시작 시각 (24h)',            NOW()),
  ('visitor_end_hour',      '18',  '방문차량 허용 종료 시각 (24h)',            NOW()),
  ('night_start_hour',      '18',  '야간 모드 시작 시각 (조회/신고 활성화)',   NOW())
ON CONFLICT (key) DO NOTHING;

-- ── 에이전트 heartbeat (Cartan 연동 후 사용) ──────────────
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_version        VARCHAR(50),
  cartan_ok            BOOLEAN,
  camera_ok            BOOLEAN,
  last_sync_success    TIMESTAMPTZ,
  queue_processed      INTEGER     DEFAULT 0,
  error_count          INTEGER     DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 에이전트 원격 명령 큐 ────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_commands (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cmd          TEXT        NOT NULL,   -- 'update' | 'restart' | 'set_dry_run' | 'dump_logs' | 'reload_config'
  params       JSONB,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','done','failed')),
  result       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ── Cartan 동기화 큐 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT        NOT NULL,   -- 'add_visitor' | 'remove_visitor'
  payload      JSONB       NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','processing','done','failed')),
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════════
-- RLS (Row Level Security)
-- ════════════════════════════════════════════════════════════

ALTER TABLE accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalty_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_heartbeats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_commands        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue            ENABLE ROW LEVEL SECURITY;

-- 관리자 판별 함수 (RLS 내부에서 재귀 방지 SECURITY DEFINER)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounts WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- accounts: 본인만 조회, 관리자 전체
CREATE POLICY "accounts_self"  ON accounts FOR SELECT USING (id = auth.uid());
CREATE POLICY "accounts_admin" ON accounts FOR ALL    USING (is_admin());
CREATE POLICY "accounts_update_self" ON accounts FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    role = (SELECT role FROM accounts WHERE id = auth.uid())  -- role 변경 불가
  );

-- visitor_registrations
CREATE POLICY "vr_own"   ON visitor_registrations FOR SELECT USING (account_id = auth.uid());
CREATE POLICY "vr_ins"   ON visitor_registrations FOR INSERT WITH CHECK (account_id = auth.uid());
CREATE POLICY "vr_upd"   ON visitor_registrations FOR UPDATE USING (account_id = auth.uid());
CREATE POLICY "vr_admin" ON visitor_registrations FOR ALL    USING (is_admin());

-- favorites
CREATE POLICY "fav_own"   ON favorites FOR ALL USING (account_id = auth.uid());
CREATE POLICY "fav_admin" ON favorites FOR ALL USING (is_admin());

-- reports: 자신이 신고한 것만, 관리자 전체
CREATE POLICY "rep_own"   ON reports FOR SELECT USING (reporter_account_id = auth.uid());
CREATE POLICY "rep_ins"   ON reports FOR INSERT WITH CHECK (reporter_account_id = auth.uid());
CREATE POLICY "rep_admin" ON reports FOR ALL    USING (is_admin());

-- penalty_history: 본인 것만
CREATE POLICY "ph_own"   ON penalty_history FOR SELECT USING (account_id = auth.uid());
CREATE POLICY "ph_admin" ON penalty_history FOR ALL    USING (is_admin());

-- disputes: 본인 것만
CREATE POLICY "dis_own"   ON disputes FOR SELECT USING (account_id = auth.uid());
CREATE POLICY "dis_ins"   ON disputes FOR INSERT WITH CHECK (account_id = auth.uid());
CREATE POLICY "dis_admin" ON disputes FOR ALL    USING (is_admin());

-- settings: 모두 읽기, 관리자만 쓰기
CREATE POLICY "set_read"  ON settings FOR SELECT USING (true);
CREATE POLICY "set_admin" ON settings FOR ALL    USING (is_admin());

-- agent_heartbeats / sync_queue / agent_commands: 관리자만
CREATE POLICY "hb_admin" ON agent_heartbeats FOR ALL USING (is_admin());
CREATE POLICY "ac_admin" ON agent_commands   FOR ALL USING (is_admin());
CREATE POLICY "sq_admin" ON sync_queue       FOR ALL USING (is_admin());
