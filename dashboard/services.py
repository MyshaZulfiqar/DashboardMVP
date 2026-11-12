"""Application data boundary. Views consume this service, not ORM queries.

Replace repository methods to integrate a production store or an IoT adapter.
"""
from datetime import date, timedelta
from collections import defaultdict
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from .models import Line, Product, ProductionModel, MonthlyPlan, DailyProduction, Machine, Alert, ControlEntry

class DashboardRepository:
    def __init__(self, params):
        self.params = params
        self.models = ProductionModel.objects.select_related("product__line").all()
        for key, field in [("line","product__line_id"),("product","product_id"),("model","name")]:
            value = params.get(key)
            if value and (key=="model" or str(value).isdigit()):
                self.models = self.models.filter(**{field:value})
        try:
            self.month = date.fromisoformat(params.get("month", "2026-10")+"-01")
        except ValueError:
            self.month = date(2026,10,1)
        self.end = (self.month.replace(day=28)+timedelta(days=4)).replace(day=1)
        self.rows = DailyProduction.objects.filter(model__in=self.models,date__gte=self.month,date__lt=self.end)
    def options(self):
        products=Product.objects.all()
        if str(self.params.get("line", "")).isdigit(): products=products.filter(line_id=self.params["line"])
        names=ProductionModel.objects.filter(product__in=products)
        if str(self.params.get("product", "")).isdigit(): names=names.filter(product_id=self.params["product"])
        return {"lines":Line.objects.all(),"products":products,"model_names":names.values_list("name",flat=True).distinct().order_by("name")}
    def machines(self): return Machine.objects.filter(model__in=self.models).select_related("model")
    def alerts(self): return Alert.objects.filter(model__in=self.models,reporting_month=self.month)
    def plans(self): return MonthlyPlan.objects.filter(model__in=self.models,month=self.month)
    def entries(self): return ControlEntry.objects.filter(model__in=self.models,payload__effective_date__startswith=self.month.strftime("%Y-%m"))

