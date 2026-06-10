"""
시나리오 S2: Cartan DB가 Microsoft Access (.mdb) 형식인 경우

현장 조사 결과:
  경로: C:\Program Files (x86)\TANTANCore\CARTAN800\bin\ANPRDATA.mdb
  드라이버: Microsoft Access Driver (*.mdb, *.accdb)
  (Windows에 Office 또는 Access Database Engine이 설치된 경우 사용 가능)

안전 장치 (Circuit Breaker):
  - 인증 오류(WRONG_PASSWORD) 연속 N회 → 자동 차단 (수동 해제 전까지 시도 안 함)
  - 무한 비밀번호 시도로 시스템 부하/락아웃 위험 차단
  - 인증 외 오류(파일 잠금 등)는 차단 카운터에 포함 안 됨
"""
import logging
import threading
import time
from datetime import datetime
from pathlib import Path

from .. import config as cfg
from .base import CartanAdapter, VisitorRecord

logger = logging.getLogger(__name__)

# Circuit breaker — 모듈 전역 (싱글톤 어댑터 가정)
_AUTH_FAIL_LIMIT     = 3       # 인증 실패 N회 → 차단
_BREAKER_RESET_SEC   = 3600    # 1시간 후 자동 해제 (config 갱신 시간 확보)
_MIN_RETRY_INTERVAL  = 30      # 다음 시도까지 최소 30초 — 빠른 폴링으로 인한 부하 차단


