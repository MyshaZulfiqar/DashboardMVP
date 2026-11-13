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
- **Shop Floor:** a fixed floor display with no filter controls. Its line/product/model names and today's target come exclusively from the last **Set Value** save on Control End; URL/report filters cannot change the floor assignment. Production, downtime, OEE and stop details are placeholders until an IoT feed is connected. The Pakistan-time clock ticks every second. At midnight the displayed identity stays fixed, but the previous day's target expires and a new target must be published. Changes refresh every 30 seconds and immediately across tabs in the same browser. This static MVP has no shared-device backend or IoT connection.
- **Control End:** validated production settings, manual machine status, alert dispatch, resolution and dated CSV downloads.
- **AI Analytics:** Coming Soon / On Hold placeholder.

Dark mode is the default; the theme toggle persists the choice. Filters scope all calculations, machines, alerts and exports. Screen navigation and filters are retained in the URL; hash routes require no server rewrites.

## Workbook data and persistence

The dashboard now reads **January–October 2026** from the populated `AC_PROD_JAN_OCT_Dummy_80pct.xlsx` workbook. There are **40 monthly plans** and **1,216 daily records** across models 558D, 046D, 481D and 164D. All monthly values, dispatch quantities, inventory and weekly groups are imported from the workbook; the old October-only synthetic dataset is replaced.

The source is retained in `data/AC_PROD_JAN_OCT_Dummy_80pct.xlsx`. An optional development-only importer regenerates the deployed JSON:

```sh
python -m pip install openpyxl
python scripts/import_workbook.py
```

Serving or deploying the site still requires **no Python or dependencies**. The committed JSON is the first-run seed. Use Excel/LibreOffice to recalculate and save formulas before re-importing; the importer reads cached workbook results.

| Month (2026) | Line Off / Target | Actual production |
|---|---:|---:|
| January | 4,375 | 3,500 |
| February | 4,615 | 3,692 |
| March | 5,105 | 4,084 |
| April | 4,860 | 3,888 |
| May | 5,345 | 4,276 |
| June | 4,760 | 3,808 |
| July | 5,155 | 4,124 |
| August | 5,445 | 4,356 |
| September | 5,005 | 4,004 |
| October | 4,860 | 3,888 |

Actual production is exactly **80% of Line Off** for every imported model/month. The separate **Overall Efficiency** value is explicitly labeled **assumed**, not measured OEE. OEE, Availability, Performance, Quality, good/rejected quantities, downtime, predicted downtime, machine inventory, running flags, stop details and historical alerts were not supplied; they remain **TBD**, not zero or invented data. Downtime and quality chart containers show placeholders instead of misleading charts. Original entry timestamps are also TBD; workbook dates remain available in exports.

Hose, Tube & HVAC are combined in the source. The product filter therefore offers the combined group rather than inventing individual-product quantities. Model and line filtering still work. Future individual products can be added with actual product-level records.

**Persistence is browser-local.** Control settings and alerts use `localStorage`; they are not shared between users, devices, preview URLs or production domains. The workbook dataset has its own versioned storage key. Previous October-only demo entries are retained under the old key and cannot override the new seed. Clearing site data resets the demo. Blocked/full storage produces a visible save error. No authentication or server-side database is included.

Control End shows only Line, Product and Model filters. All its saves use today's Pakistan date, regardless of historical report filters or URL parameters. **Set Value** saves daily line status, Shop Floor target, Line Off and Kanban; it also publishes today's fixed floor identity/target. These fields start fresh each new day. Kanban updates today's Delivered, matching the workbook convention. Historical daily records remain unchanged.

**Monthly setup** has a separate **Save Monthly Settings** button for opening stock and OEM requirement. Save once per model per Pakistan calendar month; the fields then remain locked, including across daily saves and reloads. The service also rejects repeat saves, so the lock is not only visual. A fresh month unlocks empty setup values for that month and preserves previous monthly records. Setup is available at the first use in a month if the controller missed the first calendar day. No old month's values are silently carried into the new month's setup. Imported historical workbook plans are preserved. Manual monthly setup is tracked separately with a saved timestamp.

Machine status begins TBD each day and is only updated by an explicit operator selection. A stop requires a reason. Control End updates at midnight, including automatic monthly unlock on the first day of the next month.

Reporting CSV exports follow the chosen period and filters; Control End exports today’s records for the selected line/product/model. Daily rows and operator audit rows are separate entry types; audit rows must not be summed as extra production. Unknown fields export as `TBD`. User entry timestamps use Asia/Karachi (UTC+05); no timestamp is invented for source rows. Formula prefixes in free-text CSV fields are escaped.

## Calculations and periods

- FG = opening + actual production − delivered; backlog = max(OEM − delivered, 0).
- Stock coverage = (actual + opening) / Line Off. This retains the workbook formula and can differ from the 80% assumption.
- Attainment = actual production / production target. Historical report targets are separate from the controller-published daily floor target; the scenario assumption remains labeled separately.
- OEE is only computed when all required operating-time, cycle-time and quality inputs are known: Availability × Performance × Quality. Until then it is TBD.
- Workbook weeks follow Monday–Sunday, including partial first/last weeks. Week counts are derived from each month; August has W6. Calendar grouping labels the same groups by Monday start date. Quarter charts group daily records across month boundaries by Monday date.
- Reporting screens, KPIs and exports follow Month / Quarter / Week. Shop Floor always follows the current Pakistan date instead. Weekly target is the sum of that week's Line Off. Weekly opening inventory includes prior movements in the month. Quarter opening is the first month's opening balance; it is never the sum of monthly opening balances. Closing inventory reconciles across months.
- Q4 is explicitly partial (October only). November and December have no source data.
- Production/Delivered/Backlog donuts use available weekly quantities. Production includes remaining target; Delivered includes remaining OEM. Backlog donut shows weekly dispatch shortfalls, which may differ from the monthly net-backlog KPI.

## Maintainable structure

```text
public/
  index.html                  Semantic shell and global filter/navigation bar
  assets/app.css              Responsive dark/light styling
  assets/app.js               Reusable UI renderers, forms and chart components
  assets/data.js              Repository, aggregation service, persistence and IoT stub
  assets/vendor/              Chart.js 4.4.8, upstream license notice retained
  data/demo.json              Workbook-derived Jan–Oct initial data
vercel.json                   Static hosting and security headers
```

The data relationships remain **Line → Product → Model**, with model-keyed monthly plans, daily records, machines and alerts. Add HE PROD or EC PROD entries and their products/models/records in the data source; existing filtering and views work with the same schema. Replace `ProductionRepository` and the service data operations with a remote API adapter when shared persistence is needed. The `IoTIngestion` interface marks the future sensor input path. Templates/renderers need no framework or separate build pipeline.

## Validation

Validation reconciles all 40 model/months and monthly aggregates with the populated workbook, including stock carry-forward, 80% attainment, quarter balances and August W6. Browser smoke checks cover navigation, available charts and missing-data placeholders, period filters, operator saves, alerts, exports and responsive layouts. No automated test suite or build tooling is added.

### Shop Floor controller workflow

On Control End, select line, combined product and one model, enter **Shop Floor Target · today**, and press **Set Value**. This atomically saves today's daily controls and a date-stamped floor assignment with fixed identity and target. Changing filters or navigating away without saving does not publish anything. Monthly opening stock/OEM are saved separately once per model/month; daily saves neither require nor overwrite them. After midnight, floor names remain fixed and the target returns to TBD until today's controller save. Production, downtime and OEE remain placeholders until IoT is connected. `ProductionService.floorSnapshot` is the separate floor data boundary; historical report rows are never used as live input.
