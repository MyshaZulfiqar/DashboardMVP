/** Data boundary: replace this repository with a remote API without changing UI components. */
const STORAGE_KEY = 'tsb-production-mvp2-v1';
const isoDay = date => date.toISOString().slice(0, 10);
const monday = value => {
  const day = new Date(`${value}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return isoDay(day);
};
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const percent = (a, b) => b ? 100 * a / b : 0;

export class ProductionRepository {
  constructor(seed) {
    this.state = structuredClone(seed);
    this.persistent = true;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.version === seed.version && ['lines','products','models','plans','daily','machines','alerts','entries'].every(key => Array.isArray(stored[key]))) this.state = stored;
    } catch { this.persistent = false; }
  }
  persist() {
    // Don't silently pretend a write was saved when storage is unavailable.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.persistent = true;
  }
  transact(change) {
    const before = structuredClone(this.state);
    try { change(this.state); this.persist(); }
    catch (error) { this.state = before; throw error; }
  }
  sync() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.version === this.state.version && Array.isArray(stored.daily)) this.state = stored;
    } catch { /* Keep the last valid in-memory snapshot. */ }
  }
}

export class ProductionService {
  constructor(repository) { this.repo = repository; }
  get data() { return this.repo.state; }
  models(filters) {
    const productIds = this.data.products.filter(p => (!filters.line || String(p.line_id) === filters.line) && (!filters.product || String(p.id) === filters.product)).map(p => p.id);
    return this.data.models.filter(m => productIds.includes(m.product_id) && (!filters.model || m.name === filters.model));
  }
  rows(filters) {
    const ids = this.models(filters).map(m => m.id);
    return this.data.daily.filter(r => ids.includes(r.model_id) && r.date.startsWith(filters.month));
  }
  machines(filters) {
    const ids = this.models(filters).map(m => m.id);
    return this.data.machines.filter(m => ids.includes(m.model_id));
  }
  alerts(filters, resolved = false) {
    const ids = this.models(filters).map(m => m.id);
    return this.data.alerts.filter(a => ids.includes(a.model_id) && a.reporting_month.startsWith(filters.month) && Boolean(a.resolved_at) === resolved).sort((a,b) => b.created_at.localeCompare(a.created_at));
  }
  label(modelId) {
    const model = this.data.models.find(m => m.id === modelId);
    const product = this.data.products.find(p => p.id === model.product_id);
    const line = this.data.lines.find(l => l.id === product.line_id);
    return { model: model.name, product: product.name, line: line.name };
  }
  summary(filters) {
    const rows = this.rows(filters), ids = this.models(filters).map(m => m.id);
    const plans = this.data.plans.filter(p => ids.includes(p.model_id) && p.month.startsWith(filters.month));
    const total = {};
    for (const key of ['target','line_off','kanban','good','rejected','delivered','planned_minutes','downtime_minutes']) total[key] = sum(rows, key);
    const operating = Math.max(0, total.planned_minutes - total.downtime_minutes);
    const availability = total.planned_minutes ? operating / total.planned_minutes : 0;
    const performance = operating ? Math.min(1, rows.reduce((n,r) => n + (r.good + r.rejected) * r.ideal_cycle_seconds / 60, 0) / operating) : 0;
    const quality = total.good + total.rejected ? total.good / (total.good + total.rejected) : 0;
    const oem = sum(plans,'oem_requirement'), opening = sum(plans,'opening_stock');
    const machines = this.machines(filters);
    return {...total, oem, opening, backlog: Math.max(0,oem-total.delivered), fg: opening+total.good-total.delivered,
      attainment: percent(total.good,total.target), coverage: percent(total.good+opening,total.line_off), remaining: Math.max(0,total.target-total.good),
      availability:availability*100, performance:performance*100, quality:quality*100, oee:availability*performance*quality*100,
      downtime_hours:total.downtime_minutes/60, running:machines.filter(m=>m.running).length, machine_count:machines.length,
      last_stop:machines.filter(m=>m.stopped_at).sort((a,b)=>b.stopped_at.localeCompare(a.stopped_at))[0] || null};
  }
  charts(filters) {
    let rows = this.rows(filters);
    if (filters.period === 'quarter') {
      const [year,month] = filters.month.split('-').map(Number);
      const start = Math.floor((month-1)/3)*3+1;
      const ids = this.models(filters).map(m=>m.id);
      rows = this.data.daily.filter(r=>ids.includes(r.model_id) && Number(r.date.slice(0,4))===year && Number(r.date.slice(5,7))>=start && Number(r.date.slice(5,7))<start+3);
    }
    const buckets = new Map();
    const empty = () => ({target:0,good:0,rejected:0,delivered:0,downtime_minutes:0,predicted_downtime_minutes:0});
    if (filters.period === 'month' && filters.grouping === 'excel') for (let w=1;w<=5;w++) buckets.set(`W${w}`,empty());
    for (const row of rows) {
      const calendarWeek = Math.round((new Date(`${monday(row.date)}T00:00:00Z`) - new Date(`${monday(filters.month+'-01')}T00:00:00Z`))/604800000)+1;
      if (filters.period === 'week' && (filters.grouping === 'excel' ? row.excel_week : calendarWeek) !== Number(filters.week)) continue;
      const key = filters.period === 'week' ? row.date : (filters.period === 'quarter' || filters.grouping === 'calendar') ? monday(row.date) : `W${row.excel_week}`;
      if (!buckets.has(key)) buckets.set(key,empty());
      const bucket = buckets.get(key);
      Object.keys(bucket).forEach(field => bucket[field] += row[field]);
    }
    const labels = [...buckets.keys()].sort();
    const series = {};
    for (const field of Object.keys(empty())) series[field] = labels.map(label => buckets.get(label)[field] / (field.includes('minutes') ? 60 : 1));
    series.backlog = labels.map(label=>Math.max(0,buckets.get(label).target-buckets.get(label).delivered));
    return {labels,series};
  }
  controlInitial(filters) {
    const model = this.models(filters)[0];
    if (!model || this.models(filters).length !== 1) return null;
    const rows = this.rows(filters);
    const row = rows.filter(r=>r.good>0).at(-1) || rows[0];
    const plan = this.data.plans.find(p=>p.model_id===model.id && p.month.startsWith(filters.month));
    const machine = this.machines(filters)[0];
    return {target:row?.target||0, line_off:row?.line_off||0, kanban:row?.kanban||0, opening_stock:plan?.opening_stock||0,
      oem_requirement:plan?.oem_requirement||0, status:machine?.status||'running', running:machine?.running??true, stop_reason:machine?.stop_reason||'', effective_date:row?.date||`${filters.month}-01`};
  }
  saveControl(filters, values) {
    const models = this.models(filters);
    if (models.length !== 1) throw new Error('Select one product and model before saving.');
    for (const key of ['target','line_off','kanban','opening_stock','oem_requirement']) {
      if (!Number.isSafeInteger(values[key]) || values[key] < 0 || values[key] > 1000000000) throw new Error('Enter whole numbers from 0 to 1,000,000,000.');
    }
    if (!['running','stopped','maintenance'].includes(values.status)) throw new Error('Choose a valid line status.');
    if (values.running && values.status !== 'running') throw new Error('A running machine requires Running status.');
    if ((!values.running || values.status !== 'running') && !values.stop_reason.trim()) throw new Error('Enter a reason when the machine is stopped.');
    if (values.stop_reason.length>200) throw new Error('Stop reason must be 200 characters or fewer.');
    const modelId = models[0].id, now = new Date().toISOString(), effectiveDate = this.controlInitial(filters).effective_date;
    this.repo.transact(state => {
      let row = state.daily.find(r=>r.model_id===modelId && r.date===effectiveDate);
      if (!row) {
        const day = Number(effectiveDate.slice(-2));
        row={id:crypto.randomUUID(),model_id:modelId,date:effectiveDate,excel_week:day<=4?1:2+Math.floor((day-5)/7),target:0,line_off:0,kanban:0,good:0,rejected:0,delivered:0,planned_minutes:0,downtime_minutes:0,ideal_cycle_seconds:60,predicted_downtime_minutes:0};
        state.daily.push(row);
      }
      Object.assign(row,{target:values.target,line_off:values.line_off,kanban:values.kanban,recorded_at:now});
      let plan=state.plans.find(p=>p.model_id===modelId && p.month.startsWith(filters.month));
      if (!plan) { plan={id:crypto.randomUUID(),model_id:modelId,month:`${filters.month}-01`}; state.plans.push(plan); }
      Object.assign(plan,{opening_stock:values.opening_stock,oem_requirement:values.oem_requirement,updated_at:now});
      let machine=state.machines.find(m=>m.model_id===modelId);
      if (!machine) { machine={id:crypto.randomUUID(),model_id:modelId,name:Object.values(this.label(modelId)).slice(0,2).join(' · '),running:true,stopped_at:null}; state.machines.push(machine); }
      if (!values.running && machine.running) machine.stopped_at=now;
      Object.assign(machine,{running:values.running,status:values.status,stop_reason:values.stop_reason||machine.stop_reason||'',source:'operator',updated_at:now});
      state.entries.push({id:crypto.randomUUID(),model_id:modelId,created_at:now,payload:{...values,effective_date:effectiveDate}});
    });
  }
  saveAlert(filters, values) {
    const models = this.models(filters);
    if (models.length !== 1) throw new Error('Select one product and model before dispatching.');
    if (!['Production','Safety','Quality','Maintenance'].includes(values.alert_type) || !['critical','warning','info'].includes(values.severity)) throw new Error('Select a valid alert type and severity.');
    if (!values.area.trim() || !values.description.trim() || values.area.length>100 || values.description.length>1000) throw new Error('Enter an affected area and description within the field limits.');
    this.repo.transact(state=>state.alerts.push({id:crypto.randomUUID(),model_id:models[0].id,reporting_month:`${filters.month}-01`,...values,created_at:new Date().toISOString(),resolved_at:null}));
  }
  resolveAlert(filters,id) {
    const alert = this.alerts(filters).find(a=>String(a.id)===id);
    if (alert) this.repo.transact(state=>{ state.alerts.find(a=>a.id===alert.id).resolved_at=new Date().toISOString(); });
  }
  exportRows(filters,kind) {
    const stamp = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(value));
    const identity = id => {const l=this.label(id);return [l.line,l.product,l.model];};
    if (kind === 'alerts') return [['Timestamp (Asia/Karachi UTC+05)','Line','Product','Model','Type','Area / Machine','Description','Severity','Resolved timestamp'], ...[...this.alerts(filters),...this.alerts(filters,true)].map(a=>[stamp(a.created_at),...identity(a.model_id),a.alert_type,a.area,a.description,a.severity,a.resolved_at?stamp(a.resolved_at):''])];
    const ids=this.models(filters).map(m=>m.id);
    return [['Entry type','Timestamp (Asia/Karachi UTC+05)','Line','Product','Model','Reporting date','Target','Line Off','Kanban','Good','Rejected','Delivered','Downtime minutes','Operator values'],
      ...this.rows(filters).map(r=>['daily',stamp(r.recorded_at),...identity(r.model_id),r.date,r.target,r.line_off,r.kanban,r.good,r.rejected,r.delivered,r.downtime_minutes,'']),
      ...this.data.entries.filter(e=>ids.includes(e.model_id)&&e.payload.effective_date.startsWith(filters.month)).map(e=>['operator',stamp(e.created_at),...identity(e.model_id),e.payload.effective_date,e.payload.target,e.payload.line_off,e.payload.kanban,'','','','',JSON.stringify(e.payload)])];
  }
}

export class IoTIngestion {
  ingest(machineId,eventTime,payload) { throw new Error('IoT ingestion is on hold. Connect an authenticated API adapter here.'); }
}
