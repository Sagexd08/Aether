import hmac
import os
import logging
from flask import Flask, request, jsonify
from datetime import datetime


logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
logger = logging.getLogger('ml_service')

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024

def _env_from_dotenv(key: str) -> str:
    if os.getenv(key):
        return os.environ[key]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    try:
        with open(path, encoding='utf-8-sig') as f:
            for line in f:
                if line.startswith(key + '='):
                    return line.split('=', 1)[1].strip()
    except OSError:
        pass
    return ''


INTERNAL_TOKEN = _env_from_dotenv('ML_INTERNAL_TOKEN')
if not INTERNAL_TOKEN:
    raise RuntimeError('ML_INTERNAL_TOKEN must be set (the Node server sends it as X-Internal-Token)')

t2i_service = None

app.healthy = False


@app.before_request
def before_request():
    if request.path != '/health':
        given = request.headers.get('X-Internal-Token', '')
        if not hmac.compare_digest(given.encode(), INTERNAL_TOKEN.encode()):
            return jsonify({'error': 'Unauthorized'}), 401
    logger.info(f"{request.method} {request.path}")


@app.after_request
def after_request(response):
    logger.info(f"Response: {response.status_code}")
    return response


@app.route('/health', methods=['GET'])
def health_check():
    if app.healthy:
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'models': {
                't2i': f'loaded (step {t2i_service.step})',
            }
        }), 200
    else:
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'reason': 'T2I checkpoint not loaded'
        }), 503


@app.route('/ml/generate-image', methods=['POST'])
def generate_image():
    if t2i_service is None:
        return jsonify({'error': 'T2I model not loaded (no checkpoint yet)'}), 503
    data = request.get_json(silent=True) or {}
    prompt = data.get('prompt')
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 500:
        return jsonify({'error': 'prompt must be a non-empty string up to 500 chars'}), 400
    try:
        image = t2i_service.generate_b64(
            prompt, steps=data.get('steps', 30), cfg=data.get('cfg', 3.0), seed=data.get('seed', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'steps, cfg and seed must be numbers'}), 400
    return jsonify({'image_base64': image, 'mime': 'image/png', 'train_step': t2i_service.step})


@app.route('/ml/upscale', methods=['POST'])
def upscale_image():
    import base64
    import io
    from PIL import Image
    data = request.get_json(silent=True) or {}
    scale = data.get('scale', 2)
    if scale not in (2, 4) or not isinstance(data.get('image_base64'), str):
        return jsonify({'error': 'image_base64 (string) and scale (2 or 4) are required'}), 400
    try:
        img = Image.open(io.BytesIO(base64.b64decode(data['image_base64']))).convert('RGB')
    except Exception:
        return jsonify({'error': 'image_base64 is not a valid image'}), 400
    if img.width * img.height > 2048 * 2048:
        return jsonify({'error': 'image too large'}), 400
    out = io.BytesIO()
    img.resize((img.width * scale, img.height * scale), Image.LANCZOS).save(out, format='PNG')
    return jsonify({'image_base64': base64.b64encode(out.getvalue()).decode(), 'mime': 'image/png'})


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500


def initialize_models():
    try:
        logger.info("Initializing ML models...")
        
        global t2i_service
        try:
            from t2i_service import T2IService
            t2i_service = T2IService(os.getenv('T2I_CKPT'))
            logger.info(f"T2I loaded from {t2i_service.ckpt} (step {t2i_service.step})")
        except FileNotFoundError as e:
            logger.warning(f"T2I not loaded: {e}")

        app.healthy = t2i_service is not None
        logger.info("ML models initialized" if app.healthy else "No model loaded; /health reports unhealthy")
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")
        app.healthy = False


if __name__ == '__main__':
    from waitress import serve

    initialize_models()
    port = int(os.getenv('ML_SERVICE_PORT', 5000))
    host = os.getenv('ML_HOST', '127.0.0.1')
    logger.info(f"Starting ML Service on {host}:{port}")
    serve(app, host=host, port=port, threads=4)
