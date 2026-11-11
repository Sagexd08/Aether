import { useEffect, useState } from 'react';
import { GenerationCard } from './GenerationCard';
import { useReveal } from '../hooks/useReveal';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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

interface RecentGenerationsProps {
  onRegenerate?: (generation: Generation) => void;
  onUpscale?: (requestId: string) => void;
  onRemix?: (generation: Generation) => void;
  refreshTrigger?: number;
}

export function RecentGenerations({
  onRegenerate,
  onUpscale,
  onRemix,
  refreshTrigger = 0,
}: RecentGenerationsProps) {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useReveal<HTMLDivElement>([generations]);

  useEffect(() => {
    const fetchGenerations = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE}/api/jobs/history?limit=10`, { credentials: 'same-origin' });

        if (!response.ok) {
          throw new Error('Failed to fetch generations');
        }

        const data = await response.json();
        setGenerations(data.generations || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchGenerations();
  }, [refreshTrigger]);

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading recent generations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Error: {error}
      </div>
    );
  }

  if (generations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p className="mb-2">No generations yet</p>
        <p className="text-sm">Your recent generations will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Recent Generations
      </h3>
      <div ref={gridRef} className="grid grid-cols-1 gap-4">
        {generations.map((generation) => (
          <div key={generation.request_id} data-reveal>
            <GenerationCard
              generation={generation}
              onRegenerate={onRegenerate}
              onUpscale={onUpscale}
              onRemix={onRemix}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
