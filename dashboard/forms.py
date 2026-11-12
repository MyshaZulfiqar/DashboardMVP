from django import forms

class ControlForm(forms.Form):
    status = forms.ChoiceField(label="Select line status", choices=[("running","Running"),("stopped","Stopped"),("maintenance","Maintenance")])
    line_off = forms.IntegerField(min_value=0, label="Line Off (units)")
    target = forms.IntegerField(min_value=0, label="Production Target (units)")
    kanban = forms.IntegerField(min_value=0)
    opening_stock = forms.IntegerField(min_value=0, label="Monthly Opening Stock (units)")
    oem_requirement = forms.IntegerField(min_value=0, label="Monthly OEM Requirement (units)")
    running = forms.BooleanField(required=False, label="Machine running")
    stop_reason = forms.CharField(required=False, max_length=200)
    def clean(self):
        data = super().clean()
        if (not data.get("running") or data.get("status") != "running") and not data.get("stop_reason"):
            self.add_error("stop_reason", "Enter a reason when the machine is stopped.")
        if data.get("running") and data.get("status") != "running":
            self.add_error("running", "A running machine requires Running status.")
        return data

class AlertForm(forms.Form):
    alert_type = forms.ChoiceField(label="Type of Alert", choices=[("Production","Production"),("Safety","Safety"),("Quality","Quality"),("Maintenance","Maintenance")])
    area = forms.CharField(max_length=100, label="Affected Area / Machine")
    description = forms.CharField(max_length=1000, widget=forms.Textarea(attrs={"rows":3}))
    severity = forms.ChoiceField(label="Severity Level", choices=[("critical","Critical"),("warning","Warning"),("info","Information")])
