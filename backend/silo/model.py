from __future__ import annotations
from typing import Optional, Tuple, List
from pydantic import BaseModel

# Physical constants — match actual CSV encoding
AISLES: List[str] = ["10", "20", "30", "40"]
SIDES: List[str] = ["10", "20"]
X_RANGE: List[int] = list(range(1, 61))   # 01-60
Y_RANGE: List[int] = list(range(1, 9))    # 01-08
Z_VALUES: List[int] = [1, 2]

PALLET_SIZE = 12
MAX_ACTIVE_PALLETS = 8


def make_pos(aisle: str, side: str, x: int, y: int, z: int) -> str:
    """Build 10-digit position string."""
    return f"{aisle}{side}{x:02d}{y:02d}{z:02d}"


def parse_pos(pos: str) -> Tuple[str, str, int, int, int]:
    """Parse 10-digit position into (aisle, side, x, y, z)."""
    return pos[0:2], pos[2:4], int(pos[4:6]), int(pos[6:8]), int(pos[8:10])


def shuttle_key(aisle: str, y: int) -> str:
    return f"{aisle}_{y}"


class Position(BaseModel):
    aisle: str
    side: str
    x: int
    y: int
    z: int

    def to_string(self) -> str:
        return make_pos(self.aisle, self.side, self.x, self.y, self.z)

    @classmethod
    def from_string(cls, pos: str) -> "Position":
        a, s, x, y, z = parse_pos(pos)
        return cls(aisle=a, side=s, x=x, y=y, z=z)


class Box(BaseModel):
    code: str            # 20-digit string
    position: Optional[str] = None

    @property
    def source(self) -> str:
        return self.code[0:7]

    @property
    def destination(self) -> str:
        return self.code[7:15]

    @property
    def bulk(self) -> str:
        return self.code[15:20]


class Shuttle(BaseModel):
    aisle: str
    y_level: int
    current_x: int = 0
    is_busy: bool = False

    @property
    def key(self) -> str:
        return shuttle_key(self.aisle, self.y_level)


class Pallet(BaseModel):
    pallet_id: str
    destination: str
    boxes: List[str] = []
    is_complete: bool = False
    is_reserved: bool = True
    start_time: float = 0.0
    end_time: Optional[float] = None

    @property
    def count(self) -> int:
        return len(self.boxes)

    @property
    def is_full(self) -> bool:
        return len(self.boxes) >= PALLET_SIZE


class SimulationConfig(BaseModel):
    num_destinations: int = 20    # 20 | 40 | 80
    boxes_per_hour: int = 1000
    total_boxes: int = 500
