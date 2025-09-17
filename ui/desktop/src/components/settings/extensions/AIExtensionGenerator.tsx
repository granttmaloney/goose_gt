import { useState, useCallback } from 'react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Loader2, Sparkles, AlertCircle, X } from 'lucide-react';
import {
  generateExtensionWithProgress,
  ExtensionGenerationResult,
} from '../../../lib/extensionStreaming';
import ExtensionProgressTracker, { ProgressStep } from './ExtensionProgressTracker';
import { toast } from 'react-hot-toast';

type GeneratedExtension = Record<string, unknown> | undefined;
interface AIExtensionGeneratorProps {
  onExtensionGenerated?: (extension?: GeneratedExtension) => void;
}

export default function AIExtensionGenerator({ onExtensionGenerated }: AIExtensionGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string | undefined>();
  const [overallStatus, setOverallStatus] = useState<
    'pending' | 'in_progress' | 'completed' | 'failed'
  >('pending');
  const [startTime, setStartTime] = useState<string | undefined>();
  const [endTime, setEndTime] = useState<string | undefined>();

  // Initialize progress steps
  const initializeProgressSteps = useCallback(() => {
    const steps: ProgressStep[] = [
      {
        id: 'validate_request',
        title: 'Validating request',
        status: 'pending',
        message: 'Waiting...',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'check_podman',
        title: 'Checking Podman availability',
        status: 'pending',
        message: 'Waiting...',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'generate_code',
        title: 'Generating extension code',
        status: 'pending',
        message: 'Waiting...',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'parse_response',
        title: 'Parsing AI response',
        status: 'pending',
        message: 'Waiting...',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'create_extension',
        title: 'Creating extension configuration',
        status: 'pending',
        message: 'Waiting...',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'test_extension',
        title: 'Testing extension',
        status: 'pending',
        message: 'Waiting...',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'finalize',
        title: 'Finalizing extension',
        status: 'pending',
        message: 'Waiting...',
        timestamp: new Date().toISOString(),
      },
    ];
    setProgressSteps(steps);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a description for your extension');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setShowProgress(true);
    setOverallStatus('in_progress');
    setStartTime(new Date().toISOString());
    setEndTime(undefined);
    initializeProgressSteps();

    try {
      await generateExtensionWithProgress(prompt.trim(), {
        onProgress: (progress) => {
          setProgressSteps((prev) =>
            prev.map((s) =>
              s.id === progress.step
                ? {
                    ...s,
                    status: progress.status,
                    message: progress.message,
                    details: progress.details,
                    timestamp: new Date().toISOString(),
                  }
                : s
            )
          );

          if (progress.status === 'in_progress') {
            setCurrentStep(progress.step);
          }
        },
        onComplete: (result: ExtensionGenerationResult) => {
          setEndTime(new Date().toISOString());
          if (result.success) {
            setOverallStatus('completed');
            toast.success('Extension generated successfully!');
            setPrompt('');
            try {
              if (result.response && typeof result.response === 'object') {
                window.localStorage.setItem(
                  'goose:lastGeneratedExtension',
                  JSON.stringify(result.response)
                );
              }
            } catch (e) {
              console.warn('Failed to persist generated extension', e);
            }
            if (result.response && typeof result.response === 'object') {
              onExtensionGenerated?.(result.response as Record<string, unknown>);
            } else {
              onExtensionGenerated?.(undefined);
            }
          } else {
            setOverallStatus('failed');
            setError(result.error || 'Failed to generate extension');
            toast.error('Failed to generate extension');
            // If backend provided a partial extension config in the response, hand it off so the user can fix and retry
            if (result.response && typeof result.response === 'object') {
              try {
                window.localStorage.setItem(
                  'goose:lastGeneratedExtension',
                  JSON.stringify(result.response)
                );
              } catch (e) {
                console.warn('Failed to persist partial generated extension', e);
              }
              onExtensionGenerated?.(result.response as Record<string, unknown>);
              setShowProgress(true);
            }
          }
        },
        onError: (error) => {
          setEndTime(new Date().toISOString());
          setOverallStatus('failed');
          setError(error.message);
          toast.error('Failed to generate extension');
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate extension';
      setError(errorMessage);
      setOverallStatus('failed');
      setEndTime(new Date().toISOString());
      toast.error('Failed to generate extension');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    setIsGenerating(false);
    setShowProgress(false);
    setOverallStatus('pending');
    setError(null);
    setCurrentStep(undefined);
    setStartTime(undefined);
    setEndTime(undefined);
  };

  const examplePrompts = [
    'Create a CSV summarizer extension that reads CSV files and generates statistical summaries',
    'Create a file organizer extension that sorts files by type into different folders',
    'Build a weather extension that fetches current weather data from an API',
    'Make a text summarizer that can summarize long documents',
    'Create a password generator extension with customizable options',
    'Build a system monitor that shows CPU and memory usage',
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI Extension Generator
        </CardTitle>
        <CardDescription>
          Describe what you want your extension to do, and AI will generate the configuration for
          you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="extension-prompt" className="text-sm font-medium">
            Describe your extension
          </label>
          <Textarea
            id="extension-prompt"
            placeholder="e.g., Create a file organizer extension that sorts files by type into different folders..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[100px] resize-none"
            disabled={isGenerating}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Extension...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Extension
              </>
            )}
          </Button>

          {isGenerating && (
            <Button onClick={handleCancel} variant="outline" size="sm" className="px-3">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Progress Tracker */}
        {showProgress && (
          <div className="mt-6">
            <ExtensionProgressTracker
              steps={progressSteps}
              currentStep={currentStep}
              overallStatus={overallStatus}
              startTime={startTime}
              endTime={endTime}
            />
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Example prompts:</h4>
          <div className="space-y-1">
            {examplePrompts.map((example, index) => (
              <button
                key={index}
                onClick={() => setPrompt(example)}
                className="block w-full text-left text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 p-2 rounded transition-colors"
                disabled={isGenerating}
              >
                "{example}"
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
