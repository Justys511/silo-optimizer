from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from silo.router import router as silo_router
from simulation.router import router as sim_router

app = FastAPI(
    title="Silo Optimizer API",
    description="Inditex Tech — HackUPC 2026",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(silo_router, prefix="/api/silo")
app.include_router(sim_router, prefix="/api/simulation")


@app.get("/")
async def root():
    return {"status": "ok", "service": "Silo Optimizer", "docs": "/docs"}
