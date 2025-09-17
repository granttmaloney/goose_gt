import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../../utils';

export interface ProgressStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  details?: string;
  timestamp: string;
}

export interface ProgressTrackerProps {
  steps: ProgressStep[];
  currentStep?: string;
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  className?: string;
}

const getStatusIcon = (status: ProgressStep['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'in_progress':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'pending':
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

const getStatusColor = (status: ProgressStep['status']) => {
  switch (status) {
    case 'completed':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'failed':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'in_progress':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'pending':
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

const getOverallStatusColor = (status: ProgressTrackerProps['overallStatus']) => {
  switch (status) {
    case 'completed':
      return 'text-green-600';
    case 'failed':
      return 'text-red-600';
    case 'in_progress':
      return 'text-blue-600';
    case 'pending':
    default:
      return 'text-gray-600';
  }
};

export default function ExtensionProgressTracker({
  steps,
  currentStep,
  overallStatus,
  startTime,
  endTime,
  className,
}: ProgressTrackerProps) {
  const completedSteps = steps.filter((step) => step.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const getDuration = () => {
    if (!startTime) return null;
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);

    if (duration < 60) {
      return `${duration}s`;
    } else {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return `${minutes}m ${seconds}s`;
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overall Progress Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-textStandard">Extension Generation Progress</h3>
          <span className={cn('text-xs font-medium', getOverallStatusColor(overallStatus))}>
            {overallStatus.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        <div className="text-xs text-textSubtle">
          {completedSteps}/{totalSteps} steps • {getDuration()}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-background-subtle rounded-full h-2 overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out',
            overallStatus === 'failed' ? 'bg-red-500' : 'bg-blue-500'
          )}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border transition-all duration-200',
              getStatusColor(step.status),
              step.id === currentStep && 'ring-2 ring-blue-200'
            )}
          >
            <div className="flex-shrink-0 mt-0.5">{getStatusIcon(step.status)}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{step.title}</span>
                {step.id === currentStep && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Current
                  </span>
                )}
              </div>

              <p className="text-sm text-textSubtle mt-1">{step.message}</p>

              {step.details && (
                <p className="text-xs text-textSubtle mt-1 font-mono bg-background-subtle px-2 py-1 rounded">
                  {step.details}
                </p>
              )}

              <p className="text-xs text-textSubtle mt-1">
                {new Date(step.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {overallStatus === 'completed' && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-sm font-medium text-green-800">Extension generated successfully!</p>
            <p className="text-xs text-green-600">All steps completed in {getDuration()}</p>
          </div>
        </div>
      )}

      {overallStatus === 'failed' && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800">Extension generation failed</p>
            <p className="text-xs text-red-600">Check the error details above</p>
          </div>
        </div>
      )}
    </div>
  );
}
