# API Contract — Travel Planning Virtual Assistant (MVP v0.2)

- Status: Proposed integration contract for TPVA-33; implementation must be verified.
- Backend: Python / FastAPI / Pydantic v2
- Base URL (development): `http://localhost:3001`
- Media type: `application/json`
- Canonical input schemas: `backend/app/schemas/travel_request.py` and `travelRequest.schema.json`.

## 1. General Conventions

### 1.1 Naming Convention

`GET /api/v1/destinations` returns dataset fields directly in snake_case; no field-name mapping is required.

`POST /api/v1/requests/validate` continues to use camelCase according to the current shared TravelRequest schema. Changing the entire API to snake_case requires a coordinated update to the shared schema.

| Context | Field naming | Examples |
| --- | --- | --- |
| GET destinations response | snake_case | `city_name`, `best_time_to_visit` |
| TravelRequest request and response | camelCase | `departureLocation`, `durationDays` |

### 1.2 Data Types and Units

| Data | Format |
| --- | --- |
| Monetary values | Integer, VND |
| Distance | Kilometers (km) |
| Travel duration | Minutes |
| Dates | ISO 8601, YYYY-MM-DD |
| Month | YYYY-MM |
| Timestamps | ISO 8601 with timezone |
| Unknown optional data | null |

Unknown prices, travel durations, distances, or operating hours must never be represented as 0 unless zero is a verified value.

### 1.3 HTTP Status Codes

| Status | Meaning |
| --- | --- |
| 200 OK | Successful request |
| 400 Bad Request | Invalid request semantics, if explicitly defined |
| 404 Not Found | Requested specific resource does not exist |
| 422 Unprocessable Content | Request validation failure |
| 500 Internal Server Error | Internal backend failure |
| 502 Bad Gateway | Upstream AI service failure |
| 504 Gateway Timeout | Upstream AI service timeout |

### 1.4 API Versioning

New MVP endpoints are grouped under `/api/v1.`

Existing itinerary generation currently uses `/itineraries/generate`.

This endpoint must remain unchanged until Frontend and Backend agree on a coordinated versioning migration.

## 2. Endpoint Overview

| Method | Endpoint | Owner | Status |
| --- | --- | --- | --- |
| GET | `/health` | M6 | Existing |
| GET | `/api/v1/info` | M6 | Existing |
| GET | `/api/v1/destinations` | M6/M2 | TPVA-33 — contract update |
| POST | `/api/v1/requests/validate` | M6/M1 | TPVA-33 — contract update |
| POST | `/itineraries/generate` | M3/M6 | Existing — candidate only |
| POST | `/itineraries/evaluate` | M4/M6 | Planned |
| POST | `/itineraries/rank` | M4/M6 | Planned |
| POST | `/itineraries/revise` | M3/M6 | Planned |
| POST | `/itineraries/select` | M6 | Planned |

The endpoint contracts described below are integration targets. Documentation alone does not establish that the corresponding implementation is complete.

## 3. GET `/api/v1/destinations`

### 3.1 Description

Retrieve the list of supported travel destinations from the curated dataset.

Data source: `backend/app/data/destinations.json`

The API must return values based on the actual dataset without hard-coded destination names, invented identifiers, or fabricated information.

### 3.2 Request

- **Method:** GET
- **Path:** `/api/v1/destinations`
- **Request Body:** None
- **Query Parameters:** None for MVP v0.2
- **Authentication:** Not required for MVP

### 3.3 Success Response — HTTP 200

Illustrative structure; descriptive strings are placeholders, not authoritative dataset values.

```json
{
  "total": 1,
  "destinations": [
    {
      "city_name": "Nha Trang",
      "description": "Coastal destination",
      "best_time_to_visit": null
    }
  ]
}
```

Rules:

- total equals the number of elements returned in destinations.
- destinations is always an array.
- Destination fields use snake_case and are returned directly from the service.
- city_name and description are required for each valid destination record.
- best_time_to_visit is always present.
- If travel-season information is unavailable, best_time_to_visit must be null.
- No synthetic destination IDs may be generated.

### 3.4 Field Definitions

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| total | integer | Yes | Number of returned destinations |
| destinations | array | Yes | List of supported destinations |
| city_name | string | Yes | Destination name |
| description | string | Yes | Destination description |
| best_time_to_visit | string or null | Yes | Recommended travel period or unknown |

city_name, description, and best_time_to_visit are fields of each object inside destinations.

### 3.5 Empty Dataset Response — HTTP 200

If the dataset loads successfully but contains no destinations:

