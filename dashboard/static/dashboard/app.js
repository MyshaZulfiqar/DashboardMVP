const themeButton = document.getElementById('theme');
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  if (document.body.dataset.screen === 'line-metrics') loadCharts();
});
const filters = document.getElementById('filters');
filters.elements.line.addEventListener('change', () => { filters.elements.product.value = ''; filters.elements.model.value = ''; filters.requestSubmit(); });
filters.elements.product.addEventListener('change', () => { filters.elements.model.value = ''; filters.requestSubmit(); });
document.getElementById('alert-filter')?.addEventListener('change', event => {
  const url = new URL(location.href); url.searchParams.set('alerts', event.target.value); location.href = url;
});
const charts = [];
const palette = ['#6598ff','#b297ff','#66cfac','#edbd75','#f07e93','#758198'];
async function data() {
  const response = await fetch(document.body.dataset.api, {headers: {'Accept':'application/json'}});
  if (!response.ok) throw new Error('Unable to refresh');
  return response.json();
}
async function loadCharts() {
  const status = document.getElementById('chart-status');
  try {
    const payload = await data();
    if (!window.Chart) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/static/dashboard/vendor/chart.umd.min.js';
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    charts.forEach(chart => chart.destroy()); charts.length = 0;
    const text = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    Chart.defaults.color = text; Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; Chart.defaults.font.size = 10;
    const s = payload.series, labels = payload.labels;
    function make(id, type, datasets, customLabels=labels) {
      const donut = type === 'doughnut';
      charts.push(new Chart(document.getElementById(id), {type, data:{labels:customLabels,datasets},options:{responsive:true,maintainAspectRatio:false,cutout:donut?'73%':undefined,plugins:{legend:{position:'bottom',labels:{boxWidth:8,boxHeight:8,padding:14}},tooltip:{callbacks:{label:ctx => `${ctx.dataset.label || ctx.label}: ${ctx.parsed.y ?? ctx.parsed} ${id==='downtime-chart'?'hours':'units'}`}}},scales:donut?{}:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#8792a51a'},title:{display:true,text:id==='downtime-chart'?'Hours':'Units'}}}}}));
    }
    make('target-chart','bar',[{label:'Target',data:s.target,backgroundColor:palette[0],borderRadius:4},{label:'Actual good',data:s.good,backgroundColor:palette[1],borderRadius:4}]);
    make('downtime-chart','line',[{label:'Predicted (demo)',data:s.predicted_downtime_minutes,borderColor:palette[0],backgroundColor:palette[0],tension:.3,pointRadius:3},{label:'Actual',data:s.downtime_minutes,borderColor:palette[1],backgroundColor:palette[1],tension:.3,pointRadius:3}]);
    for (const [id,key] of [['production','good'],['backlog','backlog'],['good','good'],['rejected','rejected'],['delivered','delivered']]) {
      const values = [...s[key]], names=[...labels];
      if (id === 'production') { for(let i=0;i<values.length;i++) values[i]+=s.rejected[i]; }
      if (id === 'production' || id === 'good') { names.push('Remaining target'); values.push(Math.max(0,s.target.reduce((a,b)=>a+b,0)-values.reduce((a,b)=>a+b,0))); }
      if (id === 'delivered') { names.push('Remaining OEM'); values.push(payload.summary.backlog); }
      make(`${id}-donut`,'doughnut',[{data:values,backgroundColor:values.map((_,i)=>palette[i%palette.length]),borderWidth:0}],names);
    }
    status.textContent = 'Excel groups: W1 Oct 1–4 · W2 5–11 · W3 12–18 · W4 19–25 · W5 26–31. Calendar labels show Monday start dates. Quarter shows weekly data for the quarter; only October is seeded. Donuts include every week, including W5. Predicted downtime is a demo baseline.';
  } catch (error) { status.textContent = 'Charts could not load. KPI values remain available; download CSV reports from Control End.'; }
}
async function refreshFloor() {
  try {
    const {summary:s} = await data();
    for (const [id,value] of Object.entries({'live-target':s.target,'live-good':s.good,'live-attainment':s.attainment,'live-oee':`${s.oee}%`,'live-machines':`${s.running} / ${s.machine_count}`,'live-downtime':`${s.downtime_minutes} min`,'live-status':s.remaining?`${s.remaining} units remain to reach the target.`:'Target achieved. Production is on track.'})) document.getElementById(id).textContent=value;
    document.getElementById('production-progress').value = s.attainment;
    document.getElementById('live-status').style.color = s.remaining ? 'var(--red)' : 'var(--green)';
    document.getElementById('live-stop').textContent = s.last_stop ? `${s.last_stop.stopped_at} — ${s.last_stop.stop_reason}` : 'No stops recorded';
    document.getElementById('updated').textContent = `Updated ${new Date(s.updated).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})}`;
    document.getElementById('poll-status').textContent = 'Live connection active';
  } catch { document.getElementById('poll-status').textContent = 'Refresh failed · showing last received values. Retrying in 30 seconds.'; }
}
if (document.body.dataset.screen === 'line-metrics') loadCharts();
if (document.body.dataset.screen === 'shop-floor') { refreshFloor(); setInterval(refreshFloor,30000); }
