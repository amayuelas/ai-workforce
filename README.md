# ⚖️ AI Workforce Tracker

A public dashboard tracking **layoffs and hiring at the main tech companies and AI labs**, served as a static website from this repository via **GitHub Pages**.

Three views:

| View | Page | What it shows |
|---|---|---|
| **Total** | [`index.html`](https://amayuelas.github.io/ai-workforce/) | Aggregate KPIs, net workforce change by year, largest layoffs, all events |
| **LayoffsBench** | [`layoffs.html`](https://amayuelas.github.io/ai-workforce/layoffs.html) | Announced layoffs by year and company, AI-attributed share, filterable event log |
| **HiringsBench** | [`hirings.html`](https://amayuelas.github.io/ai-workforce/hirings.html) | Hiring plans, talent moves, latest reported headcount per company |

## Tracked companies

14 companies are currently tracked — the Big Tech companies with the largest AI investments and workforces, plus the frontier AI labs:

- **Big Tech:** Alphabet (Google), Amazon, Apple, Meta, Microsoft, NVIDIA, Oracle, Tesla, Intel
- **AI labs:** OpenAI, Anthropic, xAI (SpaceX), DeepSeek, Mistral AI

The full list with selection rationale lives in [`data/companies.json`](data/companies.json).

## How the data works

All data is plain, reviewable JSON in [`data/`](data/):

- `companies.json` — the tracked companies and why each is included
- `events.json` — every layoff / hiring event: date, size, % of workforce, scope, reason, `ai_related` flag, and **at least one source URL per event**
- `headcount.json` — latest reported headcount snapshots (SEC filings for public companies; labelled media estimates for private labs)

Schemas live in [`schemas/`](schemas/) and every change is checked in CI by [`scripts/validate_data.py`](scripts/validate_data.py), which enforces structure, cross-file references, date formats, and mandatory source links.

## Adding or correcting data

1. Add/edit an entry in the relevant `data/*.json` file, with **at least one source URL** (company newsroom, SEC filing, Reuters/Bloomberg/CNBC/BBC, or a primary memo).
2. Run `python3 scripts/validate_data.py` locally.
3. Open a PR — CI re-runs the validator and must pass.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full checklist and [docs/METHODOLOGY.md](docs/METHODOLOGY.md) for definitions, caveats, and how layoffs vs. hirings are measured.

## Run locally

Any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

There is no build step and no runtime dependency — the site is vanilla HTML/CSS/JS that fetches the JSON files directly.

## Project layout

```
├── index.html / layoffs.html / hirings.html   # the three views (GitHub Pages root)
├── assets/                                    # css + js (no external libraries)
├── data/                                      # companies.json, events.json, headcount.json
├── schemas/                                   # JSON schemas for the data files
├── scripts/validate_data.py                   # stdlib-only validator, run in CI
├── docs/METHODOLOGY.md                        # definitions, sourcing rules, caveats
└── .github/workflows/                         # validate-data + pages deployment
```

## License

Data and content: [CC BY 4.0](LICENSE). Code: MIT.
