import base64
import io
import os
import sys
from pathlib import Path

import pytest
from PIL import Image

TOKEN = "test-ml-token-0123456789abcdef0123"
os.environ["ML_INTERNAL_TOKEN"] = TOKEN
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as ml_app  # noqa: E402


class FakeT2I:
    step = 4242
    ckpt = "fake"

    def generate_b64(self, prompt, steps=30, cfg=3.0, seed=0):
        if not isinstance(steps, (int, float)):
            raise TypeError("steps")
        return base64.b64encode(b"png").decode()


@pytest.fixture
def client():
    ml_app.app.testing = True
    ml_app.t2i_service = None
    ml_app.app.healthy = False
    return ml_app.app.test_client()


@pytest.fixture
def loaded(client):
    ml_app.t2i_service = FakeT2I()
    ml_app.app.healthy = True
    return client


AUTH = {"X-Internal-Token": TOKEN}


def png_b64(size=(2, 2)):
    buf = io.BytesIO()
    Image.new("RGB", size, (10, 20, 30)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def test_health_is_public_and_unhealthy_without_model(client):
    assert client.get("/health").status_code == 503


def test_health_reports_loaded_step(loaded):
    response = loaded.get("/health")
    assert response.status_code == 200
    assert "4242" in response.get_json()["models"]["t2i"]


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Token": "wrong"}])
def test_rejects_missing_or_wrong_token(client, headers):
    assert client.post("/ml/generate-image", json={"prompt": "a bird"}, headers=headers).status_code == 401


def test_generate_unavailable_without_model(client):
    assert client.post("/ml/generate-image", json={"prompt": "a bird"}, headers=AUTH).status_code == 503


def test_generate_returns_image_and_train_step(loaded):
    response = loaded.post("/ml/generate-image", json={"prompt": "a bird", "steps": 5}, headers=AUTH)
    assert response.status_code == 200
    body = response.get_json()
    assert body["train_step"] == 4242
    assert body["mime"] == "image/png"


@pytest.mark.parametrize("payload", [{}, {"prompt": ""}, {"prompt": "   "}, {"prompt": 5}, {"prompt": "x" * 501}])
def test_generate_rejects_bad_prompts(loaded, payload):
    assert loaded.post("/ml/generate-image", json=payload, headers=AUTH).status_code == 400


def test_generate_rejects_non_numeric_steps(loaded):
    assert loaded.post("/ml/generate-image", json={"prompt": "a bird", "steps": "x"}, headers=AUTH).status_code == 400


@pytest.mark.parametrize("scale", [2, 4])
def test_upscale_multiplies_dimensions(client, scale):
    response = client.post("/ml/upscale", json={"image_base64": png_b64(), "scale": scale}, headers=AUTH)
    assert response.status_code == 200
    out = Image.open(io.BytesIO(base64.b64decode(response.get_json()["image_base64"])))
    assert out.size == (2 * scale, 2 * scale)


@pytest.mark.parametrize(
    "payload",
    [{"scale": 2}, {"image_base64": png_b64(), "scale": 3}, {"image_base64": "not-base64!!", "scale": 2}],
)
def test_upscale_rejects_bad_input(client, payload):
    assert client.post("/ml/upscale", json=payload, headers=AUTH).status_code == 400


def test_unknown_route_is_404_json(client):
    response = client.get("/nope", headers=AUTH)
    assert response.status_code == 404
    assert response.get_json() == {"error": "Endpoint not found"}
