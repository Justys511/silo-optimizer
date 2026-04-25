from __future__ import annotations
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from .generator import smart_engine, naive_engine

router = APIRouter(tags=["simulation"])


class StartRequest(BaseModel):
    num_destinations: int = 20   # 20 | 40 | 80
    total_boxes: int = 500
    load_csv: bool = True


class StepRequest(BaseModel):
    n_boxes: int = 100


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_simulation(req: StartRequest):
    """Initialise both smart and naive engines with the same parameters."""
    import os, random
    from .generator import make_destination_pool

    csv_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "silo-semi-empty.csv")
    )
    if req.load_csv and not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail=f"CSV not found: {csv_path}")

    dests = make_destination_pool(req.num_destinations)
    rng = random.Random(99_999)

    def _gen(dest: str) -> str:
        src = "".join(str(rng.randint(0, 9)) for _ in range(7))
        bulk = "".join(str(rng.randint(0, 9)) for _ in range(5))
        return f"{src}{dest}{bulk}"

    box_seq = [_gen(rng.choice(dests)) for _ in range(req.total_boxes)]
    path = csv_path if req.load_csv else ""

    smart_engine.initialize(
        num_destinations=req.num_destinations,
        total_boxes=req.total_boxes,
        csv_path=path,
        box_seq=box_seq,
    )
    naive_engine.initialize(
        num_destinations=req.num_destinations,
        total_boxes=req.total_boxes,
        csv_path=path,
        box_seq=list(box_seq),
    )

    return {
        "status": "started",
        "num_destinations": req.num_destinations,
        "total_boxes": req.total_boxes,
        "csv_loaded": bool(path),
        "occupied_initial": sum(1 for v in smart_engine.grid.values() if v is not None),
    }


@router.get("/status")
async def get_status():
    """Metrics for both engines."""
    if not smart_engine.is_loaded:
        return {"status": "not_started"}
    return {
        "status": "running" if smart_engine.is_running else "idle",
        "smart": smart_engine.get_metrics(),
        "naive": naive_engine.get_metrics(),
    }


@router.post("/step")
async def step_simulation(req: StepRequest):
    """Advance both engines by *n_boxes* arrivals."""
    if not smart_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised — call /start first")

    smart_metrics = smart_engine.step(req.n_boxes)
    naive_metrics = naive_engine.step(req.n_boxes)

    return {
        "smart": smart_metrics,
        "naive": naive_metrics,
    }


@router.post("/run-full")
async def run_full(background_tasks: BackgroundTasks, batch: int = 100):
    """Run both simulations to completion in the background."""
    if not smart_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised — call /start first")

    def _run():
        while not smart_engine.is_done or not naive_engine.is_done:
            if not smart_engine.is_done:
                smart_engine.step(batch)
            if not naive_engine.is_done:
                naive_engine.step(batch)

    background_tasks.add_task(_run)
    return {"status": "running_in_background"}


@router.get("/compare")
async def compare():
    """Side-by-side comparison of smart vs naive metrics."""
    if not smart_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised")

    s = smart_engine.get_metrics()
    n = naive_engine.get_metrics()

    def _pct_improvement(smart_val: float, naive_val: float, lower_is_better: bool = False) -> float:
        if naive_val == 0:
            return 0.0
        if lower_is_better:
            return round((naive_val - smart_val) / naive_val * 100, 1)
        return round((smart_val - naive_val) / max(naive_val, 0.001) * 100, 1)

    return {
        "smart": s,
        "naive": n,
        "improvement": {
            "full_pallets_pct": _pct_improvement(s["full_pallets_pct"], n["full_pallets_pct"]),
            "avg_time_per_pallet": _pct_improvement(
                s["avg_time_per_pallet"], n["avg_time_per_pallet"], lower_is_better=True
            ),
            "throughput_per_hour": _pct_improvement(s["throughput_per_hour"], n["throughput_per_hour"]),
        },
        "chart_data": [
            {
                "metric": "Full Pallets %",
                "smart": round(s["full_pallets_pct"], 1),
                "naive": round(n["full_pallets_pct"], 1),
                "unit": "%",
            },
            {
                "metric": "Completed Pallets",
                "smart": s["completed_pallets"],
                "naive": n["completed_pallets"],
                "unit": "pallets",
            },
            {
                "metric": "Throughput (pallets/hr)",
                "smart": round(s["throughput_per_hour"], 1),
                "naive": round(n["throughput_per_hour"], 1),
                "unit": "p/hr",
            },
            {
                "metric": "Avg Time/Pallet (s)",
                "smart": round(s["avg_time_per_pallet"], 0),
                "naive": round(n["avg_time_per_pallet"], 0),
                "unit": "s",
            },
        ],
    }


@router.post("/reset")
async def reset_simulation():
    smart_engine.reset()
    naive_engine.reset()
    return {"status": "reset"}
