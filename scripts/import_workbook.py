"""Optional development import: pip install openpyxl; python scripts/import_workbook.py.
No Python dependency is needed to serve the dashboard.
"""
import json
from pathlib import Path
from datetime import date
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
workbook = load_workbook(ROOT / 'data/AC_PROD_JAN_OCT_Dummy_80pct.xlsx', data_only=True)
names = ['558D', '046D', '481D', '164D']
model_ids = {name: i + 1 for i, name in enumerate(names)}
state = {
    'version': 2,
    'source': 'AC_PROD_JAN_OCT_Dummy_80pct.xlsx',
    'months': [f'2026-{m:02}' for m in range(1, 11)],
    'lines': [{'id': 1, 'name': 'AC PROD'}],
    'products': [{'id': 1, 'line_id': 1, 'name': 'Hose, Tube & HVAC (combined)'}],
    'models': [{'id': model_ids[name], 'product_id': 1, 'name': name} for name in names],
    'plans': [], 'daily': [], 'machines': [], 'alerts': [], 'entries': [],
}
for row in list(workbook['Summary'].values)[1:]:
    month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
    month = f'2026-{month_names.index(row[0].split()[0]) + 1:02}'
    assert row[6] == row[4] * .8 or abs(row[6] - row[4] * .8) < 1e-8
    state['plans'].append({'id':len(state['plans'])+1,'model_id':model_ids[row[3]],'month':month+'-01','opening_stock':row[5], 'oem_requirement':row[4], 'assumed_efficiency':row[11], 'updated_at':None})
for row in list(workbook['Daily Data'].values)[1:]:
    state['daily'].append({
        'id':len(state['daily'])+1,'model_id':model_ids[row[4]],'date':row[0].strftime('%Y-%m-%d'),
        'excel_week':int(row[5][1:]),'target':row[7],'line_off':row[7],'kanban':row[8],
        'actual':row[9],'good':None,'rejected':None,'delivered':row[8],
        'planned_minutes':None,'downtime_minutes':None,'ideal_cycle_seconds':None,
        'predicted_downtime_minutes':None,'recorded_at':None,
    })
state['daily'].sort(key=lambda r:(r['date'], r['model_id']))
assert len(state['daily']) == 1216
(ROOT / 'public/data/demo.json').write_text(json.dumps(state,separators=(',',':'))+'\n')
print('Imported 40 monthly plans and 1216 daily records. Unknown fields remain null.')