class DashboardService:
    def __init__(self, params): self.repo=DashboardRepository(params)
    def single_selection(self):
        return self.repo.models.count() == 1

    def control_initial(self):
        row = self.repo.rows.filter(good__gt=0).last()
        plan = self.repo.plans().first()
        machine = self.repo.machines().first()
        initial = {key: getattr(row, key, 0) for key in ["target", "line_off", "kanban"]}
        initial.update({key: getattr(plan, key, 0) for key in ["opening_stock", "oem_requirement"]})
        initial.update({"running": machine.running if machine else True,
                        "status": machine.status if machine else "running",
                        "stop_reason": machine.stop_reason if machine else ""})
        return initial

    def page_data(self, alert_state):
        return {"s": self.snapshot(), "machines": self.repo.machines(),
                "alerts": self.repo.alerts().filter(resolved_at__isnull=alert_state != "resolved"),
                "month": self.repo.month.strftime("%Y-%m"), **self.repo.options()}

    def production_logs(self):
        return self.repo.rows.select_related("model__product__line")

    def control_logs(self):
        return self.repo.entries().select_related("model__product__line")

    def alert_logs(self):
        return self.repo.alerts().select_related("model__product__line")

    def snapshot(self):
        r=self.repo
        rows=list(r.rows)
        machines=list(r.machines())
        totals={k:sum(getattr(x,k) for x in rows) for k in ["target","line_off","kanban","good","rejected","delivered","planned_minutes","downtime_minutes"]}
        plans=list(r.plans())
        oem=sum(p.oem_requirement for p in plans)
        opening=sum(p.opening_stock for p in plans)
        total=totals["good"]+totals["rejected"]
        run=max(0,totals["planned_minutes"]-totals["downtime_minutes"])
        availability=run/totals["planned_minutes"] if totals["planned_minutes"] else 0
        ideal=sum((x.good+x.rejected)*x.ideal_cycle_seconds/60 for x in rows)
        performance=min(1,ideal/run) if run else 0
        quality=totals["good"]/total if total else 0
        last=max((m.updated_at for m in machines),default=None)
        stopped=sorted([m for m in machines if m.stopped_at],key=lambda m:m.stopped_at,reverse=True)
        return {**totals,"production":total,"oem":oem,"opening":opening,"backlog":max(0,oem-totals["delivered"]),"fg":opening+totals["good"]-totals["delivered"],"coverage":round(100*(totals["good"]+opening)/totals["line_off"],1) if totals["line_off"] else 0,"attainment":round(100*totals["good"]/totals["target"],1) if totals["target"] else 0,"remaining":max(0,totals["target"]-totals["good"]),"availability":round(availability*100,1),"performance":round(performance*100,1),"quality":round(quality*100,1),"oee":round(100*availability*performance*quality,1),"downtime_hours":round(totals["downtime_minutes"]/60,1),"running":sum(m.running for m in machines),"machine_count":len(machines),"last_entry":last,"last_stop":{"stopped_at":stopped[0].stopped_at,"stop_reason":stopped[0].stop_reason} if stopped else None,"updated":timezone.localtime().isoformat()}
    def charts(self):
        r=self.repo
        scope=r.params.get("period","month")
        grouping=r.params.get("grouping","excel")
        rows=r.rows
        if scope=="quarter":
            start=r.month.replace(month=((r.month.month-1)//3)*3+1)
            end=(start.replace(day=28)+timedelta(days=4)).replace(day=1)
            for _ in range(2): end=(end.replace(day=28)+timedelta(days=4)).replace(day=1)
            rows=DailyProduction.objects.filter(model__in=r.models,date__gte=start,date__lt=end)
        buckets=defaultdict(lambda:defaultdict(float))
        if scope=="month" and grouping=="excel":
            for w in range(1,6): buckets[f"W{w}"]
        for x in rows:
            monday=x.date-timedelta(days=x.date.weekday())
            if scope=="week":
                try: week=int(r.params.get("week",1))
                except ValueError: week=1
                if grouping=="excel":
                    if x.excel_week!=week: continue
                else:
                    first=r.month-timedelta(days=r.month.weekday())
                    if (monday-first).days//7+1!=week: continue
                key=x.date.isoformat()
            elif grouping=="calendar" or scope=="quarter": key=monday.isoformat()
            else: key=f"W{x.excel_week}"
            b=buckets[key]
            for k in ["target","good","rejected","delivered","downtime_minutes","predicted_downtime_minutes"]: b[k]+=getattr(x,k)
        labels=sorted(buckets)
        series={k:[round(buckets[x][k]/60 if "minutes" in k else buckets[x][k],2) for x in labels] for k in ["target","good","rejected","delivered","downtime_minutes","predicted_downtime_minutes"]}
        snap=self.snapshot()
        series["backlog"]=[max(0,buckets[x]["target"]-buckets[x]["delivered"]) for x in labels]
        return {"labels":labels,"series":series,"summary":snap}
    @transaction.atomic
    def save_control(self, data):
        model=self.repo.models.get()
        month=self.repo.month
        now=timezone.now()
        # Controls apply to the selected reporting month's latest populated day.
        day=self.repo.rows.filter(good__gt=0).aggregate(day=Max("date"))["day"] or month
        row,_=DailyProduction.objects.get_or_create(model=model,date=day,defaults={"excel_week":1 if day.day<=4 else 2+(day.day-5)//7})
        for k in ["target","line_off","kanban"]: setattr(row,k,data[k])
        row.recorded_at=now
        row.save()
        MonthlyPlan.objects.update_or_create(model=model,month=month,defaults={k:data[k] for k in ["opening_stock","oem_requirement"]})
        machine,_=Machine.objects.get_or_create(model=model,defaults={"name":str(model)})
        if not data["running"] and machine.running: machine.stopped_at=now
        machine.running=data["running"]
        machine.status=data["status"]
        machine.stop_reason=data["stop_reason"] or machine.stop_reason
        machine.updated_at=now
        machine.source="operator"
        machine.save()
        ControlEntry.objects.create(model=model,payload={**data,"effective_date":day.isoformat()})
    def save_alert(self,data): Alert.objects.create(model=self.repo.models.get(),reporting_month=self.repo.month,**data)
    def resolve_alert(self,pk): return self.repo.alerts().filter(pk=pk,resolved_at__isnull=True).update(resolved_at=timezone.now())

class IoTIngestion:
    """Future adapter must validate machine identity, event time and payload.
    Implement here, then persist through the repository; UI remains unchanged.
    """
    def ingest(self, machine_id, event_time, payload):
        raise NotImplementedError("IoT ingestion is on hold; operator entry is the MVP source.")
