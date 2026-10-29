"""Manual smoke test against the real Gemini API (needs GEMINI_API_KEY in backend/.env).

    cd backend && python -m scripts.gemini_demo > tests/fixtures/live_demo_output.json
"""
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

from app.services.ai.gemini_client import GeminiError
from app.services.ai.itinerary_generator import generate_candidate

load_dotenv()
FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"

if __name__ == "__main__":
    dataset = json.loads((FIX / "sample_dataset.json").read_text(encoding="utf-8"))
    request = json.loads((FIX / "travel_request.json").read_text(encoding="utf-8"))
    try:
        print(json.dumps(generate_candidate(request, dataset), ensure_ascii=False, indent=2))
    except GeminiError as e:
        print(f"FAILED {e.code} status={e.status or '-'} {e.message}", file=sys.stderr)
        if e.details:
            print(e.details if isinstance(e.details, str) else json.dumps(e.details, ensure_ascii=False, indent=2), file=sys.stderr)
        sys.exit(1)
