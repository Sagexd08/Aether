import { useState } from 'react';

interface Generation {
  request_id: string;
  job_id: string;
  image_url: string | null;
  positive_prompt: string;
  negative_prompt?: string;
  model: string;
  steps: number;
  cfg_scale: number;
  seed?: number;
  width: number;
  height: number;
  created_at: string;
}

interface GenerationCardProps {
  generation: Generation;
  onRegenerate?: (generation: Generation) => void;
  onUpscale?: (requestId: string) => void;
  onRemix?: (generation: Generation) => void;
  onDownload?: (generation: Generation) => void;
}

export function GenerationCard({
  generation,
  onRegenerate,
  onUpscale,
  onRemix,
  onDownload,
}: GenerationCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  const handleDownload = () => {
    if (!generation.image_url) return;

    const link = document.createElement('a');
    link.href = generation.image_url;
    link.download = `aether-${generation.request_id}.png`;
    link.click();

    const metadata = {
      ...generation,
      downloaded_at: new Date().toISOString(),
    };
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: 'application/json',
    });
    const metadataUrl = URL.createObjectURL(metadataBlob);
    const metadataLink = document.createElement('a');
    metadataLink.href = metadataUrl;
    metadataLink.download = `aether-${generation.request_id}.json`;
    metadataLink.click();
    URL.revokeObjectURL(metadataUrl);

    onDownload?.(generation);
  };

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 transition-shadow hover:shadow-md"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-900">
        {generation.image_url ? (
          <img
            src={generation.image_url}
            alt={generation.positive_prompt}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            No image
          </div>
        )}

        {isHovered && generation.image_url && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
            <button
              onClick={() => onRegenerate?.(generation)}
              className="px-3 py-1.5 bg-white text-gray-900 rounded-md text-sm font-medium hover:bg-gray-100"
              title="Regenerate"
            >
              ↻
            </button>
            <button
              onClick={() => onUpscale?.(generation.request_id)}
              className="px-3 py-1.5 bg-white text-gray-900 rounded-md text-sm font-medium hover:bg-gray-100"
              title="Upscale"
            >
              ⧉
            </button>
            <button
              onClick={() => onRemix?.(generation)}
              className="px-3 py-1.5 bg-white text-gray-900 rounded-md text-sm font-medium hover:bg-gray-100"
              title="Remix"
            >
              ✦
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-white text-gray-900 rounded-md text-sm font-medium hover:bg-gray-100"
              title="Download"
            >
              ↓
            </button>
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-2">
          {generation.positive_prompt}
        </p>

        <button
          onClick={() => setShowMetadata(!showMetadata)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {showMetadata ? 'Hide details' : 'Show details'}
        </button>

        {showMetadata && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Model:</span>
              <span className="text-gray-700 dark:text-gray-300">{generation.model}</span>
            </div>
            <div className="flex justify-between">
              <span>Steps:</span>
              <span className="text-gray-700 dark:text-gray-300">{generation.steps}</span>
            </div>
            <div className="flex justify-between">
              <span>CFG:</span>
              <span className="text-gray-700 dark:text-gray-300">{generation.cfg_scale}</span>
            </div>
            {generation.seed && (
              <div className="flex justify-between">
                <span>Seed:</span>
                <span className="text-gray-700 dark:text-gray-300">{generation.seed}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Size:</span>
              <span className="text-gray-700 dark:text-gray-300">{generation.width}x{generation.height}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
