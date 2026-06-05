"""
시나리오 S2: Cartan DB가 Microsoft Access (.mdb) 형식인 경우

현장 조사 결과:
  경로: C:\Program Files (x86)\TANTANCore\CARTAN800\bin\ANPRDATA.mdb
  드라이버: Microsoft Access Driver (*.mdb, *.accdb)
  (Windows에 Office 또는 Access Database Engine이 설치된 경우 사용 가능)
"""
import logging
from datetime import datetime
from pathlib import Path

from .. import config as cfg
from .base import CartanAdapter, VisitorRecord

logger = logging.getLogger(__name__)


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

    _DRIVERS = [
        "Microsoft Access Driver (*.mdb, *.accdb)",
        "Microsoft Access Driver (*.mdb)",
    ]

    def _connect(self):
        try:
            import pyodbc
        except ImportError:
            raise RuntimeError(
                "pyodbc 모듈이 없습니다. "
                "에이전트 EXE는 PyInstaller로 pyodbc를 포함해야 합니다."
            )
        last_err: Exception = RuntimeError("ODBC 드라이버 없음")
        for drv in self._DRIVERS:
            try:
                cs = f"DRIVER={{{drv}}};DBQ={self.db_path};"
                return pyodbc.connect(cs, autocommit=False)
            except Exception as e:
                last_err = e
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
