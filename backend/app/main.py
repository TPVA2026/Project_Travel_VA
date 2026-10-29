import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.destinations import router as destinations_router
from app.api.itineraries import router as itineraries_router
from app.api.requests import router as requests_router

load_dotenv()

MAX_BODY_BYTES = 100 * 1024  # 100kb request limit

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


app.include_router(requests_router, prefix="/requests")
app.include_router(destinations_router, prefix="/destinations")
app.include_router(itineraries_router, prefix="/itineraries")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "3001"))
    print(f"Server listening on port {port}")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
