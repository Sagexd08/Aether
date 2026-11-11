import { JobStatus } from '../hooks/useJobPolling';

interface GenerationProgressProps {
  status: JobStatus;
  progress: number;
  message?: string;
  onCancel?: () => void;
}

export function GenerationProgress({ status, progress, message, onCancel }: GenerationProgressProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'cancelled':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return 'Waiting in queue...';
      case 'running':
        return message || 'Processing...';
      case 'completed':
        return 'Complete!';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const isActive = status === 'pending' || status === 'running';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {getStatusText()}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {progress}%
        </span>
      </div>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-3">
        <div
          className={`${getStatusColor()} h-2.5 rounded-full transition-all duration-500`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {isActive && onCancel && (
        <button
          onClick={onCancel}
          className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          Cancel Generation
        </button>
      )}
    </div>
  );
}
