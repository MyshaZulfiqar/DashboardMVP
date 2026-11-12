# TSB PRODUCTION

A Django / SQLite MVP for thermal-system production monitoring. Four server-rendered screens: Shop Floor, Control End, Line Metrics, and AI Analytics (Coming Soon / On Hold). No authentication or front-end build pipeline.

## Run locally

Python 3.12 recommended (Django 5.2 supports Python 3.10+).

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 0.0.0.0:8000
```

Open the server in your browser. The default report is **October 2026**. Select product and model to enable Control End saves. Seeding is deterministic and safe to repeat: it creates missing demo records without overwriting existing operator entries. Start with a fresh database to regenerate the exact original dataset. `db.sqlite3` is local and ignored by Git.

For other hostnames, set `DJANGO_ALLOWED_HOSTS` to a comma-separated list. `DJANGO_SECRET_KEY` and `DJANGO_DEBUG` can also be set through environment variables. Defaults are for local development. The MVP intentionally has no authentication; Control End and alert resolution are open to app users.

## Data and calculations

Reference: **AC PROD - OCT.xlsx**, Sheet1, daily Line Off / Kanban / Actual Prod rows. Formula cells are not used as stored totals. Workbook weekday headers identify October 2026. Excel grouping is W1=1–4, W2=5–11, W3=12–18, W4=19–25, W5=26–31. Calendar grouping uses the Monday of each date's week and may include a September start date. Month displays grouped weeks, Week displays daily values for the chosen group, and Quarter displays Monday-based weekly data throughout the selected quarter. Only October has demo production; other dates have no fabricated activity.

The workbook combines Hose, Tube & HVAC. For this MVP, each model baseline is allocated **40% Hose, 30% Tube, 30% HVAC**, with largest-remainder rounding. Daily quantities are deterministic synthetic distributions (seed `558046`), concentrated through October 19, rather than a claim of measured product-level production. Targets span the full month. Sundays have no planned production. Seeded quality, cycle times, machine flags, alerts and downtime are synthetic.

| Model | OEM / Line Off | Opening | Good production | Delivered | FG | Backlog |
|---|---:|---:|---:|---:|---:|---:|
| 558D | 1,480 | 70 | 1,020 | 840 | 250 | 640 |
| 046D | 2,510 | 230 | 1,600 | 1,350 | 480 | 1,160 |
| 481D | 660 | 180 | 540 | 450 | 270 | 210 |
| 164D | 210 | 70 | 110 | 130 | 50 | 80 |

Production KPI shows good units plus a separate rejection count; the Production donut includes both good and rejected units. Rejections are additional synthetic scrap. All displayed production, delivery, downtime and chart totals are aggregated from daily records. FG = opening + good − delivered. Backlog = max(OEM − delivered, 0). Workbook stock coverage = (good + opening) / Line Off. Attainment = good / production target. Zero denominators display 0%.

OEE uses aggregate weighted factors: Availability = operating minutes / planned minutes; Performance = ideal cycle minutes for all produced parts / operating minutes (capped at 100%); Quality = good / (good + rejected). OEE = Availability × Performance × Quality. Downtime is cumulative machine minutes, so parallel machines' downtime adds together. Predicted downtime is a synthetic baseline, not an AI forecast.

Donuts preserve every week, including W5. Production/Good include remaining target; Delivered includes remaining OEM; Backlog shows each week's unmet dispatch target. The Backlog KPI is the authoritative monthly OEM backlog, which can differ from summed weekly dispatch shortfalls.

## Operator workflow

The top filters scope all reports, charts, machines, alerts and exports. Control End requires a single product/model combination. Daily Line Off, target and Kanban edits apply to the latest populated production date in the selected month (or its first day for a new month); opening stock and OEM apply to the whole selected month. Every save creates an immutable timestamped audit entry. The production CSV includes daily snapshots **and** operator audit rows, distinguished by entry type; audit rows must not be summed as extra production.

Machine running/status/reason are current manual operator values, independent of report history. A stop requires a reason and consistent running/status inputs. Last stop time and reason persist after restart. Stop flags do not fabricate historical downtime minutes. Historical downtime comes from daily records; `IoTIngestion` is the future ingestion hook. Shop Floor polls every 30 seconds and indicates refresh failures. It displays selected-month totals to keep the October demo useful outside October.

Alerts retain their selected reporting month separately from their actual entry timestamp. Active/resolved lists and CSVs are scoped to that reporting month. Timestamps and CSV time columns use Asia/Karachi (UTC+05). CSV exports escape spreadsheet formula prefixes in free-text fields.

## Structure and future lines

- `dashboard/models.py`: Line → Product → ProductionModel, monthly plans, daily production, machine state, alerts and control audit log.
- `dashboard/services.py`: repository and application-service boundary; filtering, aggregation, writes and IoT hook. Views use the service API.
- `dashboard/forms.py`: server-side validation.
- `dashboard/templates/dashboard/partials/`: reusable filters, KPI cards, charts and alert list.
- `dashboard/static/dashboard/`: responsive dark/light styling and minimal JavaScript.
- Chart.js 4.4.8 is requested from jsDelivr; a bundled copy from that same version provides a local fallback. Its upstream license notice is retained in the file. No network is needed for fallback charts.

Add **HE PROD** and **EC PROD** as new `Line` records, then attach Products, ProductionModels, MonthlyPlans, daily records and Machines using the same relationships. No schema restructuring is needed. Replace repository access for an external store, or implement `IoTIngestion.ingest(machine_id, event_time, payload)` with validated identity, timestamp and idempotency handling. Persist source=`iot` for sensor-backed machine state; templates need no change.

## Validation performed

Django system checks, migration and repeated seeding; baseline reconciliation for all four models; all screens, JSON endpoint and CSV responses; server-side negative-input rejection; operator save/audit, dispatch and resolution (validation changes rolled back). Chromium checked all seven charts, Shop Floor polling, dark/light themes, and responsive layouts. No automated test suite was added, as requested.
