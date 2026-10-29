from fastapi import APIRouter

from src.controllers import itinerary_controller

router = APIRouter()


@router.post("/generate")  # M3 candidate generation
def generate(body: dict):
    return itinerary_controller.generate(body)


# TODO(M6): POST /evaluate, /rank, /revise, /select
