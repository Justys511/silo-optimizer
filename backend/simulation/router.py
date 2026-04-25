from __future__ import annotations
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from .generator import smart_engine, naive_engine, optimal_engine, make_destination_pool

router = APIRouter(tags=["simulation"])


class StartRequest(BaseModel):
    num_destinations: int = 20
    total_boxes: int = 500
    load_csv: bool = True


class StepRequest(BaseModel):
    n_boxes: int = 100


# ── shared helpers ────────────────────────────────────────────────────────────

def _csv_path() -> str:
    import os
    return os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "silo-semi-empty.csv")
    )


def _build_seq(num_destinations: int, total_boxes: int):
    import random
    dests = make_destination_pool(num_destinations)
    rng = random.Random(99_999)

    def _g(dest: str) -> str:
        src  = "".join(str(rng.randint(0, 9)) for _ in range(7))
        bulk = "".join(str(rng.randint(0, 9)) for _ in range(5))
        return f"{src}{dest}{bulk}"

    return dests, [_g(rng.choice(dests)) for _ in range(total_boxes)]


def _pct(a: float, b: float, lower_is_better: bool = False) -> float:
    if b == 0:
        return 0.0
    if lower_is_better:
        return round((b - a) / b * 100, 1)
    return round((a - b) / max(b, 0.001) * 100, 1)


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_simulation(req: StartRequest):
    """Initialise all three engines with identical parameters and box stream."""
    csv = _csv_path()
    if req.load_csv and not __import__("os").path.exists(csv):
        raise HTTPException(status_code=404, detail=f"CSV not found: {csv}")

    _, box_seq = _build_seq(req.num_destinations, req.total_boxes)
    path = csv if req.load_csv else ""

    for engine in (smart_engine, naive_engine, optimal_engine):
        engine.initialize(
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
    if not smart_engine.is_loaded:
        return {"status": "not_started"}
    return {
        "status": "running",
        "smart":   smart_engine.get_metrics(),
        "naive":   naive_engine.get_metrics(),
        "optimal": optimal_engine.get_metrics(),
    }


@router.post("/step")
async def step_simulation(req: StepRequest):
    if not smart_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised — call /start first")
    return {
        "smart":   smart_engine.step(req.n_boxes),
        "naive":   naive_engine.step(req.n_boxes),
        "optimal": optimal_engine.step(req.n_boxes),
    }


@router.post("/run-full")
async def run_full(background_tasks: BackgroundTasks, batch: int = 100):
    if not smart_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised — call /start first")

    def _run():
        for e in (smart_engine, naive_engine, optimal_engine):
            if not e.is_done:
                e.run_full(batch)

    background_tasks.add_task(_run)
    return {"status": "running_in_background"}


@router.post("/run-optimal")
async def run_optimal(background_tasks: BackgroundTasks, batch: int = 100):
    """Run only the optimal engine to completion."""
    if not optimal_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised — call /start first")
    background_tasks.add_task(optimal_engine.run_full, batch)
    return {"status": "running_optimal_in_background"}


@router.get("/compare")
async def compare():
    """Three-way comparison of Naive / Smart / Optimal."""
    if not smart_engine.is_loaded:
        raise HTTPException(status_code=400, detail="Not initialised")

    s = smart_engine.get_metrics()
    n = naive_engine.get_metrics()
    o = optimal_engine.get_metrics()

    return {
        "naive":   n,
        "smart":   s,
        "optimal": o,
        "improvement_smart_vs_naive": {
            "full_pallets_pct":    _pct(s["full_pallets_pct"],    n["full_pallets_pct"]),
            "avg_time_per_pallet": _pct(s["avg_time_per_pallet"], n["avg_time_per_pallet"], lower_is_better=True),
            "throughput_per_hour": _pct(s["throughput_per_hour"], n["throughput_per_hour"]),
        },
        "improvement_optimal_vs_smart": {
            "full_pallets_pct":    _pct(o["full_pallets_pct"],    s["full_pallets_pct"]),
            "avg_time_per_pallet": _pct(o["avg_time_per_pallet"], s["avg_time_per_pallet"], lower_is_better=True),
            "throughput_per_hour": _pct(o["throughput_per_hour"], s["throughput_per_hour"]),
        },
        "chart_data": [
            {
                "metric": "Completed Pallets",
                "naive":   n["completed_pallets"],
                "smart":   s["completed_pallets"],
                "optimal": o["completed_pallets"],
                "unit": "pallets",
            },
            {
                "metric": "Full Pallets %",
                "naive":   round(n["full_pallets_pct"], 1),
                "smart":   round(s["full_pallets_pct"], 1),
                "optimal": round(o["full_pallets_pct"], 1),
                "unit": "%",
            },
            {
                "metric": "Throughput (p/hr)",
                "naive":   round(n["throughput_per_hour"], 1),
                "smart":   round(s["throughput_per_hour"], 1),
                "optimal": round(o["throughput_per_hour"], 1),
                "unit": "p/hr",
            },
            {
                "metric": "Avg Time/Pallet (s)",
                "naive":   round(n["avg_time_per_pallet"], 0),
                "smart":   round(s["avg_time_per_pallet"], 0),
                "optimal": round(o["avg_time_per_pallet"], 0),
                "unit": "s",
            },
        ],
    }


@router.get("/compare-all")
async def compare_all(
    num_destinations: int = 20,
    total_boxes: int = 500,
    load_csv: bool = True,
):
    """
    Run all three algorithms from scratch with identical input and return
    final metrics. Blocking — may take ~30 s for 500 boxes.
    """
    import os
    csv = _csv_path()
    if load_csv and not os.path.exists(csv):
        raise HTTPException(status_code=404, detail=f"CSV not found: {csv}")

    _, box_seq = _build_seq(num_destinations, total_boxes)
    path = csv if load_csv else ""

    for e in (smart_engine, naive_engine, optimal_engine):
        e.initialize(
            num_destinations=num_destinations,
            total_boxes=total_boxes,
            csv_path=path,
            box_seq=list(box_seq),
        )
        e.run_full()

    return await compare()


@router.post("/reset")
async def reset_simulation():
    for e in (smart_engine, naive_engine, optimal_engine):
        e.reset()
    return {"status": "reset"}
