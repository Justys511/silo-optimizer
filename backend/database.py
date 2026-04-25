import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

_mongo_client: AsyncIOMotorClient | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
    return _mongo_client


def get_db():
    return get_mongo_client()[os.getenv("DB_NAME", "silo_optimizer")]


def get_collections():
    db = get_db()
    return {
        "silo_state": db["silo_state"],
        "boxes": db["boxes"],
        "pallets": db["pallets"],
        "simulation_runs": db["simulation_runs"],
    }


# Redis client (optional — used for real-time shuttle positions)
try:
    import redis as redis_lib
    _redis = redis_lib.Redis.from_url(
        os.getenv("REDIS_URL", "redis://localhost:6379"),
        decode_responses=True,
        socket_connect_timeout=2,
    )
    _redis.ping()
    redis_client = _redis
except Exception:
    redis_client = None
