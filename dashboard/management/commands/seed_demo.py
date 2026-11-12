import random
from datetime import date, datetime, time
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from dashboard.models import Line, Product, ProductionModel, MonthlyPlan, DailyProduction, Machine, Alert

BASELINES = {"558D": (1480,70,840,1020), "046D": (2510,230,1350,1600), "481D": (660,180,450,540), "164D": (210,70,130,110)}

def allocate(total, weights):
    raw = [total*w/sum(weights) for w in weights]
    result = [int(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i]-result[i], reverse=True)[:total-sum(result)]:
        result[i] += 1
    return result

class Command(BaseCommand):
    help = "Seed deterministic October 2026 demo data; repeat runs preserve operator changes."
    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(558046)
        line,_ = Line.objects.get_or_create(name="AC PROD")
        for model_name, baseline in BASELINES.items():
            portions = [allocate(value, [4,3,3]) for value in baseline]
            for p, product_name in enumerate(["Hose", "Tube", "HVAC"]):
                product,_ = Product.objects.get_or_create(line=line,name=product_name)
                model,_ = ProductionModel.objects.get_or_create(product=product,name=model_name)
                oem,opening,delivery,actual = [v[p] for v in portions]
                MonthlyPlan.objects.get_or_create(model=model,month=date(2026,10,1),defaults={"opening_stock":opening,"oem_requirement":oem})
                weights = [rng.randint(7,13) if d<=19 and date(2026,10,d).weekday()!=6 else 0 for d in range(1,32)]
                goods = allocate(actual,weights)
                deliveries = allocate(delivery,weights)
                targets = allocate(oem,[0 if date(2026,10,d).weekday()==6 else 1 for d in range(1,32)])
                for d in range(1,32):
                    dt=date(2026,10,d)
                    stamp=timezone.make_aware(datetime.combine(dt,time(16,0)))
                    planned=480 if dt.weekday()!=6 and d<=19 else 0
                    DailyProduction.objects.get_or_create(model=model,date=dt,defaults={"excel_week":1 if d<=4 else 2+(d-5)//7,"target":targets[d-1],"line_off":targets[d-1],"kanban":deliveries[d-1],"good":goods[d-1],"rejected":rng.randint(0,2) if goods[d-1] else 0,"delivered":deliveries[d-1],"planned_minutes":planned,"downtime_minutes":rng.randint(12,48) if planned else 0,"ideal_cycle_seconds":max(1,int(420*60/max(goods[d-1]+2,1))),"predicted_downtime_minutes":30 if planned else 0,"recorded_at":stamp})
                stopped = model_name=="164D" and p==2
                Machine.objects.get_or_create(model=model,defaults={"name":f"{product_name} · {model_name}","running":not stopped,"status":"stopped" if stopped else "running","stop_reason":"Tool change / setup" if stopped else "","stopped_at":timezone.make_aware(datetime(2026,10,19,15,45)) if stopped else None,"updated_at":timezone.make_aware(datetime(2026,10,19,16,0))})
                for n, resolved in enumerate([False,True]):
                    Alert.objects.get_or_create(model=model,description="Inspect fixture alignment" if not resolved else "Material replenished; flow restored",defaults={"alert_type":"Maintenance" if not resolved else "Production","area":f"{product_name} station","severity":"warning" if not resolved else "info","created_at":timezone.make_aware(datetime(2026,10,19,9+n,15)),"resolved_at":timezone.make_aware(datetime(2026,10,19,12,0)) if resolved else None})
        self.stdout.write(self.style.SUCCESS("October 2026 demo seeded: 12 model/product combinations, 372 daily records."))
