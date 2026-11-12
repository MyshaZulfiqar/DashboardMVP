# TSB PRODUCTION — MVP2

A responsive production-monitoring dashboard made with **HTML, CSS and vanilla JavaScript**. No Python server, framework, package installation or build step is required. Chart.js is bundled locally. All runtime assets are served from this project, with no CDN dependency.

The Django implementation remains on branch **MVP1**. This branch, **MVP2**, is the static implementation prepared for Vercel.

## View locally

Serve the `public` directory with any static HTTP server. For example, if Python is available:

```sh
python -m http.server 8080 --directory public
```

Open the server on the same machine where it runs. Opening the HTML directly with `file://` will not work because demo data is fetched as JSON. A cloud environment's loopback address is only accessible inside that environment.

## Deploy to Vercel

1. Sign in to Vercel and select **Add New → Project**.
2. Import **MyshaZulfiqar/DashboardMVP** from GitHub.
3. Select branch **MVP2** for the deployment. For an existing project, change its production branch to `MVP2` in Git settings if production deployments should follow this branch.
4. Set framework preset to **Other** and keep the repository root as the Root Directory.
5. Use **no build command** and **public** as the Output Directory. `vercel.json` already supplies these settings.
6. Deploy, then open the HTTPS URL Vercel provides. No environment variables, database or functions are needed.

Alternatively, with Vercel CLI installed and authenticated, run `vercel` from the repository root for a preview, or `vercel --prod` for production. Deployment and hosting-account access are separate from the cloud development environment. This repository contains no deployment credentials.

## Screens

- **Line Metrics:** five KPI cards, OEE breakdown, target/actual and downtime charts, weekly donuts, machine status and active/resolved alerts.
- **Shop Floor:** large production metrics, machine-running count, progress, downtime and manual stop reasons. Refreshes every 30 seconds and syncs changes between tabs of the same origin.
- **Control End:** validated production settings, manual machine status, alert dispatch, resolution and dated CSV downloads.
- **AI Analytics:** Coming Soon / On Hold placeholder.

Dark mode is the default; the theme toggle persists the choice. Filters scope all calculations, machines, alerts and exports. Screen navigation and filters are retained in the URL; hash routes require no server rewrites.

## Data and persistence

`public/data/demo.json` is the deterministic October 2026 seed exported from the MVP1 seed command, which used the uploaded **AC PROD - OCT.xlsx** as reference. A fresh browser loads all four models across Hose, Tube and HVAC on AC PROD: 12 product/model combinations and 372 daily records. No separate seed command is necessary: deploy the JSON file with the site.

Workbook figures combine all three products. Demo quantities are split 40% Hose / 30% Tube / 30% HVAC using largest-remainder rounding. Daily demo activity is concentrated through October 19, generated with fixed seed 558046 in the original seed generator. Quality, downtime, cycle times, alerts and machine status are synthetic. All dashboard totals are recomputed from daily records; unresolved workbook formulas are not copied.

| Model | OEM / Line Off | Opening | Good production | Delivered | FG | Backlog |
|---|---:|---:|---:|---:|---:|---:|
| 558D | 1,480 | 70 | 1,020 | 840 | 250 | 640 |
| 046D | 2,510 | 230 | 1,600 | 1,350 | 480 | 1,160 |
| 481D | 660 | 180 | 540 | 450 | 270 | 210 |
| 164D | 210 | 70 | 110 | 130 | 50 | 80 |

**This is a static, browser-local MVP.** Control settings and alerts persist in `localStorage` on that browser and site origin. They are not shared between users, devices, Vercel preview URLs, or production domains. Clearing site data resets the demo. If storage is blocked or full, saves fail visibly. No credentials or authentication are used. There is no server-side validation or shared database in this version; input validation is performed in JavaScript and native HTML forms. Add an API and shared storage before using it for plant-wide live data.

Every operator save retains an audit entry with timestamp. Production CSV contains daily rows and separate operator audit rows: do not sum audit rows as additional production. CSVs include full date/time in Asia/Karachi (UTC+05); free-text formula prefixes are escaped.

Daily Control End fields apply to the latest populated production day in the chosen month, shown above the form, or the first day of an empty month. Opening stock and OEM are monthly. Alerts store the reporting month separately from their actual entry timestamp. Machine state is current and manual, independent of the historical report month. Running/status must agree; stopped machines require a reason. Last stop time and reason persist after restart. Machine flags do not fabricate historical downtime.

## Calculations and week grouping

- FG = opening + good − delivered; backlog = max(OEM − delivered, 0).
- Stock coverage = (good + opening) / Line Off; attainment = good / production target.
- Availability = operating minutes / planned minutes.
- Performance = ideal cycle minutes for good + rejected units / operating minutes, capped at 100%.
- Quality = good / (good + rejected). OEE = Availability × Performance × Quality. Zero denominators show 0%.
- Machine downtime is summed across machines, including concurrent downtime. Predicted downtime is a demo baseline.
- Excel W1=Oct 1–4, W2=5–11, W3=12–18, W4=19–25, W5=26–31. Calendar weeks run Monday–Sunday; labels show their Monday date. Week view shows individual days in the selected week; quarter shows Monday-based weekly values in the selected quarter. Only October has seeded activity.
- Production donut includes good + rejected. Production/Good donuts include remaining target; Delivered includes remaining OEM; Backlog donut shows weekly dispatch shortfalls. The monthly backlog KPI is OEM minus delivered and can differ from summed weekly shortfalls. Every week, including W5, is retained.

## Maintainable structure

```text
public/
  index.html                  Semantic shell and global filter/navigation bar
  assets/app.css              Responsive dark/light styling
  assets/app.js               Reusable UI renderers, forms and chart components
  assets/data.js              Repository, aggregation service, persistence and IoT stub
  assets/vendor/              Chart.js 4.4.8, upstream license notice retained
  data/demo.json              Deterministic initial data
vercel.json                   Static hosting and security headers
```

The data relationships remain **Line → Product → Model**, with model-keyed monthly plans, daily records, machines and alerts. Add HE PROD or EC PROD entries and their products/models/records in the data source; existing filtering and views work with the same schema. Replace `ProductionRepository` and the service data operations with a remote API adapter when shared persistence is needed. The `IoTIngestion` interface marks the future sensor input path. Templates/renderers need no framework or separate build pipeline.

## Validation

Browser smoke checks cover navigation, all seven charts, baseline totals, local save/reload, alerts and resolution, CSV download, theme switching, and responsive layouts. No automated test suite or build tooling is added.
