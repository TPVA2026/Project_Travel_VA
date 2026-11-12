"""Fixed MVP reference fares; these records are not verified booking quotes."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

Text = Annotated[StrictStr, Field(min_length=1)]


class TransportReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Text
    destinationId: Text
    fromDestinationId: Text
    from_: Text = Field(alias="from")
    to: Text
    kindOfTransport: Literal["bus", "train", "flight"]
    price: Annotated[StrictInt, Field(ge=0)]
    currency: Literal["VND"]
    priceScope: Literal["perPerson"]
    tripType: Literal["oneWay"]
    passengerType: Literal["adult"]
    serviceFeesIncluded: Literal[True]
    priceStatus: Literal["ESTIMATED"]
    sourceUrl: StrictStr | None
    sourceStatus: Literal["PENDING", "PROVIDED"]
    excludedCosts: list[Literal["terminalTransfers"]]
