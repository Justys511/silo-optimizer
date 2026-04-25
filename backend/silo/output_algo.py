"""
Output algorithm: retrieve boxes from the silo to fill active pallets.

Smart strategy:
  • Keep up to MAX_ACTIVE_PALLETS=8 destinations active at once.
  • Each call selects the *best* destinations (those with the most available
    boxes in the silo) so pallets complete quickly.
  • For every shuttle (aisle × Y-level) find the box that minimises total
    travel: |shuttle_x − box_x| + box_x  (go-to-box + return-to-head).
  • Z=2 boxes whose Z=1 neighbour is still occupied are skipped (blocked).

Naive strategy:
  • FIFO destination selection: first 8 destinations from the pool stay active
    regardless of how many boxes they have — wastes slots on near-empty dests.
  • Retrieval order: linear scan (no travel optimisation).
"""

from __future__ import annotations
from collections import Counter
from typing import Dict, List, Optional, Tuple

from .model import (
    AISLES, SIDES, Y_RANGE, X_RANGE,
    make_pos, parse_pos, shuttle_key,
    MAX_ACTIVE_PALLETS, PALLET_SIZE,
)


# ── destination selection ─────────────────────────────────────────────────────

def naive_select_destinations(
    active_pallets: Dict[str, List[str]],
    destinations: List[str],
) -> Dict[str, List[str]]:
    """
    FIFO: always keep the first MAX_ACTIVE_PALLETS destinations from the pool
    active, regardless of how many boxes are available.  This wastes pallet
    slots on under-stocked destinations — deliberately sub-optimal.
    """
    active = {d: boxes for d, boxes in active_pallets.items()
              if len(boxes) < PALLET_SIZE}
    for dest in destinations:
        if len(active) >= MAX_ACTIVE_PALLETS:
            break
        if dest not in active:
            active[dest] = []
    return active


def select_active_destinations(
    grid: Dict[str, Optional[str]],
    active_pallets: Dict[str, List[str]],
    destinations: List[str],
) -> Dict[str, List[str]]:
    """
    Keep completed pallets out; fill empty slots with the destinations
    that have the most boxes waiting in the silo.
    """
    dest_set = set(destinations)
    # Prune completed
    active = {d: boxes for d, boxes in active_pallets.items()
              if len(boxes) < PALLET_SIZE}

    if len(active) >= MAX_ACTIVE_PALLETS:
        return active

    # Count boxes per destination currently in the silo
    counts: Counter = Counter()
    for code in grid.values():
        if code:
            d = code[7:15]
            if d in dest_set:
                counts[d] += 1

    for dest, _ in counts.most_common():
        if len(active) >= MAX_ACTIVE_PALLETS:
            break
        if dest not in active and counts[dest] > 0:
            active[dest] = []

    return active


# ── smart retrieval ───────────────────────────────────────────────────────────

def retrieve_boxes_smart(
    grid: Dict[str, Optional[str]],
    shuttles: Dict[str, int],
    active_pallets: Dict[str, List[str]],
) -> List[Tuple[str, str, float]]:
    """
    One retrieval operation per shuttle.
    Returns list of (box_code, position, time_cost).
    """
    ops: List[Tuple[str, str, float]] = []
    active_dests = {
        d for d, boxes in active_pallets.items() if len(boxes) < PALLET_SIZE
    }

    for aisle in AISLES:
        for y in Y_RANGE:
            sk = shuttle_key(aisle, y)
            sx = shuttles.get(sk, 0)
            best: Optional[Tuple[float, str, str, str]] = None  # (cost, pos, code, dest)

            for pos, code in grid.items():
                if code is None:
                    continue
                a, s, x, yy, z = parse_pos(pos)
                if a != aisle or yy != y:
                    continue
                dest = code[7:15]
                if dest not in active_dests:
                    continue

                # Z=2 blocked if Z=1 still occupied
                if z == 2:
                    z1 = make_pos(aisle, s, x, y, 1)
                    if grid.get(z1) is not None:
                        continue

                cost = 20 + abs(sx - x) + x  # travel-to + return-to-head
                if best is None or cost < best[0]:
                    best = (cost, pos, code, dest)

            if best:
                cost, pos, code, dest = best
                ops.append((code, pos, cost))
                shuttles[sk] = 0  # shuttle returns to head (X=0) after delivery

    return ops


# ── naive retrieval ───────────────────────────────────────────────────────────

def retrieve_boxes_naive(
    grid: Dict[str, Optional[str]],
    shuttles: Dict[str, int],
    active_pallets: Dict[str, List[str]],
) -> List[Tuple[str, str, float]]:
    """Naive: first matching box per shuttle in linear scan order."""
    ops: List[Tuple[str, str, float]] = []
    active_dests = {
        d for d, boxes in active_pallets.items() if len(boxes) < PALLET_SIZE
    }

    for aisle in AISLES:
        for y in Y_RANGE:
            sk = shuttle_key(aisle, y)
            sx = shuttles.get(sk, 0)
            found = False

            for x in X_RANGE:
                if found:
                    break
                for side in SIDES:
                    if found:
                        break
                    for z in (1, 2):
                        pos = make_pos(aisle, side, x, y, z)
                        code = grid.get(pos)
                        if code is None:
                            continue
                        dest = code[7:15]
                        if dest not in active_dests:
                            continue
                        if z == 2:
                            z1 = make_pos(aisle, side, x, y, 1)
                            if grid.get(z1) is not None:
                                continue
                        cost = 20 + abs(sx - x) + x
                        ops.append((code, pos, cost))
                        shuttles[sk] = 0
                        found = True
                        break

    return ops
