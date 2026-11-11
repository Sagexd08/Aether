import { fail } from '../utils/httpError.js';
import { Router, Request, Response } from 'express';
import { promptEnhancementRateLimiter } from '../middleware/rateLimit.js';
import { PromptEnhancer } from '../services/promptEnhancer.js';
import { validateBody, enhanceSchema } from '../middleware/validate.js';
import { checkPrompt } from '../services/promptPolicy.js';

const router = Router();
const enhancer = new PromptEnhancer();

router.post('/', promptEnhancementRateLimiter, validateBody(enhanceSchema), (req: Request, res: Response) => {
  try {
    const { prompt, style } = req.body;

    const policy = checkPrompt(prompt);
    if (!policy.allowed) {
      return res.status(422).json({ error: 'This prompt is not allowed.', flags: policy.flags });
    }

    const enhanced = enhancer.enhancePrompt(policy.normalized, style);

    res.json(enhanced);
  } catch (error: any) {
    fail(req, res, error);
  }
});

export default router;

