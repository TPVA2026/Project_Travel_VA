"""Select the dataset context sent to the LLM (M3).

Input is the M2 repository shape ({destinations, attractions, dining, travel_matrix});
output is the prompt shape (camelCase `travelMatrix`). If the request names a
preferredDestination, items that carry a `destinationId` are filtered to it; items
without that field are kept (the M2 dataset may not have it yet).
"""


def _for_destination(items: list, destination_id: str | None) -> list:
    if not destination_id:
        return items
    return [i for i in items if i.get("destinationId") in (None, destination_id)]


def build_context(request: dict, dataset: dict) -> dict:
    dest = request.get("preferredDestination")
    destinations = dataset.get("destinations", [])
    if dest:
        destinations = [d for d in destinations if d.get("id") == dest]
    matrix = dataset.get("travel_matrix", dataset.get("travelMatrix", []))
    return {
        "destinations": destinations,
        "attractions": _for_destination(dataset.get("attractions", []), dest),
        "dining": _for_destination(dataset.get("dining", []), dest),
        "travelMatrix": matrix,
    }
