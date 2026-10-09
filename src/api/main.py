import logging
import os

if os.getenv("JWT_SECRET_KEY", "changeme-in-production") == "changeme-in-production":
    raise RuntimeError(
        "JWT_SECRET_KEY must be set to a strong secret. "
        "Set it in your environment before starting."
    )

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routers.auth import router as auth_router
from src.api.routers.admin import tenants as admin_tenants
from src.api.routers.admin import scrapers as admin_scrapers
from src.api.routers.admin import matching as admin_matching
from src.api.routers.admin import tasks as admin_tasks
from src.api.routers.admin import stats as admin_stats
from src.api.routers.admin import audit as admin_audit
from src.api.routers.admin import sources as admin_sources
from src.api.routers.admin import users as admin_users
from src.api.routers.admin import brands as admin_brands
from src.api.routers.admin import categories as admin_categories
from src.api.routers.tenant import offers as tenant_offers
from src.api.routers.tenant import products as tenant_products
from src.api.routers.tenant.products import scope_router as tenant_scope
from src.api.routers.tenant import dashboard as tenant_dashboard
from src.api.routers.tenant import events as tenant_events
from src.api.routers.tenant import alerts as tenant_alerts
from src.api.routers.tenant import analysis as tenant_analysis
from src.api.routers.tenant import market as tenant_market
from src.api.routers.tenant import alert_rules as tenant_alert_rules
from src.api.routers.tenant import users as tenant_users
from src.api.routers.tenant import assistant as tenant_assistant
from src.api.routers.tenant import reports as tenant_reports

logger = logging.getLogger(__name__)
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(
    title="PriceWatch API",
    description="Multi-tenant competitive price intelligence for Tunisian e-commerce.",
    version="1.0.0",
)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://app.pfe.local",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# ── Prometheus metrics ─────────────────────────────────────────
Instrumentator().instrument(app).expose(app)

app.include_router(auth_router,               prefix="/api/v1")
app.include_router(admin_tenants.router,  prefix="/api/v1/admin", tags=["Admin - Tenants"])
app.include_router(admin_scrapers.router, prefix="/api/v1/admin", tags=["Admin - Scrapers"])
app.include_router(admin_matching.router, prefix="/api/v1/admin", tags=["Admin - Matching"])
app.include_router(admin_tasks.router,    prefix="/api/v1/admin", tags=["Admin - Tasks"])
app.include_router(admin_stats.router,    prefix="/api/v1/admin", tags=["Admin - Stats"])
app.include_router(admin_audit.router,       prefix="/api/v1/admin", tags=["Admin - Audit"])
app.include_router(admin_sources.router,    prefix="/api/v1/admin", tags=["Admin - Sources"])
app.include_router(admin_users.router,      prefix="/api/v1/admin", tags=["Admin - Users"])
app.include_router(admin_brands.router,     prefix="/api/v1/admin", tags=["Admin - Brands"])
app.include_router(admin_categories.router, prefix="/api/v1/admin", tags=["Admin - Categories"])
app.include_router(tenant_offers.router,     prefix="/api/v1", tags=["Tenant - Offers"])
app.include_router(tenant_products.router,  prefix="/api/v1", tags=["Tenant - Products"])
app.include_router(tenant_dashboard.router, prefix="/api/v1", tags=["Tenant - Dashboard"])
app.include_router(tenant_events.router,    prefix="/api/v1", tags=["Tenant - Events"])
app.include_router(tenant_alerts.router,    prefix="/api/v1", tags=["Tenant - Alerts"])
app.include_router(tenant_analysis.router,  prefix="/api/v1", tags=["Tenant - Analysis"])
app.include_router(tenant_market.router,       prefix="/api/v1", tags=["Tenant - Market"])
app.include_router(tenant_alert_rules.router, prefix="/api/v1", tags=["Tenant - Alert Rules"])
app.include_router(tenant_users.router,      prefix="/api/v1", tags=["Tenant - Users"])
app.include_router(tenant_scope,             prefix="/api/v1", tags=["Tenant - Scope"])
app.include_router(tenant_assistant.router,  prefix="/api/v1", tags=["Tenant - Assistant"])
app.include_router(tenant_reports.router,    prefix="/api/v1", tags=["Tenant - Reports"])


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "api"}
