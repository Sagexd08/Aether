import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const trustProxy = z
  .string()
  .default('')
  .transform((raw, ctx): number | string => {
    const v = raw.trim();
    if (v === '' || v === 'false') return 0;
    if (/^\d+$/.test(v)) return Number(v);
    if (v === 'true') {
      ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY=true trusts every hop and allows IP spoofing; use a hop count such as 1' });
      return z.NEVER;
    }
    return v;
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'is required'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  IP_HASH_SALT: z
    .string()
    .min(16, 'must be at least 16 characters')
    .refine((v) => v !== 'default-salt-change-me', 'must not be the built-in default'),
  ADMIN_API_TOKEN: z.string().default(''),
  ML_INTERNAL_TOKEN: z.string().min(24, 'must be at least 24 characters (ml_service refuses to start without it)'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:5000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: trustProxy,
  UPLOAD_DIR: z.string().default('./uploads'),
  MODELS_DIR: z.string().default('./models'),
  TRAINING_DIR: z.string().default('./training'),
  DATABASE_PATH: z.string().default('./data/lexigraph.db'),
  UPLOAD_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`);
  console.error(`Invalid environment:\n  ${lines.join('\n  ')}`);
  process.exit(1);
}
const env = parsed.data;
if (env.NODE_ENV === 'production' && env.ADMIN_API_TOKEN.length < 24) {
  console.error('Invalid environment:\n  ADMIN_API_TOKEN: must be at least 24 characters in production');
  process.exit(1);
}

export const config = {
  isProd: env.NODE_ENV === 'production',
  trustProxy: env.TRUST_PROXY,
  port: env.PORT,
  adminApiToken: env.ADMIN_API_TOKEN,
  ipHashSalt: env.IP_HASH_SALT,
  jwtSecret: env.JWT_SECRET,
  jwtRefreshSecret: env.JWT_REFRESH_SECRET,
  databaseUrl: env.DATABASE_URL,
  databasePath: env.DATABASE_PATH,
  modelsDir: env.MODELS_DIR,
  uploadDir: env.UPLOAD_DIR,
  trainingDir: env.TRAINING_DIR,
  corsOrigin: env.CORS_ORIGIN,
  mlServiceUrl: env.ML_SERVICE_URL,
  mlInternalToken: env.ML_INTERNAL_TOKEN,
  uploadRetentionDays: env.UPLOAD_RETENTION_DAYS,
};