```json
{
  "total": 0,
  "destinations": []
}
```

An empty collection is a valid successful response and must not automatically produce HTTP 404.

### 3.6 Server Error — HTTP 500

If the dataset cannot be loaded or parsed because of an internal failure, the proposed public response is:

```json
{
  "detail": {
    "code": "DATASET_ERROR",
    "message": "Unable to load destination data."
  }
}
```

Internal paths, stack traces, and sensitive details must not be exposed.

### 3.7 Dataset Fields (No Mapping)

| Dataset Field | Response Field |
| --- | --- |
| city_name | city_name |
| description | description |
| best_time_to_visit | best_time_to_visit |

No field-name mapping is required. The service must supply `best_time_to_visit` as JSON null when travel-season information is unavailable.

Records missing required name or description information must not be silently converted into fabricated records. Dataset validation and handling of incomplete records must be agreed upon before deployment.

## 4. POST `/api/v1/requests/validate`

### 4.1 Description

Validate and normalize travel requirements submitted by the user.

The endpoint verifies that mandatory inputs are present and satisfy the shared TravelRequest schema.

It does not generate itineraries.

### 4.2 Request

- **Method:** POST
- **Path:** `/api/v1/requests/validate`
- **Content-Type:** application/json

### 4.3 Required Fields

| Field | Type | Constraint |
| --- | --- | --- |
| travelPeriod | object | Dates or month |
| durationDays | integer | At least 1 |
| departureLocation | string | Non-empty |
| travelers.count | integer | At least 1 |
| budget.amount | integer | At least 0 |
| budget.currency | string | VND |
| budget.scope | enum | group or perPerson |

### 4.4 Optional Fields

| Field | Description |
| --- | --- |
| limits | Maximum distance or travel time |
| preferences.destination | Preferred destination |
| preferences.transportation | Transportation preferences |
| preferences.interests | Interest categories and priorities |
| preferences.dining | Dining preferences |
| travelers.characteristics | Traveler group characteristics |

The exact nested field constraints are defined by the canonical shared schemas.

### 4.5 Request Example

```json
{
  "travelPeriod": {
    "month": "2026-12"
  },
  "durationDays": 2,
  "departureLocation": "Ho Chi Minh City",
  "travelers": {
    "count": 2
  },
  "budget": {
    "amount": 3000000,
    "currency": "VND",
    "scope": "group"
  },
  "preferences": {
    "destination": "Nha Trang",
    "transportation": ["car"],
    "interests": [
      {
        "type": "nature",
        "priority": 1
      }
    ]
  }
}
```

### 4.6 Success Response — HTTP 200

```json
{
  "valid": true,
  "data": {
    "travelPeriod": {
      "month": "2026-12"
    },
    "durationDays": 2,
    "departureLocation": "Ho Chi Minh City",
    "travelers": {
      "count": 2,
      "characteristics": []
    },
    "budget": {
      "amount": 3000000,
      "currency": "VND",
      "scope": "group"
    },
    "limits": null,
    "preferences": {
      "destination": "Nha Trang",
      "transportation": ["car"],
      "interests": [
        {
          "type": "nature",
          "priority": 1
        }
      ],
      "dining": null
    }
  }
}
```

Validation behavior:

- Do not invent missing mandatory values.
- Preserve user-defined constraints.
- Normalize supported input values where the shared input service explicitly allows it.
- Return data using public camelCase field names.
- Validation success does not imply that a feasible itinerary exists.

### 4.7 Validation Error — HTTP 422

Proposed normalized error structure:

```json
{
  "detail": {
    "code": "VALIDATION_ERROR",
    "missing": ["budget"],
    "conflicts": [],
    "messages": [
      "Enter the budget amount and whether it is per person or for the group."
    ],
    "errors": [
      {
        "field": "budget",
        "type": "missing",
        "message": "Field required"
      }
    ]
  }
}
```

### 4.8 Validation Error Rules

| Field | Description |
| --- | --- |
| code | Machine-readable error code |
| missing | Missing required fields |
| conflicts | Conflicting constraints |
| messages | Human-readable feedback |
| errors | Detailed field validation errors |

For malformed request bodies, including invalid JSON, FastAPI may return its default validation error format unless the backend implements a consistent exception handler.

The normalized response above is a proposed target for TPVA-33 and must be verified against the implementation.

### 4.9 Business Constraints

The current shared schema requires durationDays >= 1.

The MVP problem formulation targets itineraries of 1–3 days. Before enforcing an upper limit, M1 and M6 must agree on the rule and update both the Pydantic model and JSON Schema.

