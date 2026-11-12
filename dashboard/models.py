from django.db import models
from django.utils import timezone

class Line(models.Model):
    name = models.CharField(max_length=50, unique=True)
    def __str__(self): return self.name

class Product(models.Model):
    line = models.ForeignKey(Line, on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["line", "name"], name="unique_product")]
    def __str__(self): return self.name

class ProductionModel(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    name = models.CharField(max_length=30)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["product", "name"], name="unique_model")]
    def __str__(self): return self.name

class MonthlyPlan(models.Model):
    model = models.ForeignKey(ProductionModel, on_delete=models.CASCADE)
    month = models.DateField()
    opening_stock = models.PositiveIntegerField(default=0)
    oem_requirement = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["model", "month"], name="unique_month_plan")]

class DailyProduction(models.Model):
    model = models.ForeignKey(ProductionModel, on_delete=models.CASCADE)
    date = models.DateField()
    excel_week = models.PositiveSmallIntegerField()
    target = models.PositiveIntegerField(default=0)
    line_off = models.PositiveIntegerField(default=0)
    kanban = models.PositiveIntegerField(default=0)
    good = models.PositiveIntegerField(default=0)
    rejected = models.PositiveIntegerField(default=0)
    delivered = models.PositiveIntegerField(default=0)
    planned_minutes = models.PositiveIntegerField(default=480)
    downtime_minutes = models.PositiveIntegerField(default=0)
    ideal_cycle_seconds = models.PositiveIntegerField(default=60)
    predicted_downtime_minutes = models.PositiveIntegerField(default=30)
    recorded_at = models.DateTimeField(default=timezone.now)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["model", "date"], name="unique_daily")]
        ordering = ["date"]

class Machine(models.Model):
    model = models.OneToOneField(ProductionModel, on_delete=models.CASCADE)
    name = models.CharField(max_length=80)
    running = models.BooleanField(default=True)
    status = models.CharField(max_length=20, default="running")
    stop_reason = models.CharField(max_length=200, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=20, default="operator")
    updated_at = models.DateTimeField(default=timezone.now)

class ControlEntry(models.Model):
    model = models.ForeignKey(ProductionModel, on_delete=models.CASCADE)
    created_at = models.DateTimeField(default=timezone.now)
    payload = models.JSONField()

class Alert(models.Model):
    reporting_month = models.DateField(default="2026-10-01")
    model = models.ForeignKey(ProductionModel, on_delete=models.CASCADE)
    alert_type = models.CharField(max_length=30)
    area = models.CharField(max_length=100)
    description = models.TextField()
    severity = models.CharField(max_length=20)
    created_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    class Meta:
        ordering = ["-created_at"]
