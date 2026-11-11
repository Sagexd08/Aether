FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ML_HOST=0.0.0.0 \
    ML_SERVICE_PORT=5000
WORKDIR /app
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch
COPY ml_service/requirements.txt ml_service/requirements.txt
RUN pip install -r ml_service/requirements.txt
COPY ml_service ml_service
COPY training training
RUN useradd --system --uid 10001 --home /app app \
    && mkdir -p /app/data/cache /app/runs \
    && chown -R app:app /app/data /app/runs
USER app
WORKDIR /app/ml_service
EXPOSE 5000
HEALTHCHECK --interval=20s --timeout=3s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/health').status == 200 else 1)"
CMD ["python", "app.py"]
