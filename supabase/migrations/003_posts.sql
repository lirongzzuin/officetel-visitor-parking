-- 게시글 테이블 (공지·일일통계)
CREATE TABLE IF NOT EXISTS posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT        NOT NULL DEFAULT 'notice'
                              CHECK (type IN ('daily_stats', 'notice', 'announcement')),
  title           TEXT        NOT NULL,
  body            TEXT,                          -- 3일 후 API가 null 반환
  stats_data      JSONB,                         -- 영구 보존 (숫자만)
  account_id      UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_expires_at TIMESTAMPTZ NOT NULL,          -- 이 시각 이후엔 body를 반환 안 함
  pinned          BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_type    ON posts(type, created_at DESC);
CREATE INDEX idx_posts_pinned  ON posts(pinned, created_at DESC);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 모든 로그인 유저가 읽기 가능
CREATE POLICY "posts_read"  ON posts FOR SELECT USING (auth.role() = 'authenticated');
-- 관리자만 쓰기/삭제
CREATE POLICY "posts_write" ON posts FOR ALL    USING (is_admin());
