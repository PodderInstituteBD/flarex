# FLAREX — Fire Learning and Research Explorer

> **"Turning Microgravity Combustion Data into Space Fire Safety Insights."**  
> NASA Space Apps Challenge 2026 — *Flame in Freefall*

FLAREX is an independent, student-developed scientific research explorer built to organize, audit, compare, and explain microgravity combustion and spacecraft fire safety investigations. It is **not** an official NASA product and has no official NASA affiliation or endorsement.

---

## Core Architecture & Features

- **Overview Dashboard (`src/pages/HomeOverview.tsx`)**: Computes KPI metrics directly from the 16-record curated research database (`src/data/researchDatabase.json`), distinguishing NASA microgravity investigations, review papers, complementary 1g terrestrial studies, quantitative summaries, and records without locally embedded raw telemetry.
- **Investigation Explorer & Details (`src/pages/InvestigationExplorer.tsx`, `src/pages/InvestigationDetails.tsx`)**: Debounced text search, multi-facet filters (dossier family, evidence classification, platform, data availability), chronological/name sorting (`year-desc`, `year-asc`), acronym badges, source identifier tags (`PSI`, `NTRS`, `DOI`), per-record schema completeness badges, and a structured 4-parameter environmental grid (`Oxygen Concentration`, `Pressure`, `Temperature / Heat Flux`, `Airflow / Ventilation`) preserving missing values as `"Not available in the reviewed source."`.
- **Investigation Comparison (`src/pages/InvestigationComparison.tsx`)**: Side-by-side comparison of 2–3 studies across 18 scientific dimensions with difference/alignment summary badges, a `"Differences Only"` filter toggle, and automatic 0g vs. 1g / electrostatic / planned-campaign provenance cautions.
- **Scientific Data Explorer (`src/pages/ScientificDataExplorer.tsx`)**: Lazy-loaded analytics workbench featuring quantitative condition visualizations (`Recharts` bar chart, timeline scatter chart of start year vs. active campaign span, and data availability distribution), dataset-layer audits, and a live schema integrity validation summary (`src/utils/databaseValidator.ts`).
- **FLAREX Research Intelligence (`src/pages/AiAssistant.tsx`)**: Server-side Gemini API integration (`@google/genai` `ai.models.generateContent` with `ThinkingLevel.LOW`) using bounded top-4 deterministic dossier retrieval, multi-turn conversation history, strict separation of documented database facts vs. AI synthesis, one-click Copy Answer, Retry controls, and open-research-question synthesis.
- **Research Gap Explorer (`src/pages/ResearchGapExplorer.tsx`)**: Nine documented fire-safety and data-quality gaps linked directly to affected investigations.
- **Sources & References (`src/pages/SourcesReferences.tsx`)**: Categorized primary citations and official portals for NASA PSI, PSI Open Data on AWS, NTRS (with live cached lookup via `/api/ntrs/search` parsing publication years, authors, and abstracts), OSDR (with live scope verification via `/api/osdr/search`), and the bundled Project Research Dossier PDF.
- **Accessibility & Navigation (`src/App.tsx`, `src/components/Layout.tsx`)**: Global keyboard shortcuts (`s` search, `h` home, `a` assistant, `c` copy shareable URL, `?` shortcut modal), logical sidebar `tabIndex` and ARIA labeling, URL state persistence (`/?page=...`), and light/dark laboratory themes.

---

## Installation & Local Development

### Prerequisites
- Node.js 20+ and npm

### Setup
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables** (copy `.env.example` to `.env`, or set secrets in AI Studio):
   - `GEMINI_API_KEY`: Server-side API key used **only** by `/api/assistant`. Never exposed to client code. All browsing, filtering, comparison, charts, gap auditing, and NASA NTRS/OSDR lookups work without an AI key.
   - `GEMINI_MODEL`: Optional model identifier matching `^gemini-[a-z0-9.-]+$` (defaults to `gemini-4-hydrogen`).
   - `PORT`: Server port (defaults to `3000`).

3. **Start the development server** (Express backend + Vite middleware on port 3000):
   ```bash
   npm run dev
   ```

---

## Backend API Endpoints (`server.ts`)

| Endpoint | Method | Purpose | Guardrails / Caching |
| --- | --- | --- | --- |
| `/api/health` | `GET` | Reports server readiness, record count, schema integrity check summary, AI key presence, and active model name | Never returns secret values |
| `/api/ntrs/search?q=...` | `GET` | Live proxy to NASA Technical Reports Server (`ntrs.nasa.gov/api/citations/search`) | 15-minute TTL cache, 5s upstream timeout, query sanitization |
| `/api/osdr/search?q=...` | `GET` | Live proxy to NASA Open Science Data Repository (`osdr.nasa.gov/osdr/data/search`) for scope verification | 15-minute TTL cache, 5s upstream timeout, query sanitization |
| `/api/assistant` | `POST` | Grounded Q&A over top-4 matched dossier records via `@google/genai` | Per-IP sliding-window rate limit (20 req/min), sanitized 6-turn history, 25s timeout, structured error codes (`GEMINI_TIMEOUT`, `QUOTA_EXHAUSTED`, `API_KEY_INVALID`, `MODEL_NOT_FOUND`) |

---

## Scientific Data Integrity & Validation Rules

All database invariants are checked at startup and in unit tests (`src/utils/databaseValidator.ts`):
- **Source Fidelity**: Records derive strictly from the bundled *Project Research Dossier (Flame-in-Freefall Challenge 2026)*. Missing measurements are rendered as `"Not available in the reviewed source."` and never coerced to `0`.
- **Gravity & Modality Boundaries**:
  - Ground-based NASA/UL Li-ion battery fire data (`battery-fire-ul`) is explicitly flagged as **terrestrial 1g**, not microgravity.
  - `ACME E-FIELD Flames` (`acme-efield`) is flagged as **electrostatic ion-wind microgravity research**, not partial-gravity research.
  - `SoFIE (MIST / OFFS)` (`sofie-mist`, `sofie-offs`) and unlaunched `ACME` campaigns (`acme-planned`) are flagged as **planned / in-progress** with no public PSI datasets yet.
- **NASA Archive Scope Distinction**: Physical Sciences Informatics (`PSI`) hosts microgravity combustion telemetry, whereas `OSDR` primarily hosts spaceflight biological/omics studies (`GSE` / `OSD` accessions).

---

## Verification & Production Deployment

Run unit tests, type checks, production bundling, and server startup:

```bash
# 1. Run pure-logic and database-validation unit tests
npx --yes tsx --test src/utils/researchLogic.test.ts src/utils/databaseValidator.test.ts src/utils/keyboardShortcuts.test.ts src/utils/urlState.test.ts

# 2. Type-check
npm run lint

# 3. Build production client bundle (dist/)
npm run build

# 4. Run production Express server serving dist/ + /api/*
npm start
```

---

## Known Limitations

- Raw experiment time-series files (`.csv` sensor streams, high-speed optical imagery) are **not** bundled locally; FLAREX indexes curated dossier summaries, published ranges, and external links to NASA PSI / NTRS.
- Live `/api/ntrs/search` and `/api/osdr/search` lookups depend on outbound connectivity to `ntrs.nasa.gov` and `osdr.nasa.gov`.
- AI synthesis via `/api/assistant` requires a valid server-side `GEMINI_API_KEY` with active quota; if unavailable, the endpoint returns structured JSON errors while local research tools remain fully operational.
