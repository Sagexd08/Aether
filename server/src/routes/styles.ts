import { Router, Request, Response } from 'express';
import { generalApiRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.get('/', generalApiRateLimiter, (req: Request, res: Response) => {
  const styles = [
    {
      id: 'realistic',
      name: 'Realistic',
      description: 'Photorealistic images with high detail',
      tags: ['photorealistic', '8k', 'professional photography'],
    },
    {
      id: 'anime',
      name: 'Anime',
      description: 'Anime-style illustrations',
      tags: ['anime', 'vibrant colors', 'detailed'],
    },
    {
      id: 'fantasy',
      name: 'Fantasy',
      description: 'Fantasy art with dramatic lighting',
      tags: ['fantasy art', 'epic', 'dramatic lighting'],
    },
    {
      id: 'cyberpunk',
      name: 'Cyberpunk',
      description: 'Futuristic cyberpunk aesthetics',
      tags: ['cyberpunk', 'neon lights', 'futuristic'],
    },
    {
      id: 'portrait',
      name: 'Portrait',
      description: 'Professional portrait photography',
      tags: ['portrait', 'professional', 'bokeh'],
    },
  ];

  res.json({ styles });
});

export default router;

