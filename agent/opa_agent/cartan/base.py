"""
Cartan 어댑터 추상 기반 — 현장 조사 결과에 따라 구현체 선택
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class VisitorRecord:
    plate: str              # 정규화된 차량번호 (공백 없음, 대문자)
    plate_display: str      # 표시용 (12가 3456)
    unit: str               # 호수 (예: 1001)
    valid_from: datetime    # KST
    valid_until: datetime   # KST
    external_id: str | None = None   # 우리 시스템 visitor_registration.id


class CartanAdapter(ABC):
    scenario: str = "?"
    dry_run: bool = True

    def __init__(self, dry_run: bool = True):
        self.dry_run = dry_run

    @abstractmethod
    def health_check(self) -> bool:
        """DB 연결 가능 여부 확인"""
        ...

    @abstractmethod
    def add_visitor(self, record: VisitorRecord) -> bool:
        """방문차량 등록. dry_run이면 실제 쓰기 없이 True 반환"""
        ...

    @abstractmethod
    def remove_visitor(self, plate: str, valid_date: str) -> bool:
        """방문차량 취소/삭제. dry_run이면 실제 삭제 없이 True 반환"""
        ...

    @abstractmethod
    def list_visitors_since(self, since: datetime) -> list[VisitorRecord]:
        """소장이 직접 등록한 차량 등 변경 사항 조회"""
        ...
