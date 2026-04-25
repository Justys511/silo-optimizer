"""
Input algorithm: decide where to store each incoming box.

Smart strategy:
  1. Find the (aisle, y-level) lane that already holds the most boxes going to
     the same destination, so future retrieval is spatially clustered.
  2. Within that lane pick the X position closest to the shuttle's current X,
     preferring Z=1 over Z=2 (Z=2 incurs a relocation penalty later).
  3. Fall back to the least-loaded lane when no same-destination lane exists.

Naive strategy:
  Linear scan — first free Z=1 slot (then Z=2) in aisle/Y order.
"""

from __future__ import annotations
from collections import Counter
from typing import Dict, List, Optional, Tuple

from .model import AISLES, SIDES, Y_RANGE, X_RANGE, make_pos, parse_pos, shuttle_key


# ── helpers ──────────────────────────────────────────────────────────────────

def _find_best_slot_in_lane(
    grid: Dict[str, Optional[str]],
    aisle: str,
    y: int,
    shuttle_x: int,
    dest: str,
) -> Tuple[Optional[str], float]:
    """Return (position, score) for the best free slot in one lane."""
    best_pos: Optional[str] = None
    best_score = float("inf")

    for x in sorted(X_RANGE, key=lambda xx: abs(xx - shuttle_x)):
        for side in SIDES:
            pos_z1 = make_pos(aisle, side, x, y, 1)
            pos_z2 = make_pos(aisle, side, x, y, 2)
            z1_free = grid.get(pos_z1) is None

            if z1_free:
                # Prefer Z=1
                base_cost = 20 + shuttle_x + x
                # Destination-grouping bonus: −3 per nearby same-dest box
                bonus = 0
                for dx in range(-4, 5):
                    nx = x + dx
                    if 1 <= nx <= 60:
                        for ns in SIDES:
                            for nz in (1, 2):
                                nb = grid.get(make_pos(aisle, ns, nx, y, nz))
                                if nb and nb[7:15] == dest:
                                    bonus -= 3
                score = base_cost + bonus
                if score < best_score:
                    best_score = score
                    best_pos = pos_z1

            elif grid.get(pos_z2) is None:
                # Z=2 available (Z=1 already occupied) — slight penalty
                base_cost = 20 + shuttle_x + x + 8
                score = base_cost
                if score < best_score:
                    best_score = score
                    best_pos = pos_z2

    return best_pos, best_score


# ── public API ────────────────────────────────────────────────────────────────

def place_box_smart(
    grid: Dict[str, Optional[str]],
    shuttles: Dict[str, int],
    box_code: str,
    destinations: List[str],
) -> Tuple[Optional[str], float]:
    """
    Place *box_code* in the optimal position.
    Updates `shuttles` in-place and returns (position_string, time_cost).
    """
    dest = box_code[7:15]

    # ── Step 1: rank lanes by same-destination count ──────────────────────────
    lane_counts: Counter = Counter()
    for pos, code in grid.items():
        if code and code[7:15] == dest:
            a, s, x, y, z = parse_pos(pos)
            lane_counts[(a, y)] += 1

    if lane_counts:
        candidate_lanes = [lane for lane, _ in lane_counts.most_common(4)]
    else:
        # Fall back: pick 4 least-loaded lanes for load balancing
        load: Counter = Counter()
        for pos, code in grid.items():
            if code:
                a, s, x, y, z = parse_pos(pos)
                load[(a, y)] += 1
        all_lanes = [(a, y) for a in AISLES for y in Y_RANGE]
        candidate_lanes = sorted(all_lanes, key=lambda t: load.get(t, 0))[:4]

    best_pos: Optional[str] = None
    best_score = float("inf")
    best_lane: Optional[Tuple[str, int]] = None

    for aisle, y in candidate_lanes:
        sx = shuttles.get(shuttle_key(aisle, y), 0)
        pos, score = _find_best_slot_in_lane(grid, aisle, y, sx, dest)
        if pos is not None and score < best_score:
            best_score = score
            best_pos = pos
            best_lane = (aisle, y)

    if best_pos and best_lane:
        aisle, y = best_lane
        x = int(best_pos[4:6])
        shuttles[shuttle_key(aisle, y)] = x
        return best_pos, best_score

    return None, float("inf")


def place_box_naive(
    grid: Dict[str, Optional[str]],
    shuttles: Dict[str, int],
) -> Tuple[Optional[str], float]:
    """Naive placement: first available position in deterministic order."""
    for aisle in AISLES:
        for y in Y_RANGE:
            sx = shuttles.get(shuttle_key(aisle, y), 0)
            for x in X_RANGE:
                for side in SIDES:
                    pos_z1 = make_pos(aisle, side, x, y, 1)
                    if grid.get(pos_z1) is None:
                        cost = 20 + sx + x
                        shuttles[shuttle_key(aisle, y)] = x
                        return pos_z1, cost
                    pos_z2 = make_pos(aisle, side, x, y, 2)
                    if grid.get(pos_z1) is not None and grid.get(pos_z2) is None:
                        cost = 20 + sx + x
                        shuttles[shuttle_key(aisle, y)] = x
                        return pos_z2, cost
    return None, float("inf")
