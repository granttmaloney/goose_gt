import { useState } from 'react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { generateExtensionFromPrompt } from '../../../api/sdk.gen';
import { toast } from 'react-hot-toast';

interface AIExtensionGeneratorProps {
  onExtensionGenerated?: () => void;
}

export default function AIExtensionGenerator({ onExtensionGenerated }: AIExtensionGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a description for your extension');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await generateExtensionFromPrompt({
        body: { prompt: prompt.trim() },
      });

      if (response.data?.extensions) {
        toast.success('Extension generated successfully!');
        setPrompt('');
        onExtensionGenerated?.();
      } else {
        setError('Failed to generate extension');
        toast.error('Failed to generate extension');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate extension';
      setError(errorMessage);
      toast.error('Failed to generate extension');
    } finally {
      setIsGenerating(false);
    }
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

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full"
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
