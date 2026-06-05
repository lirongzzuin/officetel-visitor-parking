"""
현장 조사 결과(CARTAN_SCENARIO)에 따라 적절한 어댑터 반환
"""
import logging
from .. import config as cfg
from .base import CartanAdapter
from .sqlite_adapter import CartanSqliteAdapter
from .access_adapter import CartanAccessAdapter

logger = logging.getLogger(__name__)


def get_adapter() -> CartanAdapter:
    scenario = cfg.CARTAN_SCENARIO()
    dry_run  = cfg.CARTAN_DRY_RUN()
    db_path  = cfg.CARTAN_DB_PATH()

    logger.info("Cartan 어댑터: %s  dry_run=%s", scenario, dry_run)

    if scenario == "S1":
        if not db_path:
            raise ValueError("CARTAN_DB_PATH 환경변수가 필요합니다 (S1 시나리오)")
        return CartanSqliteAdapter(db_path, dry_run=dry_run)

    if scenario == "S2":
        if not db_path:
            raise ValueError("CARTAN_DB_PATH 환경변수가 필요합니다 (S2 시나리오)")
        return CartanAccessAdapter(db_path, dry_run=dry_run)

    raise NotImplementedError(
        f"시나리오 {scenario}는 아직 구현되지 않았습니다."
    )
