import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  job_id: string;
  status: JobStatus;
  progress: number;
  progress_message?: string;
  error_message?: string;
  result?: {
    request_id: string;
    image_url: string;
  };
  created_at: string;
  updated_at?: string;
}

interface UseJobPollingOptions {
  pollInterval?: number;
  onComplete?: (job: Job) => void;
  onError?: (error: string) => void;
}

export function useJobPolling(options: UseJobPollingOptions = {}) {
  const { pollInterval = 1000, onComplete, onError } = options;
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPolling = useCallback((jobId: string) => {
    setIsPolling(true);
    setActiveJob({ job_id: jobId, status: 'pending', progress: 0, created_at: new Date().toISOString() });

    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/jobs/status/${jobId}`, { credentials: 'same-origin' });

        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const job: Job = await response.json();
        setActiveJob(job);

        if (job.status === 'completed') {
          setIsPolling(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          const resultResponse = await fetch(`${API_BASE}/api/jobs/result/${jobId}`, { credentials: 'same-origin' });
          if (!resultResponse.ok) {
            onError?.('Failed to load the generated image');
            return;
          }
          const full: Job = await resultResponse.json();
          setActiveJob(full);
          onComplete?.(full);
          return;
        }

        if (job.status === 'failed' || job.status === 'cancelled') {
          setIsPolling(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          onError?.(job.error_message || `Job ${job.status}`);
          return;
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    poll();

    pollingRef.current = setInterval(poll, pollInterval);
  }, [pollInterval, onComplete, onError]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/jobs/cancel/${jobId}`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel job');
      }

      stopPolling();
      return true;
    } catch (error) {
      console.error('Cancel error:', error);
      return false;
    }
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  return {
    activeJob,
    isPolling,
    startPolling,
    stopPolling,
    cancelJob,
  };
}
