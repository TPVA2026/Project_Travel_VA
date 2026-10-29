from fastapi import APIRouter

router = APIRouter(
    prefix="/api/v1/destinations",
    tags=["Destinations"]
)
@router.get("/")
def get_destinations():
    return {
        "destinations": ["Da Lat", "Da Nang", "Ha Noi"]
    }