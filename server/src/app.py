import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.routes.destination_routes import router as destination_router
from src.routes.itinerary_routes import router as itinerary_router
from src.routes.request_routes import router as request_router

load_dotenv()

MAX_BODY_BYTES = 100 * 1024  # same 100kb limit as the old express.json()

app = FastAPI(title="Travel Planning Assistant")

# Minimal CORS: only the known frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and int(length) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "Request body too large"}, status_code=413)
    return await call_next(request)


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(request_router, prefix="/requests")
app.include_router(destination_router, prefix="/destinations")
app.include_router(itinerary_router, prefix="/itineraries")
