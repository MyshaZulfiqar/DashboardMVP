from django.urls import path
from dashboard import views
urlpatterns = [path("", views.page, name="home"), path("<slug:screen>/", views.page, name="page"), path("api/metrics/", views.metrics, name="metrics"), path("export/<slug:kind>/", views.export, name="export")]
