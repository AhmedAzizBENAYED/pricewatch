import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = os.getenv("REDIS_PORT", "6379")
broker_url = f"redis://{redis_host}:{redis_port}/0"
backend_url = f"redis://{redis_host}:{redis_port}/1"

celery_app = Celery(
    "pfe_worker",
    broker=broker_url,
    backend=backend_url,
    include=[
        "src.scraper.tasks.pipeline",
        "src.scraper.tasks.normalization",
        "src.worker.tasks.report_generator",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Africa/Tunis",
    enable_utc=True,
    task_track_started=True,
    task_routes={
        "scraping.launch_pipeline": {"queue": "celery"},
        "scraping.scrape_homepage": {"queue": "celery"},
        "scraping.scrape_category": {"queue": "categories"},
        "scraping.scrape_product":  {"queue": "products"},
        "scraping.watchdog":        {"queue": "celery"},
        "normalize.offer":          {"queue": "celery"},
        "normalize.batch":          {"queue": "celery"},
        "normalize.batch_match":    {"queue": "celery"},
    },
    beat_schedule={
        "scraper-watchdog": {
            "task": "scraping.watchdog",
            "schedule": 30.0,
        },
    },
)
