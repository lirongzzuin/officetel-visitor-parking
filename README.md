# 오피스텔 방문차량 관리 시스템 (officetel-visitor-parking)

> 입주민이 휴대폰으로 방문차량을 등록하면, 관리사무소 PC의 에이전트가 기존 주차관제 프로그램(Cartan800) DB에 자동으로 반영하는 시스템
> 기획 · 설계 · 개발 1인 · 2026.06 · 실제 오피스텔(80여 세대)에서 쓰려고 만든 시스템을 공개용으로 정리한 사본

`TypeScript` `Next.js 16 (App Router)` `React 19` `Tailwind CSS v4` `Supabase (Postgres · Auth · RLS · Storage)` `Vercel (Functions · Cron)` `Python 3.12` `pyodbc (MS Access)` `PyInstaller` `NSSM` `GitHub Actions` `Telegram Bot API`

> **공개용 정리 안내** — 건물명·배포 주소·Supabase 프로젝트·에이전트 토큰·세대 구성 등 실제 현장을 알아볼 수 있는 값은 이력 전체에서 예시 값(`OO오피스텔`, `your-app.vercel.app`, 예시 호수 `1001` 등)으로 바꿨고, 세션 인수인계 문서와 현장 조사 메모는 이력에서 뺐습니다. 이 저장소에는 릴리스·태그가 없습니다.

---

## 무엇을 해결하나

오피스텔 관리사무소는 주차관제 프로그램에 방문차량을 손으로 입력하고, 밤에는 등록되지 않은 차량을 확인할 방법이 마땅치 않습니다. 관리사무소 PC에는 외부에서 접근할 수 없고, 현장 방문도 몇 번 할 수 없는 조건이었습니다.

| 누가 | 무엇을 |
|---|---|
| 입주민 (웹앱) | 방문차량 등록·취소, 즐겨찾기 차량, 방문 이력, 공지/소식, 사용 가이드 |
| 입주민 (야간 18:00~06:00) | 차량번호로 등록 여부 조회, 미등록·위반 차량 사진 신고 |
| 시스템 | 방문 등록 차량이 신고되면 등록 세대에 벌점 부과, 누적 시 이용 제한, 이의제기 |
| 관리사무소 PC 에이전트 | 클라우드 등록 내역을 Cartan800 DB에 반영, 상태 보고, 원격 명령 수행, 자동 업데이트 |
| 관리자 | 세대 비밀번호 초기화, 시연용 데이터 생성, 텔레그램으로 신고·일일 통계 알림 |

방문 등록은 06:00~18:00에만, 조회·신고는 18:00~06:00에만 열리도록 정책을 코드로 강제합니다 (`DEMO_MODE`로 시연 시 해제).

## 아키텍처

```
 입주민 휴대폰 (Next.js PWA 화면)
        │ HTTPS (Supabase Auth 세션 토큰)
        ▼
 Vercel — Next.js Route Handlers (/api/*)          Vercel Cron → /api/cron/daily-stats
   ├─ auth · visitors · lookup · reports · disputes · favorites · posts
   ├─ admin (비밀번호 초기화 · 데모 데이터)
   └─ agent (heartbeat · sync-queue · ack · commands · command-ack · version · entry)
        │ service role                               │ 텔레그램 알림 (신고 · 통계)
        ▼
 Supabase Postgres (RLS, is_admin() SECURITY DEFINER)
   accounts · visitor_registrations · favorites · reports · penalty_history · disputes
   posts · settings · sync_queue · agent_commands · agent_heartbeats
        ▲
        │ HTTPS 폴링 (Authorization: Bearer AGENT_TOKEN) — 관리사무소 PC는 밖으로 나가는 연결만 사용
        │
 관리사무소 Windows PC — 에이전트 (Python → PyInstaller 32-bit EXE, NSSM 서비스)
   ├─ Heartbeat   60초: Cartan 연결 상태 · 처리 건수 · 오류 수 보고
   ├─ Sync        60초: sync_queue(add/remove_visitor) → Cartan DB 반영 → ack
   ├─ Commands    60초: restart · set_dry_run · dump_logs · reload_config
   └─ UpdateCheck 1시간: GitHub Releases 새 버전 → 교체 · 실패 시 롤백
        │ pyodbc (MS Access ODBC)
        ▼
 Cartan800 주차관제 DB (.mdb)
```

