from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .model import AISLES, SimulationConfig
from simulation.generator import smart_engine, naive_engine, optimal_engine

router = APIRouter(tags=["silo"])


# ── request bodies ────────────────────────────────────────────────────────────

class AddBoxRequest(BaseModel):
    code: str                    # 20-digit box code
    use_smart: bool = True


class RetrieveRequest(BaseModel):
    use_smart: bool = True


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/state")
async def get_silo_state(aisle: Optional[str] = None, mode: str = "smart"):
    """Return silo grid. If *aisle* is supplied, only that aisle is returned."""
    engine = naive_engine if mode == "naive" else optimal_engine if mode == "optimal" else smart_engine
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Simulation not initialised — call /api/simulation/start first")

    if aisle:
        if aisle not in AISLES:
            raise HTTPException(status_code=422, detail=f"aisle must be one of {AISLES}")
        return engine.get_aisle_state(aisle)

    return engine.get_full_state()


@router.get("/shuttles")
async def get_shuttles(use_smart: bool = True):
    engine = smart_engine if use_smart else naive_engine
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised")
    return {
        "shuttles": engine.shuttles,
        "aisles": AISLES,
    }


@router.post("/load-csv")
async def load_csv(config: SimulationConfig):
    """Load the CSV and initialise both engines with the given config."""
    import os
    csv_path = os.path.join(os.path.dirname(__file__), "..", "silo-semi-empty.csv")
    csv_path = os.path.normpath(csv_path)

    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail=f"CSV not found at {csv_path}")

    # Build shared box sequence so both engines receive identical input
    from simulation.generator import make_destination_pool
    import random
    dests = make_destination_pool(config.num_destinations)
    rng = random.Random(99_999)

    def _gen(dest: str) -> str:
        src = "".join(str(rng.randint(0, 9)) for _ in range(7))
        bulk = "".join(str(rng.randint(0, 9)) for _ in range(5))
        return f"{src}{dest}{bulk}"

    box_seq = [_gen(rng.choice(dests)) for _ in range(config.total_boxes)]

    smart_engine.initialize(
        num_destinations=config.num_destinations,
        total_boxes=config.total_boxes,
        csv_path=csv_path,
        box_seq=box_seq,
    )
    naive_engine.initialize(
        num_destinations=config.num_destinations,
        total_boxes=config.total_boxes,
        csv_path=csv_path,
        box_seq=list(box_seq),   # copy
    )

    return {
        "status": "ok",
        "occupied": sum(1 for v in smart_engine.grid.values() if v is not None),
        "total": len(smart_engine.grid),
        "destinations": len(smart_engine.destinations),
        "total_boxes_queued": len(box_seq),
    }


@router.post("/add-box")
async def add_box(req: AddBoxRequest):
    engine = smart_engine if req.use_smart else naive_engine
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised")

    if req.use_smart:
        from silo.input_algo import place_box_smart
        pos, cost = place_box_smart(engine.grid, engine.shuttles, req.code, engine.destinations)
    else:
        from silo.input_algo import place_box_naive
        pos, cost = place_box_naive(engine.grid, engine.shuttles)

    if not pos:
        raise HTTPException(status_code=507, detail="Silo full — no free position found")

    engine.grid[pos] = req.code
    engine.boxes_placed += 1
    engine.total_input_time += cost
    return {"position": pos, "time_cost": cost}


@router.post("/retrieve")
async def retrieve(req: RetrieveRequest):
    engine = smart_engine if req.use_smart else naive_engine
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised")

    if req.use_smart:
        from silo.output_algo import retrieve_boxes_smart
        ops = retrieve_boxes_smart(engine.grid, engine.shuttles, engine.active_pallets)
    else:
        from silo.output_algo import retrieve_boxes_naive
        ops = retrieve_boxes_naive(engine.grid, engine.shuttles, engine.active_pallets)

    results = []
    for code, pos, cost in ops:
        engine.grid[pos] = None
        engine.total_output_time += cost
        results.append({"code": code, "position": pos, "time_cost": cost})

    return {"operations": results, "count": len(results)}


@router.get("/pallets")
async def get_pallets(use_smart: bool = True):
    engine = smart_engine if use_smart else naive_engine
    if not engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised")

    return {
        "active": [
            {"destination": d, "count": len(boxes), "target": 12}
            for d, boxes in engine.active_pallets.items()
        ],
        "completed": engine.completed_pallets[-20:],   # last 20
        "completed_total": len(engine.completed_pallets),
    }
