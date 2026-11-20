from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load the server-only environment regardless of the directory uvicorn is
# launched from. Existing process environment values take precedence.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

from app.api.destinations import router as destinations_router
from app.api.requests import router as requests_router
from app.api.itineraries import router as itineraries_router
from app.api.places import router as places_router
from app.api.trips import router as trips_router

app = FastAPI()
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGIN", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(itineraries_router, prefix="/itineraries")
app.include_router(destinations_router)
app.include_router(requests_router)
app.include_router(places_router)
app.include_router(trips_router)

@app.get("/health")
def health_check():
    return {"status": "OK"}
@app.get("/api/v1/info")
def info():
    return{
    "project": "Travel Planning Virtual Assistant",
    "version": "1.0",
    "backend": "FastAPI"
    }


