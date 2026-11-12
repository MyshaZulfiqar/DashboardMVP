import {ProductionRepository, ProductionService, STORAGE_KEY} from './data.js';

const titles = {'shop-floor':'Shop Floor','control-end':'Control End','line-metrics':'Line Metrics','ai-analytics':'AI Analytics'};
const content = document.getElementById('content');
const filtersForm = document.getElementById('filters');
const palette = ['#6598ff','#b297ff','#66cfac','#edbd75','#f07e93','#758198'];
const charts = [];
const n = value => value===null||value===undefined ? 'TBD' : Number(value).toLocaleString('en-GB',{maximumFractionDigits:0});
const pct = value => value===null||value===undefined ? 'TBD' : `${Number(value).toFixed(1)}%`;
const esc = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateTime = value => value ? new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value)) : 'Not recorded';
let service;
let filters = {line:'',product:'',model:'',month:'2026-10',period:'month',grouping:'excel',week:'1'};
let alertState = 'active';
let screen = () => Object.hasOwn(titles,location.hash.slice(1)) ? location.hash.slice(1) : 'line-metrics';

function message(text,error=false) {
  const element=document.getElementById('message');
  element.hidden=false; element.className=`message ${error?'error':''}`;element.textContent=text;
}
function selectOptions(element,items,value,allLabel) {
  element.innerHTML=`<option value="">${allLabel}</option>`+items.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  element.value=value;
}
function renderFilters() {
  const data=service.data;
  selectOptions(filtersForm.elements.line,data.lines,filters.line,'All lines');
  const products=data.products.filter(p=>!filters.line||String(p.line_id)===filters.line);
  selectOptions(filtersForm.elements.product,products,filters.product,'All products');
  const productIds=products.filter(p=>!filters.product||String(p.id)===filters.product).map(p=>p.id);
  const names=[...new Set(data.models.filter(m=>productIds.includes(m.product_id)).map(m=>m.name))].sort();
  selectOptions(filtersForm.elements.model,names.map(name=>({id:name,name})),filters.model,'All models');
  const weeks=service.weeks(filters);
  filtersForm.elements.week.innerHTML=weeks.map(week=>`<option value="${week}">W${week}</option>`).join('');
  filtersForm.elements.week.disabled=filters.period!=='week';
  if (!weeks.includes(Number(filters.week))) filters.week=String(weeks[0]||1);
  for (const field of ['month','period','grouping','week']) filtersForm.elements[field].value=filters[field];
  document.querySelectorAll('.metrics-filter').forEach(element=>element.hidden=false);
}
function kpi(label,value,unit,details,tone='') {
  return `<article class="kpi"><p>${label}</p><div class="kpi-value ${tone}">${value}<span>${unit}</span></div>${details.map(detail=>`<small>${detail}</small>`).join('')}</article>`;
}
function chartCard(title,id,caption='',donut=false) {
  return `<section class="panel chart-panel"><div class="panel-heading"><h2>${title}</h2><span>${caption}</span></div><div class="chart-wrap ${donut?'donut':''}"><canvas id="${id}" role="img" aria-label="${title}">Use the CSV export for tabular chart data.</canvas></div></section>`;
}
function machinesPanel(summary) {
  return `<section class="panel"><div class="panel-heading"><h2>Machine Status</h2><span class="green">${n(summary.running)} / ${n(summary.machine_count)} reported running</span></div><div class="machines">${service.machines(filters).map(machine=>`<div class="machine"><span class="status-dot ${machine.running?'on':''}"></span><div><strong>${esc(machine.name)}</strong><small>${esc(machine.status)} · ${esc(machine.source)}${!machine.running&&machine.stop_reason?' · '+esc(machine.stop_reason):''}</small></div><span class="machine-code">${esc(service.label(machine.model_id).model)}</span></div>`).join('')||'<p class="empty">TBD — machine inventory and status are not supplied in the workbook. Enter a status in Control End.</p>'}</div></section>`;
}
function alertsPanel() {
  const alerts=service.alerts(filters,alertState==='resolved');
  return `<section class="panel"><div class="panel-heading"><h2>${alertState==='resolved'?'✓ Resolved Alerts':'<span class="red">⚠</span> Active Alerts'}</h2><select id="alert-filter" aria-label="Filter alerts"><option value="active" ${alertState==='active'?'selected':''}>Active Alerts</option><option value="resolved" ${alertState==='resolved'?'selected':''}>Resolved Alerts</option></select></div><div class="alert-list">${alerts.map(a=>`<article class="alert ${esc(a.severity)} ${a.resolved_at?'resolved':''}"><div><strong>${esc(a.area)}</strong><span class="severity">${esc(a.severity)}</span><p>${esc(a.description)}</p><small>${dateTime(a.created_at)} · ${esc(service.label(a.model_id).product)} / ${esc(service.label(a.model_id).model)}</small>${a.resolved_at?`<small>Resolved ${dateTime(a.resolved_at)}</small>`:''}</div>${!a.resolved_at?`<button class="resolve" data-resolve="${esc(a.id)}">Mark resolved</button>`:''}</article>`).join('')||`<p class="empty">No ${alertState} alerts entered. Historical alert details: TBD (not supplied).</p>`}</div></section>`;
}
function missingCard(title,description) {
  return `<section class="panel chart-panel"><div class="panel-heading"><h2>${title}</h2><span>TBD</span></div><div class="chart-placeholder"><strong>Data not available</strong><p>${description}</p></div></section>`;
}
function periodLabel() {
  if(filters.period==='quarter')return `Q${Math.floor((Number(filters.month.slice(5))-1)/3)+1} ${filters.month.slice(0,4)}`;
  if(filters.period==='week')return `${filters.month} · W${filters.week}`;
  return filters.month;
}
function metricsView(s) {
  content.innerHTML=`<div class="kpis">${kpi('Target Plan',n(s.oem),'units',[filters.period==='week'?'Weekly Line Off':'OEM requirement · selected period'])}${kpi('Production',n(s.actual),'units',['Good parts: TBD · Rejected parts: TBD'],'green')}${kpi('Delivered',n(s.delivered),'units',[`${n(s.backlog)} units backlog`])}${kpi('Downtime',s.downtime_hours===null?'TBD':s.downtime_hours.toFixed(1),s.downtime_hours===null?'':'hours',['Not supplied in workbook'])}${kpi('Overall Efficiency',pct(s.assumed_efficiency),'',['Assumed · workbook scenario',`Measured OEE: ${pct(s.oee)}`,`Availability ${pct(s.availability)} · Performance ${pct(s.performance)} · Quality ${pct(s.quality)}`])}</div>
  <div class="summary-strip"><span>Opening stock <b>${n(s.opening)} units</b></span><span>Line Off <b>${n(s.line_off)} units</b></span><span>Kanban <b>${n(s.kanban)} units</b></span><span>FG Stock <b>${n(s.fg)} units</b></span><span>Stock coverage <b>${pct(s.coverage)}</b></span><span>Actual production <b>${pct(s.attainment)} of target</b></span></div>
  <p class="chart-note">${esc(periodLabel())} · Jan–Oct 2026 workbook · Hose, Tube &amp; HVAC are reported together; individual product splits are TBD.${filters.period==='quarter'&&filters.month>='2026-10'?' Q4 is partial: October only; November–December are not supplied.':''}</p>
  <div class="metrics-layout"><div class="charts-column"><div class="main-charts">${chartCard('Target vs Production','target-chart','Units · selected period')}${missingCard('Downtime','Actual and predicted downtime are not supplied in the workbook.')}</div><div class="donut-grid">${chartCard('Production','production-donut','',true)}${chartCard('Backlog','backlog-donut','',true)}${missingCard('Good Parts','Quality breakdown is not supplied.')}${missingCard('Rejected Parts','Rejection quantities are not supplied.')}${chartCard('Delivered','delivered-donut','',true)}</div><p class="chart-note" id="chart-status">Workbook weeks use Monday–Sunday, including partial first and last weeks. August has W6. Calendar labels show Monday start dates. Stock coverage includes opening inventory and is separate from the assumed 80% efficiency. Quarter opening stock is the first month’s balance, not the sum of monthly openings.</p></div><aside>${machinesPanel(s)}${alertsPanel()}</aside></div>`;
  drawCharts(s);
}
function drawCharts(summary) {
  if (!window.Chart) { document.getElementById('chart-status').textContent='Chart library unavailable. KPI data and CSV exports remain available.';return; }
  const {labels,series:s}=service.charts(filters);
  Chart.defaults.color=getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  Chart.defaults.font.family='Inter, system-ui, sans-serif';Chart.defaults.font.size=10;
  function make(id,type,datasets,names=labels) {
    const donut=type==='doughnut';
    charts.push(new Chart(document.getElementById(id),{type,data:{labels:names,datasets},options:{responsive:true,maintainAspectRatio:false,cutout:donut?'73%':undefined,plugins:{legend:{position:'bottom',labels:{boxWidth:8,boxHeight:8,padding:14}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label||ctx.label}: ${n(ctx.parsed.y??ctx.parsed)} ${id==='downtime-chart'?'hours':'units'}`}}},scales:donut?{}:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#8792a51a'},title:{display:true,text:id==='downtime-chart'?'Hours':'Units'}}}}}));
  }
  make('target-chart','bar',[{label:'Target',data:s.target,backgroundColor:palette[0],borderRadius:4},{label:'Actual production',data:s.actual,backgroundColor:palette[1],borderRadius:4}]);
  for (const [id,key] of [['production','actual'],['backlog','backlog'],['delivered','delivered']]) {
    const values=[...s[key]],names=[...labels];
    if (id==='production'||id==='good') { names.push('Remaining target');values.push(Math.max(0,s.target.reduce((a,b)=>a+b,0)-values.reduce((a,b)=>a+b,0))); }
    if (id==='delivered') { names.push('Remaining OEM');values.push(Math.max(0,summary.oem-values.reduce((a,b)=>a+b,0))); }
    make(`${id}-donut`,'doughnut',[{data:values,backgroundColor:values.map((_,i)=>palette[i%palette.length]),borderWidth:0}],names);
  }
}
function floorView(s) {
  content.innerHTML=`<div class="live-label"><span class="${s.machine_count&&s.running===s.machine_count?'green':'muted'}">● ${s.machine_count?'OPERATOR STATUS REPORTED':'MACHINE STATUS: TBD'}</span><span>Refreshes every 30 seconds · ${esc(periodLabel())}</span></div><section class="floor-hero panel"><div><p>Target production</p><strong>${n(s.target)}</strong><span>units · selected period</span></div><div><p>Actual production</p><strong class="${s.remaining?'red':'green'}">${n(s.actual)}</strong><span>units · ${pct(s.attainment)} of target</span></div><div><p>Overall efficiency · assumed</p><strong>${pct(s.assumed_efficiency)}</strong><span>Measured OEE: ${pct(s.oee)} · Machines Running: <b>${n(s.running)} / ${n(s.machine_count)}</b> reported</span></div><div class="progress-row"><progress aria-label="Production progress" max="100" value="${Math.min(100,s.attainment)}"></progress><span>Production progress</span></div></section><section class="panel downtime"><div><p>Downtime · selected period</p><strong>${n(s.downtime_minutes)}</strong><small>Not supplied in workbook</small></div><div><p>Last stop</p><strong class="stop-detail">${s.last_stop?`${dateTime(s.last_stop.stopped_at)} — ${esc(s.last_stop.stop_reason)}`:'TBD — no stop details supplied'}</strong><small>Source: operator manual entry when available</small></div></section><section class="production-status"><h2>ⓘ Production status</h2><p class="${s.remaining?'red':'green'}">${s.has_data?(s.remaining?`${n(s.remaining)} units remain to reach the target.`:'Target achieved. Production is on track.'):'No production records in this selection.'}</p><small>The 80% efficiency is an assumption; OEE factors remain TBD. Browser demo refreshed; changes sync between tabs on this browser.</small></section>`;
}
function numberInput(name,label,value) {
  return `<p><label for="${name}">${label}</label><input id="${name}" name="${name}" type="number" min="0" max="1000000000" step="1" value="${value}" required></p>`;
}
function controlView() {
  const selected=service.controlInitial(filters),v=selected||{status:'unknown',running:null,stop_reason:'',target:0,line_off:0,kanban:0,opening_stock:0,oem_requirement:0};
  content.innerHTML=`<div class="control-layout"><section class="panel"><div class="panel-heading"><h2>Production controls</h2><span class="green">● Manual entry</span></div><p class="muted">Select one product and model to enter values. Machine status stays TBD until entered. Kanban also updates Delivered, matching the workbook. ${selected?'Daily values apply to '+esc(selected.effective_date)+' in the selected month (even in quarter/week view).':'Monthly values apply to the selected reporting month.'}</p>${!selected?'<p class="notice">Choose the combined product and one model above to enable saving.</p>':''}<form id="control-form" class="entry-form"><fieldset ${!selected?'disabled':''}><p><label for="status">Select line status</label><select name="status" id="status">${['unknown','running','stopped','maintenance'].map(status=>`<option value="${status}" ${v.status===status?'selected':''}>${status==='unknown'?'TBD — not supplied':status[0].toUpperCase()+status.slice(1)}</option>`).join('')}</select></p>${numberInput('line_off','Line Off (units)',v.line_off)}${numberInput('target','Production Target (units)',v.target)}${numberInput('kanban','Kanban (units)',v.kanban)}${numberInput('opening_stock','Monthly Opening Stock (units)',v.opening_stock)}${numberInput('oem_requirement','Monthly OEM Requirement (units)',v.oem_requirement)}<p><label for="running">Machine running</label><input type="checkbox" id="running" name="running" ${v.status==='unknown'?'disabled':''} ${v.running?'checked':''}></p><p><label for="stop_reason">Stop reason</label><input name="stop_reason" id="stop_reason" maxlength="200" value="${esc(v.stop_reason)}" placeholder="Required when machine is stopped"></p><button class="primary">Set Value</button></fieldset></form></section><div><section class="panel"><div class="panel-heading"><h2>Report an issue</h2><span class="badge red">Dispatch Alert</span></div><form id="alert-form" class="entry-form"><fieldset ${!selected?'disabled':''}><p><label for="alert_type">Type of Alert</label><select id="alert_type" name="alert_type">${['Production','Safety','Quality','Maintenance'].map(type=>`<option>${type}</option>`).join('')}</select></p><p><label for="area">Affected Area / Machine</label><input name="area" id="area" maxlength="100" required></p><p><label for="description">Description</label><textarea name="description" id="description" rows="3" maxlength="1000" required></textarea></p><p><label for="severity">Severity Level</label><select name="severity" id="severity"><option value="critical">Critical</option><option value="warning" selected>Warning</option><option value="info">Information</option></select></p><button class="danger">Dispatch Alert ↗</button></fieldset></form></section><section class="panel downloads"><h2>Download reports</h2><p class="muted">Filtered daily records and browser-local audit entries with full date and time.</p><button class="download" data-export="production">↓ Download Dated Production Log CSV</button><button class="download" data-export="alerts">↓ Download Dated Alert Log CSV</button></section></div></div>`;
}
function render() {
  while(charts.length) charts.pop().destroy();
  renderFilters();
  const current=screen(),summary=service.summary(filters);
  document.title=`${titles[current]} · TSB PRODUCTION`;
  document.getElementById('page-title').textContent=titles[current];
  document.getElementById('updated').textContent=`Updated ${dateTime(new Date().toISOString())}`;
  document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('selected',a.hash===`#${current}`);if(a.hash===`#${current}`)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  renderFilters();
  if(current==='line-metrics') metricsView(summary);
  else if(current==='shop-floor') floorView(summary);
  else if(current==='control-end') controlView();
  else content.innerHTML='<section class="panel coming"><span class="coming-icon">✧</span><p class="eyebrow">AI ANALYTICS</p><h2>Coming Soon / On Hold</h2><p>Production insights will be available here in a future release.</p></section>';
}
function saveFilters() {
  const params=new URLSearchParams(filters);
  history.replaceState(null,'',`${location.pathname}?${params}#${screen()}`);
}
function exportCSV(kind) {
  const safe=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const csv='\uFEFF'+service.exportRows(filters,kind).map(row=>row.map(safe).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`${kind}-${filters.month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
filtersForm.addEventListener('submit',event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(filtersForm));
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.month))return;
  filters={...filters,...values};saveFilters();render();
});
for (const key of ['line','product']) filtersForm.elements[key].addEventListener('change',()=>{
  filters={...filters,...Object.fromEntries(new FormData(filtersForm))};
  if(key==='line')filters.product='';filters.model='';saveFilters();render();
});
document.getElementById('theme').addEventListener('click',()=>{
  const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('tsb-theme',theme);}catch{/* Theme still works for this session. */}
  if(service)render();
});
content.addEventListener('change',event=>{
  if(event.target.id==='alert-filter'){alertState=event.target.value;render();}
  if(event.target.id==='status'){
    const form=event.target.form;form.elements.running.checked=event.target.value==='running';
    form.elements.running.disabled=event.target.value==='unknown';
    form.elements.stop_reason.required=['stopped','maintenance'].includes(event.target.value);
  }
  if(event.target.id==='running')event.target.form.elements.stop_reason.required=!event.target.checked;
});
content.addEventListener('click',event=>{
  const exportButton=event.target.closest('[data-export]');if(exportButton)exportCSV(exportButton.dataset.export);
  const resolveButton=event.target.closest('[data-resolve]');
  if(resolveButton)try{service.resolveAlert(filters,resolveButton.dataset.resolve);render();message('Alert marked resolved in this browser.');}catch{message('Unable to save. Allow browser storage and try again.',true);}
});
content.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;
  const values=Object.fromEntries(new FormData(form));
  try{
    if(form.id==='control-form'){
      for(const key of ['target','line_off','kanban','opening_stock','oem_requirement']) values[key]=values[key]?.trim()?Number(values[key]):NaN;
      values.running=form.elements.running.checked;service.saveControl(filters,values);
    }else if(form.id==='alert-form') service.saveAlert(filters,values); else return;
    render();message(form.id==='control-form'?'Values saved and timestamped in this browser.':'Alert dispatched and timestamped in this browser.');
  }catch(error){message(error.name==='QuotaExceededError'||error.name==='SecurityError'?'Unable to save. Allow browser storage or free space, then try again.':error.message,true);}
});
window.addEventListener('hashchange',()=>{if(service){document.getElementById('message').hidden=true;render();}});
window.addEventListener('storage',event=>{if(service&&event.key===STORAGE_KEY){service.repo.sync();render();}});

async function init(){
  try{const theme=localStorage.getItem('tsb-theme');if(['dark','light'].includes(theme))document.documentElement.dataset.theme=theme;}catch{}
  const response=await fetch('/data/demo.json');if(!response.ok)throw new Error('Demo data could not be loaded.');
  service=new ProductionService(new ProductionRepository(await response.json()));
  const params=new URLSearchParams(location.search);
  for(const key of Object.keys(filters))if(params.has(key))filters[key]=params.get(key);
  if(!service.data.months.includes(filters.month))filters.month='2026-10';
  if(!['month','quarter','week'].includes(filters.period))filters.period='month';
  if(!['excel','calendar'].includes(filters.grouping))filters.grouping='excel';
  if(!/^[1-6]$/.test(filters.week))filters.week='1';
  if(!service.data.lines.some(l=>String(l.id)===filters.line))filters.line='';
  if(!service.data.products.some(p=>String(p.id)===filters.product&&(!filters.line||String(p.line_id)===filters.line)))filters.product='';
  if(!service.models({...filters,model:''}).some(m=>m.name===filters.model))filters.model='';
  if(!service.repo.persistent)document.getElementById('storage-note').textContent='Browser storage is unavailable or invalid. Allow storage to save changes.';
  render();
  setInterval(()=>{if(screen()==='shop-floor'){service.repo.sync();render();}},30000);
}
init().catch(error=>{content.innerHTML=`<section class="panel"><h2>Unable to load dashboard</h2><p>${esc(error.message)}</p><p>Serve the public folder over HTTP, or refresh your Vercel deployment.</p></section>`;});
