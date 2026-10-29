# Contributing

Thanks for helping keep the AI Workforce Tracker accurate. This project is data-first: the site is generated from plain JSON in `data/`, so most contributions are data PRs.

## Adding a layoff or hiring event

1. Edit `data/events.json` and add an entry with:
   - unique `id` (`company-YYYY-MM-slug`), `type` (`layoff`/`hiring`), `company` (must exist in `data/companies.json`), `date` and `announced` (YYYY-MM-DD)
   - `size` (roles; `null` only when not quantifiable, e.g. a pure acqui-hire) and `size_is_estimate` (`true` for "~"/"about"/reported figures)
   - optional `percent_of_workforce` (relative to the base the company stated)
   - optional `kind`: `buyout_offer` (with `eligible` = people offered; `size` = accepted departures or `null` until known), `internal_redeployment` (existing staff moved, never counted as hiring), or `multi_company` (group estimate, never counted)
   - `scope`, `reason`, `ai_related` (see [METHODOLOGY.md](docs/METHODOLOGY.md) — only set `true` when the company or reporting explicitly attributes the move to AI)
   - `sources`: **at least one URL**. Prefer company newsroom / SEC filing > Reuters, Bloomberg, CNBC, BBC, AP, WSJ, FT > other press.
2. If it is a layoff at a company listed in `data/coverage.json`, update that row's `ours_since_2022` (and the `industry` row).
3. Run `python3 scripts/validate_data.py`; it must print `OK`.
4. Open a PR using the template. CI re-runs the validator.

## Updating headcount

Add a snapshot to `data/headcount.json`: public companies from the latest 10-K/10-Q employee count; private labs from the best dated media report with `is_estimate: true`. Always include a source URL.

## Adding a company

Add an entry to `data/companies.json` with a `selection_reason`. Keep the list curated — propose additions in an issue first if unsure.

## Site changes

The site is vanilla HTML/CSS/JS in the repo root and `assets/`; no build step. Test locally with `python3 -m http.server 8000`. Keep pages dependency-free so GitHub Pages can serve them as-is.

## Code of conduct for data

- Never submit numbers without a source link.
- Never infer AI causation; quote the stated reason.
- Mark estimates as estimates.
- Respect the people affected: no mocking, no scraped personal data.
