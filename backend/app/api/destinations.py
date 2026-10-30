from fastapi import APIRouter
from fastapi import HTTPException
from app.services.data_service import get_destinations
import json
router = APIRouter(
    prefix="/api/v1/destinations",
    tags=["Destinations"],
)

@router.get("")
def list_destinations():
    try:
        lst_des = get_destinations()

        return {
            "total": len(lst_des),
            "destinations": lst_des
        }

    except FileNotFoundError:
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "DATASET_ERROR",
                    "message": "Unable to load destination data."
                }
        )
    except json.JSONDecodeError:
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "DATASET_ERROR",
                    "message": "Unable to load destination data."
                }
            )
    except ValueError:
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "DATASET_ERROR",                        
                    "message": "Invalid destination data format."
                }
            )