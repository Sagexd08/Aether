import axios from 'axios';
import { randomInt } from 'crypto';
import { mlHttp, callMl, MlUnavailableError } from './mlClient.js';

export interface GenerationRequest {
  prompt: string;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  negative_prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}

const DEFAULT_STEPS = 30;
const DEFAULT_CFG = 3;
const MAX_CFG = 6;
const mlClient = mlHttp;

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? error.message;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

export async function generateImage(request: GenerationRequest): Promise<Buffer> {
  try {
    const { data } = await callMl(() =>
      mlClient.post('/ml/generate-image', {
        prompt: request.prompt,
        steps: request.steps ?? DEFAULT_STEPS,
        cfg: Math.min(Math.max(request.cfg_scale ?? DEFAULT_CFG, 1), MAX_CFG),
        seed: request.seed ?? randomInt(0, 2 ** 31),
      }, { signal: request.signal })
    );
    return Buffer.from(data.image_base64, 'base64');
  } catch (error: unknown) {
    if (error instanceof MlUnavailableError) throw error;
    if (axios.isCancel(error)) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
    throw new Error(`Image generation failed: ${errorMessage(error)}`);
  }
}

export async function upscaleImage(image: Buffer, scale: 2 | 4 = 2): Promise<Buffer> {
  try {
    const { data } = await callMl(() =>
      mlClient.post('/ml/upscale', { image_base64: image.toString('base64'), scale })
    );
    return Buffer.from(data.image_base64, 'base64');
  } catch (error: unknown) {
    if (error instanceof MlUnavailableError) throw error;
    throw new Error(`Upscale failed: ${errorMessage(error)}`);
  }
}
