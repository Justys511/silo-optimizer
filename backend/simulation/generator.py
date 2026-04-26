"""
Simulation engine.

Three independent instances (smart / naive / optimal) all receive the same
deterministic box stream so comparisons are fair.

Box arrival rate: 1 000 boxes / hour = 1 box every 3.6 simulated seconds.
"""

from __future__ import annotations

import csv as csv_module
import math
import random
import uuid
from collections import defaultdict
from decimal import Decimal
from typing import Dict, List, Optional

from silo.model import (
    AISLES, SIDES, Y_RANGE, X_RANGE,
    make_pos, parse_pos, shuttle_key,
    PALLET_SIZE, MAX_ACTIVE_PALLETS,
)
from silo.input_algo import place_box_smart, place_box_naive
from silo.output_algo import (
    retrieve_boxes_smart, retrieve_boxes_naive,
    select_active_destinations, naive_select_destinations,
)
from silo.optimal_algo import (
    place_box_optimal, EMATracker,
    retrieve_boxes_hungarian, select_active_pallets_ema,
)

BOXES_PER_HOUR = 1_000
SECONDS_PER_BOX = 3600 / BOXES_PER_HOUR  # 3.6 s


# ── helpers ───────────────────────────────────────────────────────────────────

def make_destination_pool(n: int, seed: int = 42) -> List[str]:
    rng = random.Random(seed)
    pool: set = set()
    while len(pool) < n:
        pool.add(f"{rng.randint(10_000_000, 99_999_999):08d}")
    return list(pool)


def _gen_box(dest: str, rng: random.Random) -> str:
    src  = "".join(str(rng.randint(0, 9)) for _ in range(7))
    bulk = "".join(str(rng.randint(0, 9)) for _ in range(5))
    return f"{src}{dest}{bulk}"


def _build_empty_grid() -> Dict[str, Optional[str]]:
    g: Dict[str, Optional[str]] = {}
    for a in AISLES:
        for s in SIDES:
            for x in X_RANGE:
                for y in Y_RANGE:
                    for z in (1, 2):
                        g[make_pos(a, s, x, y, z)] = None
    return g


def _parse_csv_pos(raw: str) -> str:
    """Convert either 10-digit or 11-digit CSV position to internal 10-digit format.

    Old CSV (10 digits): aisle(2) side(2) x(2) y(2) z(2)  e.g. 1010010101
    New CSV (11 digits): aisle(2) side(2) x(3) y(2) z(2)  e.g. 01010010101
      where aisle encodes as 01→10, 02→20, 03→30, 04→40
      and   side  encodes as 01→10, 02→20
    """
    if len(raw) == 10:
        return raw
    # 11-digit new format
    aisle_num = int(raw[0:2])   # 01-04
    side_num  = int(raw[2:4])   # 01-02
    x         = int(raw[4:7])   # 001-060
    y         = int(raw[7:9])   # 01-08
    z         = int(raw[9:11])  # 01-02
    return make_pos(f"{aisle_num * 10:02d}", f"{side_num * 10:02d}", x, y, z)


def load_csv_state(
    csv_path: str,
    grid: Dict[str, Optional[str]],
    dest_pool: List[str],
    seed: int = 0,
) -> int:
    rng = random.Random(seed)
    count = 0
    with open(csv_path, "r") as f:
        for row in csv_module.DictReader(f):
            pos   = _parse_csv_pos(row["posicion"].strip())
            label = row["etiqueta"].strip()
            if label and pos in grid:
                raw  = str(int(Decimal(label))).zfill(20)
                dest = rng.choice(dest_pool)
                grid[pos] = raw[:7] + dest + raw[15:]
                count += 1
    return count


# ── engine ────────────────────────────────────────────────────────────────────

