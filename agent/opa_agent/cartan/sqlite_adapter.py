"""
시나리오 S1: Cartan DB가 SQLite인 경우 (가능성 95%)

현장 조사 결과가 오면 CARTAN_VISITOR_TABLE / CARTAN_PLATE_COL 등
환경변수를 설정해 컬럼명을 맞춰준다.
"""
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from .. import config as cfg
from .base import CartanAdapter, VisitorRecord

logger = logging.getLogger(__name__)


class CartanSqliteAdapter(CartanAdapter):
    scenario = "S1"

    def __init__(self, db_path: str, dry_run: bool = True):
        super().__init__(dry_run)
        self.db_path     = Path(db_path)
        self.tbl         = cfg.CARTAN_VISITOR_TABLE() or "Visitors"
        self.col_plate   = cfg.CARTAN_PLATE_COL()    or "PlateNo"
        self.col_unit    = cfg.CARTAN_UNIT_COL()     or "UnitNo"
        self.col_from    = cfg.CARTAN_VALID_FROM()   or "ValidFrom"
        self.col_until   = cfg.CARTAN_VALID_UNTIL()  or "ValidUntil"

    def _connect(self) -> sqlite3.Connection:
        # WAL 모드 + read-only URI 접근 (health_check, list)
        con = sqlite3.connect(
            f"file:{self.db_path}?mode=rwc",
            uri=True,
            timeout=5,
            check_same_thread=False,
        )
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA busy_timeout=3000")
        return con

    def health_check(self) -> bool:
        if not self.db_path.exists():
            logger.error("DB 파일 없음: %s", self.db_path)
            return False
        try:
            con = self._connect()
            tables = [r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()]
            con.close()
            if self.tbl in tables:
                logger.debug("Cartan DB OK — 테이블 %s 확인", self.tbl)
                return True
            logger.warning("테이블 %s 없음. 발견된 테이블: %s", self.tbl, tables)
            return False
        except Exception as e:
            logger.error("health_check 실패: %s", e)
            return False

    def add_visitor(self, record: VisitorRecord) -> bool:
        if self.dry_run:
            logger.info("[DRY_RUN] ADD %s %s %s~%s",
                        record.plate, record.unit,
                        record.valid_from.date(), record.valid_until.date())
            return True
        sql = (
            f'INSERT OR REPLACE INTO "{self.tbl}" '
            f'("{self.col_plate}", "{self.col_unit}", '
            f'"{self.col_from}", "{self.col_until}") '
            f'VALUES (?, ?, ?, ?)'
        )
        try:
            con = self._connect()
            con.execute(sql, (
                record.plate,
                record.unit,
                record.valid_from.strftime("%Y-%m-%d %H:%M:%S"),
                record.valid_until.strftime("%Y-%m-%d %H:%M:%S"),
            ))
            con.commit()
            con.close()
            logger.info("ADD OK: %s %s", record.plate, record.unit)
            return True
        except Exception as e:
            logger.error("add_visitor 실패: %s", e)
            return False

    def remove_visitor(self, plate: str, valid_date: str) -> bool:
        if self.dry_run:
            logger.info("[DRY_RUN] REMOVE %s %s", plate, valid_date)
            return True
        sql = (
            f'DELETE FROM "{self.tbl}" '
            f'WHERE "{self.col_plate}" = ? '
            f'AND DATE("{self.col_from}") = ?'
        )
        try:
            con = self._connect()
            con.execute(sql, (plate, valid_date))
            con.commit()
            con.close()
            logger.info("REMOVE OK: %s %s", plate, valid_date)
            return True
        except Exception as e:
            logger.error("remove_visitor 실패: %s", e)
            return False

    def list_visitors_since(self, since: datetime) -> list[VisitorRecord]:
        sql = (
            f'SELECT "{self.col_plate}", "{self.col_unit}", '
            f'"{self.col_from}", "{self.col_until}" '
            f'FROM "{self.tbl}" '
            f'WHERE "{self.col_from}" >= ? '
            f'ORDER BY "{self.col_from}" DESC LIMIT 200'
        )
        try:
            con = self._connect()
            rows = con.execute(sql, (since.strftime("%Y-%m-%d %H:%M:%S"),)).fetchall()
            con.close()
            result = []
            for r in rows:
                plate = str(r[0]).replace(" ", "").upper()
                result.append(VisitorRecord(
                    plate=plate,
                    plate_display=plate,
                    unit=str(r[1]),
                    valid_from=datetime.fromisoformat(str(r[2])),
                    valid_until=datetime.fromisoformat(str(r[3])),
                ))
            return result
        except Exception as e:
            logger.error("list_visitors_since 실패: %s", e)
            return []
