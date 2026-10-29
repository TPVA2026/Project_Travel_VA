from fastapi import FastAPI
from pydantic import BaseModel, Field
from app.api.destinations import router as destinations_router
from app.api.requests import router as requests_router


app = FastAPI()

app.include_router(destinations_router)
app.include_router(requests_router)

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


