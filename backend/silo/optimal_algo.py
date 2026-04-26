"""
Optimal algorithm — three improvements stacked on top of Smart:

1. Priority zone placement
   HOT destinations (already in active pallet) are placed at X=1-20 (closest
   to head) for fast retrieval. All other destinations use Smart's clustering
   logic (group by destination lane) — no forced cold zone that would increase
   travel distance on uniform-traffic workloads.

2. Hungarian bipartite retrieval
   Instead of every shuttle independently grabbing the nearest hot box (which
   crowds all 32 shuttles onto the same 1-2 hot pallets), we solve a global
   assignment: each active pallet is matched to its optimal dedicated shuttle.
   The remaining unassigned shuttles fall back to smart-greedy so no shuttle
   sits idle.

3. EMA-based pallet selection
   Selects the 8 active pallets by predicted future box count
   (current_count + EMA_rate × 2 min lookahead) rather than raw snapshot.
   During the first 60 simulated seconds (cold start) it falls back to raw count.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.optimize import linear_sum_assignment

from .model import (
    AISLES, SIDES, Y_RANGE, X_RANGE,
    make_pos, parse_pos, shuttle_key,
    PALLET_SIZE, MAX_ACTIVE_PALLETS,
)

INF = 1e9

# ── Hot/Cold zones ────────────────────────────────────────────────────────────

HOT_X = range(1, 21)  # 1–20: active-pallet destinations go here for fast retrieval


def place_box_optimal(
    grid: Dict[str, Optional[str]],
    shuttles: Dict[str, int],
    box_code: str,
    destinations: List[str],
    active_dests: set,
    dest_counts: Dict[str, int],
    silo_fill_pct: float = 0.0,
) -> Tuple[Optional[str], float]:
    """
    Place *box_code*:
    - HOT zone (X=1-20, Z=1 only) when silo fill < 65% and dest is active.
      Z=1 only prevents hot boxes being blocked by inactive cold boxes at Z=1.
      Adaptive: disabled at high load to avoid hot-zone contention.
    - Everything else: Smart-style destination clustering across full X range.
    Falls back to full range if preferred zone is full.
    """
    dest = box_code[7:15]
    is_hot = dest in active_dests

    # Precompute per-lane cluster counts for this destination
    lane_cluster: Dict[Tuple[str, int], int] = defaultdict(int)
    for pos, code in grid.items():
        if code and code[7:15] == dest:
            a, s, x, y, z = parse_pos(pos)
            lane_cluster[(a, y)] += 1

    use_hot_zone = is_hot and silo_fill_pct < 0.65
    if use_hot_zone:
        # Z=1 only in hot zone — hot boxes must always be directly accessible
        zone_order = [(HOT_X, [1]), (range(1, 61), [1, 2])]
    else:
        zone_order = [(range(1, 61), [1, 2])]

    for x_range, z_pref in zone_order:
        best_pos: Optional[str] = None
        best_score = float("inf")
        best_lane: Optional[Tuple[str, int]] = None

        for aisle in AISLES:
            for y in Y_RANGE:
                sx = shuttles.get(shuttle_key(aisle, y), 0)
                cluster = lane_cluster.get((aisle, y), 0)

                for x in sorted(x_range, key=lambda xx: abs(xx - sx)):
                    for side in SIDES:
                        for z in z_pref:
                            p = make_pos(aisle, side, x, y, z)
                            if grid.get(p) is not None:
                                continue
                            if z == 2:
                                z1 = make_pos(aisle, side, x, y, 1)
                                if grid.get(z1) is None:
                                    continue
                            travel_cost = 20 + sx + x
                            cluster_bonus = min(cluster * 5, travel_cost - 20)
                            score = travel_cost - cluster_bonus  # >= 20
                            if score < best_score:
                                best_score = score
                                best_pos = p
                                best_lane = (aisle, y)

        if best_pos and best_lane:
            aisle, y = best_lane
            x = int(best_pos[4:6])
            shuttles[shuttle_key(aisle, y)] = x
            return best_pos, best_score

    return None, float("inf")


# ── EMA pallet selection ──────────────────────────────────────────────────────

class EMATracker:
    """Exponential moving average of per-destination box arrival rates."""

    def __init__(self, alpha: float = 0.3):
        self.alpha = alpha
        self.rates: Dict[str, float] = {}          # dest → EMA rate (boxes/sim-minute)
        self._window: Dict[str, int] = defaultdict(int)
        self._last_minute: int = 0

    def record_arrival(self, dest: str) -> None:
        self._window[dest] += 1

    def tick_if_needed(self, sim_time_seconds: float) -> None:
        current_minute = int(sim_time_seconds // 60)
        for _ in range(current_minute - self._last_minute):
            for dest in set(self.rates) | set(self._window):
                cnt = self._window.get(dest, 0)
                old = self.rates.get(dest, 0.0)
                self.rates[dest] = self.alpha * cnt + (1 - self.alpha) * old
            self._window = defaultdict(int)
        self._last_minute = current_minute

    def predicted_count(self, dest: str, current_count: int, lookahead: float = 2.0) -> float:
        return current_count + self.rates.get(dest, 0.0) * lookahead


def select_active_pallets_ema(
    grid: Dict[str, Optional[str]],
    ema: EMATracker,
    active_pallets: Dict[str, List[str]],
    destinations: List[str],
    sim_time: float,
) -> Dict[str, List[str]]:
    """
    Keep active pallets that aren't full yet; fill empty slots using
    EMA-predicted future box count (raw count during cold start < 60 s).
    Only adds destinations that currently have at least one box in the silo.
    """
    dest_set = set(destinations)
    active = {d: boxes for d, boxes in active_pallets.items() if len(boxes) < PALLET_SIZE}

    if len(active) >= MAX_ACTIVE_PALLETS:
        return active

    # Count current boxes per destination in the silo
    counts: Dict[str, int] = defaultdict(int)
    for code in grid.values():
        if code:
            d = code[7:15]
            if d in dest_set:
                counts[d] += 1

    # Score: EMA-predicted count or raw count during cold start
    if sim_time < 60:
        scores = dict(counts)
    else:
        scores = {d: ema.predicted_count(d, c) for d, c in counts.items()}

    candidates = sorted(
        [(d, s) for d, s in scores.items() if d not in active and counts.get(d, 0) >= 2],
        key=lambda kv: -kv[1],
    )
    for dest, _ in candidates:
        if len(active) >= MAX_ACTIVE_PALLETS:
            break
        active[dest] = []

    return active


# ── Hungarian retrieval ───────────────────────────────────────────────────────

def _build_lane_index(
    grid: Dict[str, Optional[str]],
) -> Dict[Tuple[str, int, str], List[Tuple[str, str, int]]]:
    """
    Precompute: (aisle, y, dest) → list of (pos, code, x) for every
    accessible box (Z=2 skipped when its Z=1 neighbour is occupied).
    O(grid_size) — called once per retrieval pass.
    """
    idx: Dict[Tuple[str, int, str], List[Tuple[str, str, int]]] = defaultdict(list)
    for pos, code in grid.items():
        if code is None:
            continue
        a, s, x, y, z = parse_pos(pos)
        if z == 2:
            z1 = make_pos(a, s, x, y, 1)
            if grid.get(z1) is not None:
                continue
        dest = code[7:15]
        idx[(a, y, dest)].append((pos, code, x))
    return idx


def retrieve_boxes_hungarian(
    grid: Dict[str, Optional[str]],
    shuttles: Dict[str, int],
    active_pallets: Dict[str, List[str]],
) -> List[Tuple[str, str, float]]:
    """
    Phase 1 — Hungarian assignment (n_pallets × n_shuttles).
    Each pallet claims the single shuttle that can serve it most cheaply.
    This prevents 32 shuttles from all racing to the same hot pallet.

    Phase 2 — remaining unassigned shuttles fall back to smart-greedy
    so no shuttle sits idle.
    """
    active_dests = [d for d, boxes in active_pallets.items() if len(boxes) < PALLET_SIZE]
    if not active_dests:
        return []

    lane_idx = _build_lane_index(grid)

    shuttle_list: List[Tuple[str, int, str]] = [
        (a, y, shuttle_key(a, y)) for a in AISLES for y in Y_RANGE
    ]
    n_p = len(active_dests)
    n_s = len(shuttle_list)

    # cost[i][j] = best retrieval cost for pallet i via shuttle j
    cost = np.full((n_p, n_s), INF)
    best_box: Dict[Tuple[int, int], Tuple[str, str, float]] = {}

    for j, (aisle, y, sk) in enumerate(shuttle_list):
        sx = shuttles.get(sk, 0)
        for i, dest in enumerate(active_dests):
            boxes_here = lane_idx.get((aisle, y, dest), [])
            if not boxes_here:
                continue
            pos, code, bx = min(boxes_here, key=lambda b: 20 + abs(sx - b[2]) + b[2])
            c = 20 + abs(sx - bx) + bx
            cost[i][j] = c
            best_box[(i, j)] = (pos, code, c)

    # Hungarian on (n_p × n_s) — each pallet gets a unique dedicated shuttle
    row_ind, col_ind = linear_sum_assignment(cost)

    ops: List[Tuple[str, str, float]] = []
    assigned_shuttles: set = set()
    used_positions: set = set()

    for i, j in zip(row_ind, col_ind):
        if cost[i][j] >= INF:
            continue
        pos, code, c = best_box[(i, j)]
        if pos in used_positions:
            continue
        ops.append((code, pos, c))
        shuttles[shuttle_list[j][2]] = 0
        assigned_shuttles.add(j)
        used_positions.add(pos)

    # Phase 2 — unassigned shuttles do smart-greedy
    active_set = set(active_dests)
    for j, (aisle, y, sk) in enumerate(shuttle_list):
        if j in assigned_shuttles:
            continue
        sx = shuttles.get(sk, 0)
        best: Optional[Tuple[float, str, str]] = None
        for dest in active_set:
            for pos, code, bx in lane_idx.get((aisle, y, dest), []):
                if pos in used_positions:
                    continue
                c = 20 + abs(sx - bx) + bx
                if best is None or c < best[0]:
                    best = (c, pos, code)
        if best:
            c, pos, code = best
            ops.append((code, pos, c))
            shuttles[sk] = 0
            used_positions.add(pos)

    return ops