class SimulationEngine:
    """
    mode = "smart"   → smart placement + smart retrieval + top-N pallet selection
    mode = "naive"   → linear placement + linear retrieval + FIFO pallet selection
    mode = "optimal" → hot/cold placement + Hungarian retrieval + EMA pallet selection
    """

    def __init__(self, mode: str = "smart"):
        self.mode = mode
        # legacy alias
        self.use_smart = (mode == "smart")
        self._reset_state()

    def _reset_state(self) -> None:
        self.grid:               Dict[str, Optional[str]] = {}
        self.shuttles:           Dict[str, int]            = {}
        self.active_pallets:     Dict[str, List[str]]      = {}
        self.completed_pallets:  List[Dict]                = []
        self.destinations:       List[str]                 = []
        self.dest_index:         Dict[str, int]            = {}
        self.total_input_time:   float = 0.0
        self.total_output_time:  float = 0.0
        self.boxes_placed:       int   = 0
        self.boxes_arrived:      int   = 0
        self.boxes_retrieved:    int   = 0
        self.is_loaded:          bool  = False
        self.is_running:         bool  = False
        self._box_seq:           List[str] = []
        self._seq_idx:           int   = 0
        self._csv_path:          str   = ""
        self._current_occupied:  int   = 0
        self._peak_occupied:     int   = 0
        # optimal-mode extras
        self.ema = EMATracker(alpha=0.3) if self.mode == "optimal" else None

    def reset(self) -> None:
        self._reset_state()

    # ── initialization ────────────────────────────────────────────────────────

    def initialize(
        self,
        num_destinations: int = 20,
        total_boxes: int = 500,
        csv_path: str = "",
        box_seq: Optional[List[str]] = None,
    ) -> None:
        self.reset()
        self._csv_path   = csv_path
        self.destinations = make_destination_pool(num_destinations)
        self.dest_index   = {d: i for i, d in enumerate(self.destinations)}

        for a in AISLES:
            for y in Y_RANGE:
                self.shuttles[shuttle_key(a, y)] = 0

        self.grid = _build_empty_grid()
        if csv_path:
            load_csv_state(csv_path, self.grid, self.destinations)

        self._current_occupied = sum(1 for v in self.grid.values() if v is not None)
        self._peak_occupied    = self._current_occupied

        if box_seq is not None:
            self._box_seq = box_seq
        else:
            rng = random.Random(99_999)
            self._box_seq = [_gen_box(rng.choice(self.destinations), rng)
                             for _ in range(total_boxes)]

        self.is_loaded  = True
        self.is_running = True

    # ── stepping ──────────────────────────────────────────────────────────────

    def step(self, n_boxes: int = 100) -> Dict:
        if not self.is_loaded:
            return {"error": "not_initialized"}

        # Pre-compute things the optimal algo needs once per step
        if self.mode == "optimal":
            active_dests_set = set(self.active_pallets.keys())
            dest_counts: Dict[str, int] = defaultdict(int)
            dest_set = set(self.destinations)
            for code in self.grid.values():
                if code:
                    d = code[7:15]
                    if d in dest_set:
                        dest_counts[d] += 1
            silo_fill_pct = self._current_occupied / max(len(self.grid), 1)

        # ── Place incoming boxes ──────────────────────────────────────────────
        for _ in range(n_boxes):
            if self._seq_idx >= len(self._box_seq):
                break
            code = self._box_seq[self._seq_idx]
            self._seq_idx   += 1
            self.boxes_arrived += 1

            if self.mode == "smart":
                pos, cost = place_box_smart(self.grid, self.shuttles, code, self.destinations)
            elif self.mode == "naive":
                pos, cost = place_box_naive(self.grid, self.shuttles)
            else:  # optimal
                pos, cost = place_box_optimal(
                    self.grid, self.shuttles, code, self.destinations,
                    active_dests_set, dest_counts,
                    silo_fill_pct=silo_fill_pct,
                )
                if self.ema:
                    self.ema.record_arrival(code[7:15])

            if pos:
                self.grid[pos] = code
                self.boxes_placed        += 1
                self.total_input_time    += cost
                self._current_occupied   += 1
                if self._current_occupied > self._peak_occupied:
                    self._peak_occupied = self._current_occupied

        # EMA clock tick
        if self.mode == "optimal" and self.ema:
            self.ema.tick_if_needed(self.boxes_arrived * SECONDS_PER_BOX)

        # ── Refresh active pallets ────────────────────────────────────────────
        if self.mode == "smart":
            self.active_pallets = select_active_destinations(
                self.grid, self.active_pallets, self.destinations
            )
        elif self.mode == "naive":
            self.active_pallets = naive_select_destinations(
                self.active_pallets, self.destinations
            )
        else:  # optimal
            sim_time = self.boxes_arrived * SECONDS_PER_BOX
            self.active_pallets = select_active_pallets_ema(
                self.grid, self.ema, self.active_pallets, self.destinations, sim_time
            )

        # ── Retrieve boxes ────────────────────────────────────────────────────
        if self.mode == "smart":
            ops = retrieve_boxes_smart(self.grid, self.shuttles, self.active_pallets)
        elif self.mode == "naive":
            ops = retrieve_boxes_naive(self.grid, self.shuttles, self.active_pallets)
        else:  # optimal
            ops = retrieve_boxes_hungarian(self.grid, self.shuttles, self.active_pallets)

        running_out = self.total_output_time
        for code, pos, cost in ops:
            self.grid[pos] = None
            self._current_occupied -= 1
            running_out += cost
            dest = code[7:15]
            if dest not in self.active_pallets:
                self.active_pallets[dest] = []
            self.active_pallets[dest].append(code)
            self.boxes_retrieved += 1

            if len(self.active_pallets[dest]) >= PALLET_SIZE:
                self.completed_pallets.append({
                    "id":           str(uuid.uuid4())[:8],
                    "destination":  dest,
                    "boxes":        self.active_pallets[dest].copy(),
                    "completed_at": running_out,
                })
                del self.active_pallets[dest]

        self.total_output_time = running_out
        return self.get_metrics()

    def run_full(self, batch: int = 100) -> Dict:
        while self._seq_idx < len(self._box_seq):
            self.step(batch)
        for _ in range(20):        # extra retrieval-only passes
            self.step(0)
        return self.get_metrics()

    # ── properties ────────────────────────────────────────────────────────────

    @property
    def is_done(self) -> bool:
        return self._seq_idx >= len(self._box_seq)

    # ── metrics & state ───────────────────────────────────────────────────────

    def get_metrics(self) -> Dict:
        n    = len(self.completed_pallets)
        # Official metric: completed / (completed + currently_active) × 100
        total_pallets = n + len(self.active_pallets)
        full_pallets_pct = round(n / max(total_pallets, 1) * 100, 1)
        total_time = self.total_input_time + self.total_output_time

        # Pallet completion interval stats (inter-pallet output time gaps)
        worst_case_pallet_s = 0.0
        pallet_time_stddev  = 0.0
        if self.completed_pallets:
            times = [p["completed_at"] for p in self.completed_pallets]
            intervals = [times[0]] + [times[i] - times[i - 1] for i in range(1, len(times))]
            worst_case_pallet_s = max(intervals)
            mean = sum(intervals) / len(intervals)
            pallet_time_stddev = math.sqrt(
                sum((t - mean) ** 2 for t in intervals) / len(intervals)
            )

        return {
            "boxes_arrived":        self.boxes_arrived,
            "boxes_placed":         self.boxes_placed,
            "boxes_retrieved":      self.boxes_retrieved,
            "completed_pallets":    n,
            "full_pallets_pct":     full_pallets_pct,
            "total_input_time":     round(self.total_input_time, 1),
            "total_output_time":    round(self.total_output_time, 1),
            "total_time":           round(total_time, 1),
            "avg_time_per_pallet":  round(self.total_output_time / max(n, 1), 1),
            "throughput_per_hour":  round(n * 3600 / max(self.total_output_time, 1), 2),
            "peak_occupancy_pct":   round(self._peak_occupied / max(len(self.grid), 1) * 100, 1),
            "worst_case_pallet_s":  round(worst_case_pallet_s, 1),
            "pallet_time_stddev":   round(pallet_time_stddev, 1),
            "occupied_cells":       self._current_occupied,
            "total_cells":          len(self.grid),
            "active_pallets": [
                {"destination": d, "count": len(boxes), "target": PALLET_SIZE}
                for d, boxes in self.active_pallets.items()
            ],
            "is_done":  self.is_done,
            "progress": round(self._seq_idx / max(len(self._box_seq), 1) * 100, 1),
        }

    def get_aisle_state(self, aisle: str) -> Dict:
        cells: Dict[str, Dict] = {}
        for pos, code in self.grid.items():
            if not pos.startswith(aisle):
                continue
            a, s, x, y, z = parse_pos(pos)
            dest_idx = None
            if code:
                dest_idx = self.dest_index.get(code[7:15])
            cells[pos] = {"code": code, "dest_idx": dest_idx,
                          "x": x, "y": y, "z": z, "side": s}
        return {
            "aisle":   aisle,
            "cells":   cells,
            "shuttles": {
                shuttle_key(aisle, y): self.shuttles.get(shuttle_key(aisle, y), 0)
                for y in Y_RANGE
            },
            "dest_count": len(self.destinations),
        }

    def get_full_state(self) -> Dict:
        shuttle_data = {}
        for a in AISLES:
            for y in Y_RANGE:
                sk = shuttle_key(a, y)
                shuttle_data[sk] = {"aisle": a, "y_level": y,
                                    "current_x": self.shuttles.get(sk, 0)}
        return {
            "grid":         {p: c for p, c in self.grid.items()},
            "shuttles":     shuttle_data,
            "dest_index":   self.dest_index,
            "destinations": self.destinations,
        }


# ── module-level singletons ───────────────────────────────────────────────────

smart_engine   = SimulationEngine(mode="smart")
naive_engine   = SimulationEngine(mode="naive")
optimal_engine = SimulationEngine(mode="optimal")
