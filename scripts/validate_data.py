#!/usr/bin/env python3
"""Validate data/*.json against schemas/*.schema.json plus cross-file checks.

Runs with the Python standard library only. Exits non-zero on any error.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCHEMAS = ROOT / "schemas"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID_RE = re.compile(r"^[a-z0-9-]+$")
URI_RE = re.compile(r"^https?://[^\s]+$")


def fail(msg, errors):
    errors.append(msg)


def check_uri(value, path, errors):
    if not isinstance(value, str) or not URI_RE.match(value):
        fail(f"{path}: expected an http(s) URL, got {value!r}", errors)


def check_date(value, path, errors):
    if not isinstance(value, str) or not DATE_RE.match(value):
        fail(f"{path}: expected YYYY-MM-DD date, got {value!r}", errors)
        return
    y, m, d = (int(p) for p in value.split("-"))
    if not (1 <= m <= 12 and 1 <= d <= 31):
        fail(f"{path}: invalid date {value!r}", errors)


def check_sources(sources, path, errors):
    if not isinstance(sources, list) or not sources:
        fail(f"{path}: at least one source is required", errors)
        return
    for i, src in enumerate(sources):
        sp = f"{path}[{i}]"
        if not isinstance(src, dict) or set(src) != {"title", "url"}:
            fail(f"{sp}: source must have exactly 'title' and 'url'", errors)
            continue
        if not isinstance(src["title"], str) or not src["title"].strip():
            fail(f"{sp}.title: must be a non-empty string", errors)
        check_uri(src["url"], f"{sp}.url", errors)


def validate_companies(doc, errors):
    if not isinstance(doc, dict):
        fail("companies.json: root must be an object", errors)
        return {}
    for key in ("version", "updated", "companies"):
        if key not in doc:
            fail(f"companies.json: missing required key '{key}'", errors)
    check_date(doc.get("updated"), "companies.updated", errors)
    companies = doc.get("companies")
    if not isinstance(companies, list) or not companies:
        fail("companies.json: 'companies' must be a non-empty array", errors)
        return {}
    ids = {}
    for i, c in enumerate(companies if isinstance(companies, list) else []):
        p = f"companies[{i}]"
        for key in ("id", "name", "type", "segment", "website", "selected", "selection_reason"):
            if key not in c:
                fail(f"{p}: missing required key '{key}'", errors)
        cid = c.get("id", "")
        if not isinstance(cid, str) or not ID_RE.match(cid):
            fail(f"{p}.id: must match ^[a-z0-9-]+$, got {cid!r}", errors)
        elif cid in ids:
            fail(f"{p}.id: duplicate company id '{cid}'", errors)
        else:
            ids[cid] = c
        if c.get("type") not in ("big-tech", "ai-lab"):
            fail(f"{p}.type: must be 'big-tech' or 'ai-lab', got {c.get('type')!r}", errors)
        if c.get("ticker") is not None:
            if not isinstance(c["ticker"], str) or not re.match(r"^[A-Z.]+$", c["ticker"]):
                fail(f"{p}.ticker: must be uppercase ticker or null", errors)
        check_uri(c.get("website"), f"{p}.website", errors)
        if not isinstance(c.get("selected"), bool):
            fail(f"{p}.selected: must be boolean", errors)
    return ids


def validate_events(doc, company_ids, errors):
    if not isinstance(doc, dict):
        fail("events.json: root must be an object", errors)
        return []
    for key in ("version", "updated", "events"):
        if key not in doc:
            fail(f"events.json: missing required key '{key}'", errors)
    check_date(doc.get("updated"), "events.updated", errors)
    events = doc.get("events")
    if not isinstance(events, list):
        fail("events.json: 'events' must be an array", errors)
        return []
    seen = set()
    for i, ev in enumerate(events):
        p = f"events[{i}]"
        for key in ("id", "type", "company", "date", "announced", "size", "size_is_estimate", "scope", "reason", "ai_related", "sources"):
            if key not in ev:
                fail(f"{p}: missing required key '{key}'", errors)
        eid = ev.get("id", "")
        if not isinstance(eid, str) or not ID_RE.match(eid):
            fail(f"{p}.id: must match ^[a-z0-9-]+$, got {eid!r}", errors)
        elif eid in seen:
            fail(f"{p}.id: duplicate event id '{eid}'", errors)
        else:
            seen.add(eid)
        if ev.get("type") not in ("layoff", "hiring"):
            fail(f"{p}.type: must be 'layoff' or 'hiring', got {ev.get('type')!r}", errors)
        if ev.get("company") not in company_ids:
            fail(f"{p}.company: unknown company '{ev.get('company')}' (must exist in companies.json)", errors)
        check_date(ev.get("date"), f"{p}.date", errors)
        check_date(ev.get("announced"), f"{p}.announced", errors)
        size = ev.get("size")
        if size is not None and (not isinstance(size, int) or isinstance(size, bool) or size < 0):
            fail(f"{p}.size: must be a non-negative integer or null, got {size!r}", errors)
        if not isinstance(ev.get("size_is_estimate"), bool):
            fail(f"{p}.size_is_estimate: must be boolean", errors)
        pct = ev.get("percent_of_workforce")
        if pct is not None and (not isinstance(pct, (int, float)) or isinstance(pct, bool) or not 0 < pct <= 100):
            fail(f"{p}.percent_of_workforce: must be a number in (0, 100] or null", errors)
        if not isinstance(ev.get("ai_related"), bool):
            fail(f"{p}.ai_related: must be boolean", errors)
        check_sources(ev.get("sources"), f"{p}.sources", errors)
        if ev.get("type") == "layoff" and size is None:
            fail(f"{p}: layoff events should carry a size when known (use size=null only for symbolic events)", errors)
    return events


def validate_headcount(doc, company_ids, errors):
    if not isinstance(doc, dict):
        fail("headcount.json: root must be an object", errors)
        return
    for key in ("version", "updated", "snapshots"):
        if key not in doc:
            fail(f"headcount.json: missing required key '{key}'", errors)
    check_date(doc.get("updated"), "headcount.updated", errors)
    snaps = doc.get("snapshots")
    if not isinstance(snaps, list):
        fail("headcount.json: 'snapshots' must be an array", errors)
        return
    for i, s in enumerate(snaps):
        p = f"snapshots[{i}]"
        for key in ("company", "as_of", "employees", "is_estimate", "basis", "sources"):
            if key not in s:
                fail(f"{p}: missing required key '{key}'", errors)
        if s.get("company") not in company_ids:
            fail(f"{p}.company: unknown company '{s.get('company')}'", errors)
        check_date(s.get("as_of"), f"{p}.as_of", errors)
        emp = s.get("employees")
        if not isinstance(emp, int) or isinstance(emp, bool) or emp < 1:
            fail(f"{p}.employees: must be a positive integer, got {emp!r}", errors)
        if not isinstance(s.get("is_estimate"), bool):
            fail(f"{p}.is_estimate: must be boolean", errors)
        check_sources(s.get("sources"), f"{p}.sources", errors)


def main():
    errors = []
    docs = {}
    for name in ("companies", "events", "headcount"):
        path = DATA / f"{name}.json"
        try:
            docs[name] = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            fail(f"{path}: file not found", errors)
        except json.JSONDecodeError as e:
            fail(f"{path}: invalid JSON: {e}", errors)
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1

    company_ids = validate_companies(docs["companies"], errors)
    validate_events(docs["events"], company_ids, errors)
    validate_headcount(docs["headcount"], company_ids, errors)

    layoffs = [e for e in docs["events"].get("events", []) if e.get("type") == "layoff"]
    hirings = [e for e in docs["events"].get("events", []) if e.get("type") == "hiring"]
    total_laid = sum(e["size"] for e in layoffs if e.get("size"))
    print(f"OK: {len(company_ids)} companies, {len(layoffs)} layoff events ({total_laid:,} announced roles), "
          f"{len(hirings)} hiring events, {len(docs['headcount'].get('snapshots', []))} headcount snapshots.")
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
