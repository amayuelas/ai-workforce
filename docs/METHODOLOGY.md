# Methodology

How the AI Workforce Tracker measures layoffs and hiring, and the caveats you should know before quoting the numbers.

## Scope: who we track

We track a curated set of **14 companies** (`data/companies.json`):

- **Big Tech** with the largest workforces and AI investments: Alphabet, Amazon, Apple, Meta, Microsoft, NVIDIA, Oracle, Tesla, Intel.
- **Frontier AI labs**: OpenAI, Anthropic, xAI (merged into SpaceX in Feb 2026), DeepSeek, Mistral AI.

Inclusion criteria: size of workforce, AI relevance (capex, product surface, or being an AI lab), and availability of reliable public reporting. Companies can be added/removed via PR; each entry records its `selection_reason`.

## What counts as an event

An **event** (`data/events.json`) is a publicly announced workforce action:

- `type: "layoff"` — an announced reduction in force with a stated or derivable size (e.g. "10% of workforce", "~15,000 roles").
- `type: "hiring"` — an announced hiring plan with a quantified target (e.g. OpenAI's plan to grow from ~4,500 to ~8,000), a landmark talent acquisition/acqui-hire, or a merger that absorbs another company's workforce.

Each event carries: `date` (effective/announced), `size` (roles, `null` when not quantifiable) with `size_is_estimate`, optional `percent_of_workforce`, `scope`, `reason`, an `ai_related` flag, a **`confidence` tier**, and **≥1 source URL**.

### What gets counted in totals

Some events are workforce news but not layoffs or hires in the counting sense. An optional `kind` field marks them:

| `kind` | Used for | Counted as |
|---|---|---|
| *(none)* | ordinary layoffs and hiring plans | `size` |
| `buyout_offer` | voluntary exit / retirement programs; `eligible` = people offered the package | accepted departures (`size`), `null` (not counted) until acceptances are reported. The eligible pool is never counted. |
| `internal_redeployment` | existing staff moved into a new unit (Microsoft Frontier Co., Meta's AI-team reassignments) | not counted, not new hiring |
| `multi_company` | a group estimate spanning several labs that overlaps per-lab plans | not counted, shown for context |

All totals, charts and the coverage check use the same rule (`AIW.counted` in `assets/js/app.js`, `counted_size` in `scripts/validate_data.py`).

When the reduction is measured rather than announced (e.g. Oracle's 10-K headcount drop), `date` is the period end it is measured at and `announced` is the disclosure date.

### Confidence tiers (robustness)

Every event is tagged with one of three tiers, shown on the site and filterable on LayoffsBench:

| Tier | Meaning | Typical source |
|---|---|---|
| `high` | The company itself stated the number | Newsroom post, CEO memo, SEC filing (10-K/10-Q/8-K) |
| `medium` | Reputable wire outlet reporting unconfirmed figures | Reuters, Bloomberg, CNBC, BBC, AP, FT, WSJ citing sources/memos |
| `low` | Single secondary source or aggregator | One outlet, or tracker-derived; directional only |

The current mix is computed live on the site's WorkforceBench view (section "How robust is this tracker?"). Figures marked `size_is_estimate` additionally carry the "~"/"about" qualifier.

### Signed convention

Layoffs are counted **negative**, hirings **positive** (`signed = -size` for layoffs, `+size` for hirings). All charts and tables use this convention; the WorkforceBench view shows the net flow by quarter (empty quarters included) and an event timeline.

### The `ai_related` flag

`true` only when the company or the reporting explicitly attributes the move to AI — either "AI replaced these roles" (e.g. Oracle's FY2026 10-K language, Amazon's Oct 2025 memo) or "to fund AI investment" (Meta's 2026 cuts). We do not infer AI causation ourselves; that is the "AI-washing" trap. Where attribution is ambiguous, the flag is `false` and the `reason` text quotes the stated rationale.

## Sources and reliability (the hard part)

Layoffs are announced, not observed, so the tracker is deliberately conservative:

1. **Tier 1 — primary:** company newsroom posts, CEO memos, SEC filings (10-K/10-Q/8-K, WARN-adjacent disclosures). Used for headcount snapshots of all public companies and for company-stated layoff plans (Meta, Intel, Google/Alphabet, Amazon memos).
2. **Tier 2 — wire/news:** Reuters, Bloomberg, CNBC, BBC, AP, WSJ/FT when they cite named sources or internal memos. Used for reported-but-unconfirmed figures, always marked `size_is_estimate: true`.
3. **Tier 3 — trackers/aggregators** (Layoffs.fyi, TrueUp): referenced for industry context only, never as the sole source for a tracked event.

Rules enforced by `scripts/validate_data.py` and review:

- Every event and headcount snapshot has **at least one URL**; more for contested numbers.
- Sizes from "~" or "about" phrasing are marked `size_is_estimate: true`.
- Private-lab headcounts (OpenAI, Anthropic, DeepSeek, xAI) are media estimates (`is_estimate: true`) because these companies do not file; we prefer company-spokesperson figures (e.g. Anthropic ">3,500" via WSJ) over scraped estimates.

## Headcount time series (`data/headcount.json`)

This is the **reliable hiring signal**, because most hiring is never announced. Public companies: the annual employee count from each Form 10-K, plotted at fiscal year-end (year-ends differ: Dec 31 for Alphabet/Amazon/Meta/Tesla, Jun 30 Microsoft, late Sep Apple, late Jan NVIDIA, last Saturday of Dec Intel, May 31 Oracle). Every public company starts at FY2015 (NVIDIA at FY2016, which ended Jan 31, 2016). 2026 also carries 10-Q quarter-end points where disclosed. Private labs: dated media estimates, `is_estimate: true`, drawn as hollow markers on the site. Year-over-year deltas mix gross hiring, layoffs, attrition, and M&A — they are net headcount change, not gross hires.

## The two measurement methods (and why both)

Layoffs and hiring need different instruments, because they differ in observability:

1. **Announced events** (`events.json`) — reliable for **layoffs** (companies announce big cuts; WARN filings corroborate) but only a lower bound for **hiring** (most hiring is never announced). Signed convention: layoffs negative, hirings positive. Shown as timelines, bubbles and flow charts. We also capture **rolling/unannounced cuts** where outside estimates exist (e.g. Google 2026, flagged `size_is_estimate` + medium confidence) and **voluntary buyout programs** (`kind: buyout_offer`), which count accepted departures only: see "What gets counted in totals".
2. **Reported headcount** (`headcount.json`) — the employee count from each 10-K/10-Q, the reliable signal for **net workforce change**. WorkforceBench plots it three ways:
   - **Indexed** (default): each company's FY2015 count = 100, on a log axis so equal slopes mean equal growth rates. No point is invented: lines start at each company's first filing.
   - **YoY %**: each point is compared with the snapshot one fiscal year earlier (0.9–1.1 years apart). Quarter-end 10-Q points with no year-ago match are skipped, so mixed annual/quarterly data never produces a fake 3-month "YoY".
   - **Headcount levels** (log axis), the only view that shows the private AI labs, as single hollow markers. Indexing a one-point series would draw a meaningless flat "100" line.

   It also derives two metrics per company, both over the **latest pair of snapshots one fiscal year apart** (so a trailing 10-Q quarter doesn't silently drop a company):
   - latest YoY **net** change, and
   - **implied gross hiring** = net change + layoffs dated inside that same fiscal-year window `(previous filing, latest filing]`. Example: Microsoft FY2026 (Jul 1, 2025 – Jun 30, 2026) counts the Jul 2025 9,000 cut and ~2,600 accepted retirement buyouts. Headcount fell 5,000, so implied gross hiring was at least ~6,600. Cuts announced after Jun 30, 2026 belong to FY2027. If the result is negative, headcount fell by more than announced layoffs explain (attrition or unannounced cuts; e.g. Intel FY2025). It ignores attrition, so it is a lower bound on actual hiring.

   LinkedIn-profile counts are **not** used for any time series: they are not time-stamped officially, overcount (former employees, duplicates, test accounts) and their methodology changes without notice. The one exception is Mistral AI's single point (Revelio Labs, LinkedIn-based), kept because no better public figure exists and flagged as an order-of-magnitude estimate (sources range ~350–1,760). 10-K counts remain the reference.

The three views: **WorkforceBench** = both methods side by side; **LayoffsBench** = announced layoff events (timeline, by year/company, AI-attributed share) plus filing-based net change for affected companies; **HiringsBench** = filing-based net headcount growth plus announced hiring events.

## Known limitations

- **Announced ≠ realized.** Announced layoff counts include attrition and unfilled-role closures in some company framings (e.g. Intel's "workforce reductions and attrition"); we record the announced figure and describe the nuance in `scope`.
- **Layoffs and announced hiring plans are different units.** A "layoff" is a lost role; a "hiring plan" is a target that may not be filled (e.g. OpenAI's 4,500→8,000 plan). Announced hiring is a strict lower bound on actual hiring — the headcount time series is the reliable measure of net workforce change.
- **Net headcount change ≠ gross hiring, and ≠ gross layoffs.** Year-end deltas mix hiring, layoffs, attrition and M&A across all areas of a company (e.g. Microsoft flat at 228,000 through FY2025 despite ~15,000 announced cuts; Activision added ~13,000 in FY2024; Meta grew +4,798 in 2025 while cutting ~10,000 more roles in early 2026). Use the implied-gross-hiring metric (net + announced layoffs) to approximate actual hiring; treat it as an estimate since announced layoffs are themselves announcement figures.
- **Coverage is announcement-driven, not census-driven.** We capture events big enough to be publicly announced or estimated by trackers; small rolling cuts are undercounted except where estimated (Google 2026). Cross-check against Layoffs.fyi/TrueUp/Skillsyncer industry totals (which count differently — e.g. Layoffs.fyi: 128,536 cuts by Sep 10, 2026; Skillsyncer: 210,741+ by Sep 19, 2026) before quoting industry-wide numbers.
- **Buyout offers ≠ separations.** Voluntary programs count accepted departures, never the eligible pool: Microsoft's May 2026 retirement program (8,750 eligible, >30% accepted) counts ~2,600; its Oct 2026 offer to ~60,000 is logged with `size: null` until acceptances are reported.
- **"Hiring" headlines that move existing staff are not hiring.** Microsoft Frontier Co. (6,000) and Meta's 7,000 redirected to AI teams are `internal_redeployment` and excluded from totals.
- **Layoffs.fyi-style trackers count differently** (per-company rolling cuts vs. single announcements), so our totals will not match theirs exactly.
- **Point-in-time headcount** for private labs can vary widely between sources (e.g. Anthropic estimates range ~2,500–5,000 across 2026); we pick the most authoritative dated figure and link it.
- **Amazon's workforce is ~90% logistics/warehouse**; its corporate layoff percentages apply to a ~350k corporate base, not the 1.5M+ total — percentages in events refer to the stated base.

## Reproducibility

```bash
python3 scripts/validate_data.py   # validates all data files + cross-references
python3 -m http.server 8000         # serve the site locally
```

CI (`.github/workflows/validate-data.yml`) runs the validator on every PR and push to `main`.
