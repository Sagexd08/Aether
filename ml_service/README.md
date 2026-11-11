# ml_service

Flask app served by waitress on 127.0.0.1:5000. Loads the text-to-image model and exposes it to the API.

- Requires header `X-Internal-Token` (value of `ML_INTERNAL_TOKEN`) on every request.
- `GET /health` reports unhealthy until the model is loaded.
- Weights are loaded with `torch.load(weights_only=True)`.
- Run: `pip install -r requirements.txt && python app.py`
- Training code lives in `../training`.
