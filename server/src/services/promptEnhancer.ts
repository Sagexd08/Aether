export interface EnhancedPrompt {
  positive: string;
  negative: string;
  suggestions: string[];
}

export class PromptEnhancer {
  private negativePromptTemplates = [
    'blurry, low quality, distorted, ugly, bad anatomy, bad proportions',
    'watermark, signature, text, logo, username',
    'deformed, disfigured, poorly drawn, bad hands, missing fingers',
    'extra limbs, extra fingers, mutated, mutation',
    'jpeg artifacts, compression artifacts, noise, grain',
  ];

  enhancePrompt(prompt: string, style?: string): EnhancedPrompt {
    let enhanced = prompt.trim();
    
    if (style) {
      enhanced = this.applyStyle(enhanced, style);
    }

    enhanced = this.improveClarity(enhanced);

    const negative = this.generateNegativePrompt(enhanced);

    const suggestions = this.generateSuggestions(enhanced);

    return {
      positive: enhanced,
      negative,
      suggestions,
    };
  }

  private applyStyle(prompt: string, style: string): string {
    const styleMap: Record<string, string> = {
      'realistic': 'photorealistic, highly detailed, 8k, professional photography',
      'anime': 'anime style, vibrant colors, detailed, high quality',
      'fantasy': 'fantasy art, epic, dramatic lighting, highly detailed',
      'cyberpunk': 'cyberpunk, neon lights, futuristic, dark atmosphere',
      'portrait': 'portrait photography, professional, sharp focus, bokeh',
    };

    const styleTags = styleMap[style] || '';
    return styleTags ? `${prompt}, ${styleTags}` : prompt;
  }

  private improveClarity(prompt: string): string {
    return prompt
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .trim();
  }

  private generateNegativePrompt(prompt: string): string {
    return this.negativePromptTemplates.join(', ');
  }

  private generateSuggestions(prompt: string): string[] {
    return [
      `${prompt}, highly detailed, 8k`,
      `${prompt}, cinematic lighting, dramatic`,
      `${prompt}, professional photography, sharp focus`,
    ];
  }
}

