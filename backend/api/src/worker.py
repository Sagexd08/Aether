from celery import Celery
from .config import get_settings

settings = get_settings()
celery_app = Celery('aether', broker=settings.redis_url, backend=settings.redis_url)


@celery_app.task(name='aether.generations.process')
def process_generation_task(generation_id: str) -> dict[str, str]:
    return {'generation_id': generation_id, 'status': 'processed'}