- 관리사무소 PC로 들어오는 연결 없이, 에이전트가 클라우드를 폴링하는 구조라 공유기·방화벽 설정이 필요 없습니다.
- 웹 API가 방문 등록을 저장하면서 `sync_queue`에 작업을 넣고, 에이전트가 가져가 처리한 뒤 결과를 `ack`합니다.

## 기술적으로 집중한 문제

**1. 구조를 모르는 남의 프로그램 DB에 안전하게 쓰기**
- 문제: Cartan800의 DB 형식·테이블 구조를 미리 알 수 없었고, 현장에 갈 수 있는 기회도 적었습니다.
- 해결: 먼저 진단 도구 `agent/diagnostic/probe.py`(PyInstaller EXE)를 만들어 현장에서 한 번 실행하면 레지스트리·설치 경로·DB 파일·ODBC 드라이버·테이블 구조를 보고서로 남기고, SQLite(S1)·Access(S2) 중 어떤 어댑터를 쓸지 추천하게 했습니다. 에이전트는 `CartanAdapter` 인터페이스 뒤에 시나리오별 구현을 두고(`factory.py`), 테이블·컬럼명은 `config.json`으로 받습니다.
- 결과: 보고서로 DB가 SQLite가 아니라 MS Access(.mdb)임을 확인하고 S2 어댑터(pyodbc)를 붙였습니다. Access ODBC 드라이버가 32-bit라 에이전트를 x86으로 빌드하고, 드라이버 이름 두 가지를 차례로 시도합니다.

**2. 운영 중인 관제 프로그램을 망가뜨리지 않기**
- 에이전트는 기본값이 `CARTAN_DRY_RUN=true`라서, 설치 직후에는 DB에 쓰지 않고 로그만 남깁니다. 연결 상태를 heartbeat로 확인한 뒤 원격 명령(`set_dry_run`)으로 해제합니다. `write_config`는 설정 파일을 덮어쓰지 않고 병합합니다.
- 등록 전에 같은 차량·같은 시간대 중복 여부를 확인하고, 모든 쿼리는 파라미터 바인딩을 씁니다.
- 비밀번호가 걸린 .mdb를 위해 인증 실패가 3번 쌓이면 1시간 동안 연결을 끊는 차단기(circuit breaker)와 시도 간 최소 30초 간격을 두어, 잘못된 설정으로 DB를 계속 두드리지 않게 했습니다.

**3. 현장에 다시 가지 않고 고치기 — 자동 업데이트와 롤백**
- `agent/**`가 바뀌면 GitHub Actions(windows-latest, Python x86)가 에이전트·진단 도구 EXE와 설치 패키지를 빌드해 Release로 올립니다.
- 에이전트는 1시간마다 최신 Release를 확인하고, 실행 중인 EXE는 스스로 바꿀 수 없으므로 배치 스크립트를 만들어 넘깁니다. 스크립트는 서비스를 멈추고 기존 EXE를 백업한 뒤 교체하고, 15초 안에 서비스가 RUNNING이 되지 않으면 백업으로 되돌립니다.
- 설치는 `install.bat` 하나로 NSSM 서비스 등록까지 끝나도록 했고, 관리사무소용 설치 안내문(`agent/installer/README_관리소장님께.txt`)을 함께 둡니다.

**4. 정책을 서버와 DB에서 지키기**
- 시간대 제한, 벌점 누적 시 이용 제한, 60분 안 같은 차량 중복 신고 금지, 같은 날 같은 차량 중복 등록 금지를 API에서 검사합니다.
- Supabase RLS로 입주민은 자기 데이터만, 관리자는 전체를 볼 수 있게 했고, 관리자 판별은 RLS 재귀를 피하려고 `is_admin()` SECURITY DEFINER 함수로 만들었습니다.
- 에이전트 API는 사용자 세션과 분리된 `AGENT_TOKEN`으로만 인증합니다.