class CartanAccessAdapter(CartanAdapter):
    scenario = "S2"

    def __init__(self, db_path: str, dry_run: bool = True):
        super().__init__(dry_run)
        self.db_path   = db_path
        self.tbl       = cfg.CARTAN_VISITOR_TABLE() or "tVisitor"
        self.col_plate = cfg.CARTAN_PLATE_COL()     or "carno"
        self.col_unit  = cfg.CARTAN_UNIT_COL()      or "dong"
        self.col_from  = cfg.CARTAN_VALID_FROM()    or "intime"
        self.col_until = cfg.CARTAN_VALID_UNTIL()   or "outtime"
        # Circuit breaker 상태
        self._auth_fail_count = 0
        self._breaker_open_until: float = 0.0
        self._last_attempt_at: float = 0.0
        self._lock = threading.Lock()
        self._cached_password = cfg.CARTAN_DB_PASSWORD()

    _DRIVERS = [
        "Microsoft Access Driver (*.mdb, *.accdb)",
        "Microsoft Access Driver (*.mdb)",
    ]

    def _is_auth_error(self, err: Exception) -> bool:
        """비밀번호 관련 오류인지 판정 (한/영 메시지 모두 커버)"""
        msg = str(err).lower()
        return any(kw in msg for kw in [
            "password", "not a valid password", "permission denied",
            "비밀번호", "암호", "권한",
        ])

    def _breaker_open(self) -> bool:
        """현재 차단 상태인지"""
        now = time.time()
        if self._breaker_open_until > now:
            return True
        # 시간 지났으면 자동 해제 + 카운터 리셋
        if self._breaker_open_until and self._breaker_open_until <= now:
            logger.info("Circuit breaker 자동 해제 (1시간 경과)")
            self._breaker_open_until = 0.0
            self._auth_fail_count = 0
        return False

    def _enforce_min_interval(self) -> None:
        """직전 시도로부터 최소 간격 강제"""
        now = time.time()
        wait = (self._last_attempt_at + _MIN_RETRY_INTERVAL) - now
        if wait > 0:
            time.sleep(wait)
        self._last_attempt_at = time.time()

    def _connect(self):
        """
        Circuit breaker + rate limit이 적용된 안전한 연결.
        - 차단 상태면 즉시 raise (재시도 안 함)
        - 인증 오류 누적 시 자동 차단
        """
        with self._lock:
            if self._breaker_open():
                remaining = int(self._breaker_open_until - time.time())
                raise RuntimeError(
                    f"Cartan DB 연결 차단됨 (인증 실패 {_AUTH_FAIL_LIMIT}회 누적). "
                    f"{remaining // 60}분 후 자동 재시도. "
                    f"config.json 의 CARTAN_DB_PASSWORD 확인 필요."
                )

            self._enforce_min_interval()

            try:
                import pyodbc
            except ImportError:
                raise RuntimeError(
                    "pyodbc 모듈이 없습니다. "
                    "에이전트 EXE는 PyInstaller로 pyodbc를 포함해야 합니다."
                )

            password = self._cached_password
            pwd_part = f"PWD={password};" if password else ""
            last_err: Exception = RuntimeError("ODBC 드라이버 없음")

            for drv in self._DRIVERS:
                try:
                    cs = f"DRIVER={{{drv}}};DBQ={self.db_path};{pwd_part}"
                    conn = pyodbc.connect(cs, autocommit=False)
                    # 성공 시 인증 카운터 리셋
                    if self._auth_fail_count > 0:
                        logger.info("Cartan DB 연결 성공 — 인증 카운터 리셋")
                        self._auth_fail_count = 0
                    return conn
                except Exception as e:
                    last_err = e
                    # 인증 오류면 카운트 증가, 다른 오류는 카운트 안 함
                    if self._is_auth_error(e):
                        self._auth_fail_count += 1
                        logger.warning(
                            "Cartan DB 인증 실패 [%d/%d]: %s",
                            self._auth_fail_count, _AUTH_FAIL_LIMIT, e,
                        )
                        # 다음 드라이버 시도해도 같은 비밀번호니까 다 똑같이 실패 — break
                        break

            # 인증 실패 누적 → 차단
            if self._auth_fail_count >= _AUTH_FAIL_LIMIT:
                self._breaker_open_until = time.time() + _BREAKER_RESET_SEC
                logger.error(
                    "Cartan DB 연결 자동 차단 — 인증 실패 %d회 누적. %d분간 시도 안 함.",
                    self._auth_fail_count, _BREAKER_RESET_SEC // 60,
                )

            raise last_err

    def health_check(self) -> bool:
        if not Path(self.db_path).exists():
            logger.error("DB 파일 없음: %s", self.db_path)
            return False
        try:
            conn = self._connect()
            cursor = conn.cursor()
            tables = [row.table_name for row in cursor.tables(tableType="TABLE")]
            conn.close()
            if self.tbl in tables:
                logger.debug("Cartan Access DB OK — 테이블 %s 확인", self.tbl)
                return True
            logger.warning("테이블 %s 없음. 발견된 테이블: %s", self.tbl, tables[:10])
            return False
        except Exception as e:
            logger.error("health_check 실패: %s", e)
            return False

    def add_visitor(self, record: VisitorRecord) -> bool:
        if self.dry_run:
            logger.info("[DRY_RUN] ADD %s %s %s~%s",
                        record.plate, record.unit,
                        record.valid_from, record.valid_until)
            return True
        try:
            conn = self._connect()
            cursor = conn.cursor()
            # 중복 체크
            cursor.execute(
                f"SELECT COUNT(*) FROM [{self.tbl}] "
                f"WHERE [{self.col_plate}]=? AND [{self.col_from}]>=? AND [{self.col_from}]<?",
                record.plate, record.valid_from, record.valid_until,
            )
            if cursor.fetchone()[0] > 0:
                conn.close()
                logger.info("이미 등록됨: %s", record.plate)
                return True
            cursor.execute(
                f"INSERT INTO [{self.tbl}] "
                f"([{self.col_plate}],[{self.col_unit}],[{self.col_from}],[{self.col_until}]) "
                f"VALUES (?,?,?,?)",
                record.plate, record.unit, record.valid_from, record.valid_until,
            )
            conn.commit()
            conn.close()
            logger.info("ADD OK: %s %s", record.plate, record.unit)
            return True
        except Exception as e:
            logger.error("add_visitor 실패: %s", e)
            return False

    def remove_visitor(self, plate: str, valid_date: str) -> bool:
        if self.dry_run:
            logger.info("[DRY_RUN] REMOVE %s %s", plate, valid_date)
            return True
        try:
            conn = self._connect()
            cursor = conn.cursor()
            d = datetime.strptime(valid_date, "%Y-%m-%d")
            d_end = d.replace(hour=23, minute=59, second=59)
            cursor.execute(
                f"DELETE FROM [{self.tbl}] "
                f"WHERE [{self.col_plate}]=? AND [{self.col_from}]>=? AND [{self.col_from}]<=?",
                plate, d, d_end,
            )
            conn.commit()
            conn.close()
            logger.info("REMOVE OK: %s %s", plate, valid_date)
            return True
        except Exception as e:
            logger.error("remove_visitor 실패: %s", e)
            return False

    def list_visitors_since(self, since: datetime) -> list[VisitorRecord]:
        try:
            conn = self._connect()
            cursor = conn.cursor()
            cursor.execute(
                f"SELECT [{self.col_plate}],[{self.col_unit}],[{self.col_from}],[{self.col_until}] "
                f"FROM [{self.tbl}] WHERE [{self.col_from}]>=? ORDER BY [{self.col_from}] DESC",
                since,
            )
            rows = cursor.fetchmany(200)
            conn.close()
            result = []
            for r in rows:
                plate = str(r[0]).replace(" ", "").upper()
                vf = r[2] if isinstance(r[2], datetime) else datetime.fromisoformat(str(r[2]))
                vu = r[3] if isinstance(r[3], datetime) else datetime.fromisoformat(str(r[3]))
                result.append(VisitorRecord(
                    plate=plate, plate_display=plate,
                    unit=str(r[1]), valid_from=vf, valid_until=vu,
                ))
            return result
        except Exception as e:
            logger.error("list_visitors_since 실패: %s", e)
            return []
