import { existsSync, mkdirSync } from 'fs';
import { config } from '../config/env.js';
import path from 'path';

export function ensureDirectories() {
  const dirs = [config.uploadDir, config.trainingDir, config.modelsDir];
  
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export const uploadFileName = (storedPath: string): string => storedPath.split(/[\\/]/).pop() ?? '';

export const publicUploadUrl = (storedPath: string | null | undefined): string | null =>
  storedPath ? `/uploads/${uploadFileName(storedPath)}` : null;

export function getUploadPath(filename: string): string {
  return path.join(config.uploadDir, filename);
}
