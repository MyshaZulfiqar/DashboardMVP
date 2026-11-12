import csv
from django.contrib import messages
from django.http import JsonResponse, HttpResponse, Http404
from django.shortcuts import render, redirect
from django.utils import timezone
from .services import DashboardService
from .forms import ControlForm, AlertForm

SCREENS={"shop-floor":"Shop Floor","control-end":"Control End","line-metrics":"Line Metrics","ai-analytics":"AI Analytics"}

def page(request, screen="line-metrics"):
    if screen not in SCREENS: raise Http404
    service=DashboardService(request.GET)
    control=ControlForm(prefix="control")
    alert=AlertForm(prefix="alert")
    single=service.single_selection()
    if request.method=="POST":
        action=request.POST.get("action")
        if action=="resolve":
            service.resolve_alert(request.POST.get("alert_id"))
            messages.success(request,"Alert marked resolved.")
        elif action in ["control","alert"]:
            form=ControlForm(request.POST,prefix="control") if action=="control" else AlertForm(request.POST,prefix="alert")
            valid=form.is_valid()
            if not single: form.add_error(None,"Select one line, product and model before saving.")
            if valid and single:
                if action=="control": service.save_control(form.cleaned_data)
                else: service.save_alert(form.cleaned_data)
                messages.success(request,"Values saved and timestamped." if action=="control" else "Alert dispatched and timestamped.")
            else:
                if action=="control": control=form
                else: alert=form
                return render(request,"dashboard/page.html",context(request,screen,service,control,alert,single))
        return redirect(request.get_full_path())
    if single:
        control=ControlForm(initial=service.control_initial(),prefix="control")
    return render(request,"dashboard/page.html",context(request,screen,service,control,alert,single))

def context(request,screen,service,control,alert,single):
    state=request.GET.get("alerts","active")
    return {"screen":screen,"title":SCREENS[screen],"screens":SCREENS,
            "alert_state":state,"control_form":control,"alert_form":alert,
            "single":single,"query":request.GET.urlencode(),**service.page_data(state)}

def metrics(request): return JsonResponse(DashboardService(request.GET).charts())

def safe_cell(value):
    value=str(value)
    return "'"+value if value.startswith(("=","+","-","@","\t","\r")) else value

def export(request,kind):
    if kind not in ["production","alerts"]: raise Http404
    service=DashboardService(request.GET)
    response=HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"]=f'attachment; filename="{kind}-{timezone.localdate().isoformat()}.csv"'
    writer=csv.writer(response)
    if kind=="production":
        writer.writerow(["Entry type","Date","Time (Asia/Karachi)","Line","Product","Model","Reporting date","Target","Line Off","Kanban","Good","Rejected","Delivered","Downtime (minutes)","Operator values"])
        for x in service.production_logs():
            stamp=timezone.localtime(x.recorded_at)
            writer.writerow(["daily",stamp.date(),stamp.time().isoformat(),x.model.product.line,x.model.product,x.model,x.date,x.target,x.line_off,x.kanban,x.good,x.rejected,x.delivered,x.downtime_minutes,""])
        for x in service.control_logs():
            stamp=timezone.localtime(x.created_at)
            writer.writerow(["operator",stamp.date(),stamp.time().isoformat(),x.model.product.line,x.model.product,x.model,x.payload.get("effective_date"),x.payload.get("target"),x.payload.get("line_off"),x.payload.get("kanban"),"","","","",safe_cell(x.payload)])
    else:
        writer.writerow(["Date","Time (Asia/Karachi)","Line","Product","Model","Type","Area/Machine","Description","Severity","Resolved date/time"])
        for x in service.alert_logs():
            stamp=timezone.localtime(x.created_at)
            writer.writerow([stamp.date(),stamp.time().isoformat(),x.model.product.line,x.model.product,x.model,safe_cell(x.alert_type),safe_cell(x.area),safe_cell(x.description),x.severity,timezone.localtime(x.resolved_at).isoformat() if x.resolved_at else ""])
    return response
