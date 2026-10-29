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

### Confidence tiers (robustness)

Every event is tagged with one of three tiers, shown on the site and filterable on LayoffsBench:

| Tier | Meaning | Typical source |
|---|---|---|
| `high` | The company itself stated the number | Newsroom post, CEO memo, SEC filing (10-K/10-Q/8-K) |
| `medium` | Reputable wire outlet reporting unconfirmed figures | Reuters, Bloomberg, CNBC, BBC, AP, FT, WSJ citing sources/memos |
| `low` | Single secondary source or aggregator | One outlet, or tracker-derived; directional only |

The current mix is computed live on the site's Total view (section "How robust is this tracker?"). Figures marked `size_is_estimate` additionally carry the "~"/"about" qualifier.

### Signed convention

Layoffs are counted **negative**, hirings **positive** (`signed = -size` for layoffs, `+size` for hirings). All charts and tables use this convention; the Total view shows the net flow by quarter and a per-company evolution timeline.

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

## Headcount snapshots (`data/headcount.json`)

Public companies: official employee counts from the latest 10-K/10-Q (note fiscal years end on different dates — NVIDIA/Intel/Amazon end in January, Microsoft June 30, Apple late September, Oracle May 31). Private labs: most recent credible media report, labelled as an estimate. Snapshots are point-in-time; they are **not** a continuous series, and fiscal-year-end differences mean year-over-year deltas mix hiring, layoffs, attrition, and M&A.

## LayoffsBench / HiringsBench / Total

- **LayoffsBench** sums announced layoff sizes by year and company and shows the AI-attributed share.
- **HiringsBench** shows quantified hiring plans and latest headcounts.
- **Total** aggregates both, including a net (hiring − layoffs) view per year.

## Known limitations

- **Announced ≠ realized.** Announced layoff counts include attrition and unfilled-role closures in some company framings (e.g. Intel's "workforce reductions and attrition"); we record the announced figure and describe the nuance in `scope`.
- **Layoffs and hirings are different units.** A "layoff" is a lost role; a "hiring plan" is a target that may not be filled (e.g. OpenAI's 4,500→8,000 plan). The net view is indicative, not a headcount delta.
- **Coverage is announcement-driven, not census-driven.** We capture events big enough to be publicly announced; small rolling cuts (e.g. Google's unannounced 2026 reductions, estimated 1.5–3k) are undercounted. Cross-check against Layoffs.fyi/TrueUp industry totals (which count differently) before quoting.
- **Layoffs.fyi-style trackers count differently** (per-company rolling cuts vs. single announcements), so our totals will not match theirs exactly.
- **Point-in-time headcount** for private labs can vary widely between sources (e.g. Anthropic estimates range ~2,500–5,000 across 2026); we pick the most authoritative dated figure and link it.
- **Amazon's workforce is ~90% logistics/warehouse**; its corporate layoff percentages apply to a ~350k corporate base, not the 1.5M+ total — percentages in events refer to the stated base.

## Reproducibility

```bash
python3 scripts/validate_data.py   # validates all data files + cross-references
python3 -m http.server 8000         # serve the site locally
```

CI (`.github/workflows/validate-data.yml`) runs the validator on every PR and push to `main`.