A structurally valid travel request is not automatically a feasible trip.

Budget, travel time, distance, availability, and scheduling feasibility are checked separately in the deterministic validation pipeline.

## 5. POST `/itineraries/generate`

### 5.1 Description

Generate a candidate itinerary using the Gemini-based AI service.

Status: Existing route; integration behavior may still evolve.

### 5.2 Request

- **Method:** POST
- **Path:** `/itineraries/generate`

The intended input is a validated TravelRequest object.

### 5.3 Success Response — HTTP 200

```json
{
  "status": "UNVERIFIED",
  "plan": {}
}
```

The empty plan object above is a response-envelope illustration only, not a valid CandidatePlan.

For a real successful generation, plan must follow `backend/app/schemas/candidate_plan.py` and its associated JSON Schema.

### 5.4 Candidate Plan Rules

The candidate schema defines:

- planId
- title
- destinationId
- days
- missingData
- assumptions

Each day includes activities and travel legs.

Activity fields include:

- activityId
- placeId
- type
- startTime
- endTime
- estimatedCostVnd
- costStatus
- reason

Unknown cost values must be null with the appropriate costStatus.

Candidate generation must respect the supported dataset and must not invent valid-looking place identifiers.

### 5.5 Verification Requirement

LLM output is never automatically feasible.

The AI service produces a candidate, and the deterministic validation module must evaluate the candidate before it can be marked feasible.

Pipeline:

Travel Request → Dataset Context → Gemini → Candidate Plan → Feasibility Validation → Ranking → Frontend

### 5.6 Upstream Errors

The generation endpoint may return:

- 422 — invalid candidate or request-related failure, as handled by the implementation
- 500 — internal configuration or server failure
- 502 — upstream generation failure
- 504 — upstream timeout

Error payloads must not expose API keys or internal secrets.

## 6. Candidate Itinerary Mock Data

### 6.1 Purpose

Mock itinerary responses allow the Frontend team to develop:

- Results pages
- Daily activity timelines
- Loading and empty states
- Cost displays
- Plan comparison components

without waiting for the complete AI and ranking pipeline.

### 6.2 Mock Requirements

Mock data must:

- Match the agreed candidate-plan schema.
- Use existing curated place identifiers where applicable.
- Preserve unknown costs, distances, and durations as null.
- Never claim an unverified candidate is feasible.
- Be explicitly marked as test data.
- Include representative successful and empty/error states.

The fixture `backend/tests/fixtures/mock_itinerary_response.json` may be used for Frontend testing.

An empty-state fixture alone is insufficient to test a populated activity timeline. A populated fixture should be added after stable dataset identifiers are available.

### 6.3 Feasibility Status

Candidate generation returns UNVERIFIED.

Any final feasibility states must be defined and supplied by the deterministic validation module, not independently invented by the AI generation layer.

## 7. Planned Itinerary Endpoints

The following endpoints are reserved for future integration. Their detailed request and response schemas have not yet been finalized.

### 7.1 POST `/itineraries/evaluate`

Evaluate candidate itinerary feasibility against:

- Budget
- Schedule conflicts
- Travel time
- Travel distance
- Available dataset information

### 7.2 POST `/itineraries/rank`

Rank validated candidate plans using agreed deterministic criteria.

The ranking rules must be documented and must not override mandatory feasibility constraints.

### 7.3 POST `/itineraries/revise`

Accept a revision request and recalculate the relevant plan constraints.

Any revised candidate must be validated again.

### 7.4 POST `/itineraries/select`

Allow a user to select a preferred itinerary.

Selection and persistence behavior must be agreed before this endpoint is implemented.

## 8. Frontend–Backend Integration Rules

### 8.1 Response Consistency

Frontend and Backend must agree on:

- HTTP methods and endpoint paths.
- Request and response field names.
- Required and optional fields.
- Nullable fields.
- Validation error responses.
- HTTP status codes.

### 8.2 Unknown Data Handling

Unknown data must not be converted into invented values.

For GET `/api/v1/destinations`, the field best_time_to_visit must always appear and must contain either a string or null.

Frontend must handle nullable values explicitly.

### 8.3 Dataset Identifiers

The current destination dataset does not define stable destination IDs.

Frontend must not assume that a destination ID exists in the destinations response until the dataset owner and Backend agree on stable identifiers.

This issue must be resolved before integrating candidate generation and selection flows that require destinationId.

### 8.4 Backend Documentation

FastAPI must expose:

- `/docs`
- `/openapi.json`

Generated OpenAPI documentation should match the implemented endpoint behavior and this agreed contract.
