import axios from 'axios';

const API_BASE = '/api';

export interface GenerationRequest {
  positive_prompt: string;
  negative_prompt?: string;
  model?: string;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  width?: number;
  height?: number;
}

export interface GenerationResponse {
  request_id: string;
  image_url: string;
  created_at: string;
}

export interface HistoryItem {
  request_id: string;
  positive_prompt: string;
  negative_prompt?: string;
  model: string;
  steps: number;
  cfg_scale: number;
  seed?: number;
  width: number;
  height: number;
  image_url: string;
  created_at: string;
}

export interface Style {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export const api = {
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const response = await axios.post(`${API_BASE}/generate`, request);
    return response.data;
  },

  async getHistory(limit = 50, offset = 0): Promise<{ results: HistoryItem[]; total: number }> {
    const response = await axios.get(`${API_BASE}/history`, {
      params: { limit, offset },
    });
    return response.data;
  },

  async getPrompt(requestId: string): Promise<HistoryItem> {
    const response = await axios.get(`${API_BASE}/prompts/${requestId}`);
    return response.data;
  },

  async deletePrompt(requestId: string): Promise<void> {
    await axios.delete(`${API_BASE}/prompts/${requestId}`);
  },

  async upscale(imageUrl: string, scale = 2, faceRestore = false): Promise<GenerationResponse> {
    const response = await axios.post(`${API_BASE}/upscale`, {
      image_url: imageUrl,
      scale,
      face_restore: faceRestore,
    });
    return response.data;
  },

  async getStyles(): Promise<{ styles: Style[] }> {
    const response = await axios.get(`${API_BASE}/styles`);
    return response.data;
  },

  async enhancePrompt(prompt: string, style?: string): Promise<{
    positive: string;
    negative: string;
    suggestions: string[];
  }> {
    const response = await axios.post(`${API_BASE}/enhance-prompt`, { prompt, style });
    return response.data;
  },
};