**5. 입주민이 쓰기 쉬운 화면**
- 차량번호는 띄어쓰기·하이픈을 무시하고 비교하고(`normalizePlate`), 입력 중 `12가 3456` 형태로 자동 정리합니다.
- 다크 모드(SSR 깜빡임 방지 스크립트 포함), 큰 글씨, PWA viewport를 지원합니다.
- 계정은 세대(호수) 단위이고, 입주민은 첫 로그인 때 비밀번호를 바꿔야 다음 화면으로 넘어갑니다.

## 품질 / 테스트

- 자동화된 테스트는 없습니다.
- 에이전트 동작 확인은 dry-run 모드 로그와 heartbeat, 진단 도구 보고서로 했습니다.
- **현재 `main`은 그대로 빌드되지 않습니다.** `src/components/CalendarSheet.tsx`, `src/components/NotificationSheet.tsx`가 커밋되지 않아 `npm run build`·`tsc`가 모듈을 찾지 못합니다. ESLint 경고·오류도 남아 있습니다. (에이전트 Python 코드는 문법 검사 통과)

## 실행 방법

### 웹 (Next.js + Supabase)

```bash
npm install
cp .env.example .env.local        # Supabase URL·키, AGENT_TOKEN 등 입력
# Supabase SQL Editor에서 supabase/migrations/001~003 순서대로 실행
node --env-file=.env.local scripts/seed.mjs   # 관리자 2개 + 세대 계정 생성 (예시 구성)
npm run dev
```

Vercel에 배포하면 `vercel.json`의 Cron이 매일 `/api/cron/daily-stats`를 호출합니다 (`CRON_SECRET` 필요).

### 관리사무소 PC 에이전트 (Windows)

1. GitHub Actions `Build & Release Agent EXE`로 `officetel_agent.exe`와 설치 패키지를 빌드합니다.
2. 현장에서 `cartan_probe.exe`를 실행해 DB 경로·테이블·컬럼을 확인합니다.
3. `agent/installer/config.json.example`을 `config.json`으로 복사해 값을 채우고(`CARTAN_DRY_RUN`은 `true`로 시작), `install.bat`을 관리자 권한으로 실행합니다.
4. heartbeat에서 `cartan_ok`를 확인한 뒤 `agent_commands`에 `set_dry_run` 명령을 넣어 실제 반영을 켭니다.

개발 PC에서 직접 돌릴 때는 `cd agent && python -m opa_agent` (설정 위치: Windows가 아니면 `~/.officetel/`).

## 설정

| 위치 | 주요 값 |
|---|---|
| `.env.local` (웹) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AGENT_TOKEN`, `AGENT_VERSION`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, 정책 값(`NEXT_PUBLIC_DAILY_QUOTA` 등), `DEMO_MODE` |
| `config.json` (에이전트) | `CLOUD_API_BASE`, `AGENT_TOKEN`, `GITHUB_REPO`, `GITHUB_TOKEN`, `CARTAN_SCENARIO`, `CARTAN_DRY_RUN`, `CARTAN_DB_PATH`, `CARTAN_DB_PASSWORD`, 테이블·컬럼명, 폴링 주기 |

`.env.local`과 `config.json`은 저장소에 올리지 않습니다 (`.gitignore`에 포함).

## 폴더 구조

```
src/app/            화면(로그인·홈·등록·이력·조회·신고·벌점·소식·가이드·설정)과 /api 라우트
src/lib/            인증(auth.ts), Supabase 클라이언트, 차량번호 처리(plate.ts), 텔레그램
src/proxy.ts        로그인 여부에 따른 경로 보호 (Next.js 16 proxy)
supabase/migrations 스키마 · RLS · 정책
scripts/seed.mjs    계정 시드
agent/opa_agent/    관리 PC 에이전트 (메인 루프 · 설정 · 클라우드 통신 · 업데이트 · Cartan 어댑터)
agent/diagnostic/   현장 진단 도구 (probe.py / probe.ps1)
agent/installer/    install.bat · uninstall.bat · config.json.example · 설치 안내문
.github/workflows/  에이전트 · 진단 도구 빌드 및 Release
```

## 개발 방식

Claude Code와 함께 설계·구현했습니다 (커밋의 `Co-Authored-By` 참고).
