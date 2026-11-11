import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

const dim = z.number().int().min(256).max(768).refine((n) => n % 8 === 0, 'must be a multiple of 8');

export const generateSchema = z.object({
  positive_prompt: z.string().trim().min(1).max(1000),
  negative_prompt: z.string().max(1000).optional(),
  model: z.string().max(64).default('sd15'),
  steps: z.number().int().min(1).max(50).default(20),
  cfg_scale: z.number().min(1).max(6).default(3),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
  width: dim.default(512),
  height: dim.default(512),
});

const idString = z.string().regex(/^[\w-]{1,64}$/, 'invalid id');

export const upscaleSchema = z
  .object({
    image_url: z.string().max(300).optional(),
    request_id: idString.optional(),
    scale: z.union([z.literal(2), z.literal(4)]).default(2),
    face_restore: z.boolean().default(false),
  })
  .refine((v) => v.image_url || v.request_id, { message: 'Either image_url or request_id is required' });

export const enhanceSchema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  style: z.string().max(64).optional(),
});

const emailField = z.string().trim().toLowerCase().email('must be a valid email').max(254);
const passwordBytes = (v: string) => Buffer.byteLength(v, 'utf8') <= 72;

export const registerSchema = z.object({
  email: emailField,
  password: z.string().min(10, 'must be at least 10 characters').refine(passwordBytes, 'must be at most 72 bytes'),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).refine(passwordBytes, 'must be at most 72 bytes'),
});

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const preferencesSchema = z
  .object({
    default_model: z.string().trim().min(1).max(64).optional(),
    ui_mode: z.string().trim().min(1).max(32).optional(),
    experience_level: z.string().trim().min(1).max(32).optional(),
    preferred_resolution: z.string().trim().regex(/^\d{2,4}x\d{2,4}$/, 'must look like 512x512').optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: idString });

export const validateParams = (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.params);
  if (!result.success) return res.status(400).json({ error: `${result.error.issues[0].path.join('.')}: ${result.error.issues[0].message}` });
  next();
};

export const validateQuery = (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.query);
  if (!result.success) return res.status(400).json({ error: `${result.error.issues[0].path.join('.')}: ${result.error.issues[0].message}` });
  req.query = result.data as Request['query'];
  next();
};

export const validateBody = (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    return res.status(400).json({ error: `${issue.path.join('.') || 'body'}: ${issue.message}` });
  }
  req.body = result.data;
  next();
};
