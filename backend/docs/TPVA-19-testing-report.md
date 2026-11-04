# TPVA-19 - Gemini Itinerary Generation Testing Report

## Overview
Module: M3 - AI Itinerary Generation

Task: Generate itineraries using Python Gemini SDK.

## Environment
- Python 3.13.7
- Google Gen AI SDK
- Model: gemini-3.5-flash-lite
- Test framework: pytest

## Test Results

| Test | Result |
|---|---|
| Gemini SDK import | PASS |
| API key configuration | PASS |
| Live Gemini connection | PASS |
| Live itinerary generation | PASS |
| Pydantic schema validation | PASS |
| Dataset grounding | PASS |
| Request alignment | PASS |
| HTTP 503 retry test | PASS |
| Automated tests | 65 passed, 1 warning |

## Live Integration Test

Input:
- Destination: DN (Da Nang - Hoi An)
- Duration: 2 days
- Travel month: December 2026
- Group size: 2
- Budget: 8,000,000 VND
- Interests: culture, relaxation
- Dining preference: mi Quang

Output:
- Generated 2 consecutive itinerary days
- Used only dataset-supported place IDs
- Preserved unknown costs as NO_DATA
- Preserved unknown travel durations as null
- Returned a valid CandidatePlan

Results:
- Schema errors: 0
- Grounding errors: 0
- Live generation time: 2.69 seconds

## Issues Encountered

1. HTTP 404 with gemini-2.5-flash.
2. HTTP 504 and 503 with gemini-3.8-flash.
3. HTTP 503 with gemini-3.1-flash-lite.
4. Retry unit test failed because GEMINI_MAX_RETRIES=0.
5. Local Git exclude path was initially incorrect.

## Resolutions

- Selected gemini-3.5-flash-lite after a successful live API test.
- Configured model and timeout using environment variables.
- Restored default retry configuration using:
  unset GEMINI_MAX_RETRIES
- Verified retry handling and reran all automated tests.
- Used the repository's Git exclude path for local test output.

## Limitations

- Tested using the M3 fixture dataset, not the finalized M2 dataset.
- Budget feasibility and travel feasibility are not yet verified.
- The Starlette deprecation warning remains non-blocking.

## Conclusion

TPVA-19 prototype generation passed automated and live integration tests.

Final Jira completion depends on acceptance criteria review.
