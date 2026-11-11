"""Run the TPVA-54 Huế acceptance scenarios against a running backend.

Usage (from backend/):
    python -m scripts.run_acceptance_scenarios --base-url http://localhost:3001 \
        [--osrm-timeout-base-url http://localhost:3002] --out ../docs/evidence/tpva-54

Each scenario's request and raw JSON response is saved, then compared with the
expected result in tests/fixtures/acceptance/hue_scenarios.json. A scenario that
needs a credential or service that is not configured is reported as BLOCKED, never
as PASS. This script only calls existing endpoints; it changes no data.
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "acceptance" / "hue_scenarios.json"


def load_scenarios():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["scenarios"]


def _codes(body):
    return sorted({c.get("code") for c in body.get("checks", []) if isinstance(c, dict)})


def judge(scenario, http, body):
    """Return (verdict, notes). Verdict is PASS, FAIL or BLOCKED."""
    exp = scenario["expected"]
    notes = []
    if isinstance(body, dict) and body.get("error") == "CONFIG" and "GEMINI_API_KEY" in scenario.get("requires", []):
        return "BLOCKED", ["GEMINI_API_KEY is not configured on this server; Gemini was not called."]
    allowed = [int(x) for x in str(exp["http"]).split("|")]
    if http not in allowed:
        notes.append(f"HTTP {http}, expected {exp['http']}")
    if not isinstance(body, dict):
        notes.append("response is not a JSON object")
        return ("FAIL" if notes else "PASS"), notes
    status = body.get("status")
    if "status" in exp and http == 200 and status != exp["status"]:
        notes.append(f"status {status}, expected {exp['status']}")
    if "notStatus" in exp and status == exp["notStatus"]:
        notes.append(f"status must not be {exp['notStatus']}")
    if "statusOrError" in exp and status not in exp["statusOrError"] and body.get("error") not in exp["statusOrError"]:
        notes.append(f"status/error {status or body.get('error')}, expected one of {exp['statusOrError']}")
    for code in exp.get("codes", []):
        if code not in _codes(body):
            notes.append(f"check code {code} not reported")
    if exp.get("json"):
        for key, value in exp["json"].items():
            if body.get(key) != value:
                notes.append(f"{key}={body.get(key)!r}, expected {value!r}")
    if exp.get("detailList") and not isinstance(body.get("detail"), list):
        notes.append("expected FastAPI {detail: [...]} body")
    if exp.get("noDestinationInData"):
        dest = ((body.get("data") or {}).get("preferences") or {}).get("destination")
        if dest:
            notes.append(f"destination was filled in as {dest!r}")
    if "rankedCount" in exp and len(body.get("ranked", [])) != exp["rankedCount"]:
        notes.append(f"ranked has {len(body.get('ranked', []))} plans, expected {exp['rankedCount']}")
    for plan_id in exp.get("excludedIds", []):
        if plan_id not in {item.get("planId") for item in body.get("excluded", [])}:
            notes.append(f"{plan_id} not in excluded")
    if exp.get("flagged") and http == 200:
        flagged = [c for c in body.get("checks", []) if c.get("status") != "FEASIBLE" and
                   any(w in (c.get("code") or "") for w in ("DUPLICATE", "REPEAT", "LEG_ENDPOINTS", "LEG_ORDER"))]
        if not flagged:
            notes.append("no check flags the repeated stop (only generic data checks)")
    if "routingStatusNot" in exp:
        routes = ((body.get("components") or {}).get("routing") or {}).get("routes") or []
        if not routes:
            notes.append("components.routing.routes missing")
        for route in routes:
            if route.get("evidenceStatus") == exp["routingStatusNot"]:
                notes.append("route marked VERIFIED despite provider failure")
    return ("FAIL" if notes else "PASS"), notes


def run(base_urls, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for scenario in load_scenarios():
        server = scenario.get("server", "default")
        base = base_urls.get(server)
        record = {"id": scenario["id"], "title": scenario["title"], "endpoint": scenario["endpoint"],
                  "server": server, "owner": scenario["owner"], "expected": scenario["expected"],
                  "rule": scenario["rule"]}
        if not base:
            record.update(verdict="BLOCKED", notes=[f"no base URL for server profile '{server}'"])
            results.append(record)
            continue
        url = base.rstrip("/") + scenario["endpoint"]
        if "raw" in scenario:
            record["requestRaw"] = scenario["raw"]
            resp = httpx.post(url, content=scenario["raw"], headers={"Content-Type": "application/json"}, timeout=60)
        else:
            record["request"] = scenario["body"]
            resp = httpx.post(url, json=scenario["body"], timeout=60)
        try:
            body = resp.json()
        except ValueError:
            body = resp.text
        verdict, notes = judge(scenario, resp.status_code, body)
        record.update(httpStatus=resp.status_code, response=body, verdict=verdict, notes=notes,
                      actualStatus=body.get("status") if isinstance(body, dict) else None,
                      actualError=body.get("error") if isinstance(body, dict) else None,
                      checkCodes=_codes(body) if isinstance(body, dict) else [])
        (out_dir / f"{scenario['id']}.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        results.append(record)
    summary = {
        "ranAt": datetime.now(timezone.utc).isoformat(),
        "baseUrls": base_urls,
        "geminiKeyConfigured": bool(os.getenv("GEMINI_API_KEY")),
        "counts": {v: sum(r["verdict"] == v for r in results) for v in ("PASS", "FAIL", "BLOCKED")},
        "results": [{k: r.get(k) for k in ("id", "endpoint", "httpStatus", "actualStatus", "actualError",
                                           "checkCodes", "verdict", "notes", "owner")} for r in results],
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3001")
    parser.add_argument("--osrm-timeout-base-url", default=None)
    parser.add_argument("--out", default="../docs/evidence/tpva-54")
    args = parser.parse_args()
    summary = run({"default": args.base_url, "osrm_timeout": args.osrm_timeout_base_url}, Path(args.out))
    for row in summary["results"]:
        print(f"{row['verdict']:8} {row['id']:40} HTTP {row['httpStatus']} {row['actualStatus'] or row['actualError'] or ''} {'; '.join(row['notes'] or [])}")
    print(summary["counts"])


if __name__ == "__main__":
    main()
