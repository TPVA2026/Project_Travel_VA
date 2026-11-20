from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.auth import AuthenticatedUser, get_current_user
from app.services.trip_store import create_trip, get_trip, list_trips, update_trip

router = APIRouter(prefix="/api/trips", tags=["trips"])


class TripBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itinerary: dict[str, Any]


@router.get("")
def trips_index(user: AuthenticatedUser = Depends(get_current_user)):
    return {"trips": list_trips(user.id)}


@router.post("", status_code=status.HTTP_201_CREATED)
def trips_create(body: TripBody, user: AuthenticatedUser = Depends(get_current_user)):
    return {"trip": create_trip(user.id, body.itinerary)}


@router.get("/{trip_id}")
def trips_show(trip_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    trip = get_trip(user.id, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return {"trip": trip}


@router.put("/{trip_id}")
def trips_update(
    trip_id: str,
    body: TripBody,
    user: AuthenticatedUser = Depends(get_current_user),
):
    trip = update_trip(user.id, trip_id, body.itinerary)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return {"trip": trip}
