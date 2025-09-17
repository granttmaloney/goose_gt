// Extension streaming client for real-time progress updates
import { client } from '../api/client.gen';

export interface ExtensionGenerationProgress {
  type: 'progress';
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  details?: string;
}

export interface ExtensionGenerationComplete {
  type: 'extension_complete';
  success: boolean;
  response?: unknown;
  error?: string;
  extension?: unknown;
}

export type ExtensionGenerationEvent = ExtensionGenerationProgress | ExtensionGenerationComplete;

export interface ExtensionGenerationCallbacks {
  onProgress?: (progress: ExtensionGenerationProgress) => void;
  onComplete?: (result: ExtensionGenerationComplete) => void;
  onError?: (error: Error) => void;
}

export interface ExtensionGenerationResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

export class ExtensionStreamingClient {
  private abortController: AbortController | null = null;

  async generateExtensionWithProgress(
    prompt: string,
    callbacks: ExtensionGenerationCallbacks = {}
  ): Promise<ExtensionGenerationResult> {
    try {
      const config = client.getConfig();
      const baseUrl = config.baseUrl || 'http://localhost:3000';
      const headers = (config.headers as Record<string, string>) || {};
      let secretKey: string | undefined;
      try {
        // Prefer the Electron-provided secret to avoid stale client config
        const electronApi = (
          window as unknown as {
            electron?: { getSecretKey?: () => Promise<string> };
          }
        ).electron;
        if (electronApi?.getSecretKey) {
          secretKey = await electronApi.getSecretKey();
        }
      } catch {
        // ignore and fall back to client headers
        // optional debug suppressed to satisfy no-unused-vars
      }
      if (!secretKey) {
        secretKey = headers['X-Secret-Key'] as string | undefined;
      }
      if (!secretKey) {
        const error = new Error('Missing server secret; cannot authenticate streaming request');
        callbacks.onError?.(error);
        throw error;
      }

      const url = new URL('/extensions/generate/stream', baseUrl);
      // Include query param for compatibility and header-based auth for consistency
      url.searchParams.set('secret_key', secretKey);

      this.abortController = new AbortController();

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret-Key': secretKey,
        },
        body: JSON.stringify({ prompt }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        callbacks.onError?.(error);
        throw error;
      }

      if (!response.body) {
        const error = new Error('No response body for SSE stream');
        callbacks.onError?.(error);
        throw error;
      }

      const reader = response.body.getReader();
      // In Electron/Node, TextDecoder might be provided by util
      let decoder: { decode: (input: Uint8Array, opts?: { stream?: boolean }) => string };
      const g = globalThis as unknown as {
        TextDecoder?: new () => {
          decode: (input: Uint8Array, opts?: { stream?: boolean }) => string;
        };
      };
      if (g.TextDecoder) {
        decoder = new g.TextDecoder();
      } else {
        const util = await import('util');
        decoder = new util.TextDecoder();
      }
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // Split on SSE event delimiters (double newline)
        const events = buffer.split(/\n\n/);
        // Keep the last partial chunk in the buffer
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          for (const line of rawEvent.split(/\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonText = trimmed.replace(/^data:\s?/, '');
            try {
              const data: ExtensionGenerationEvent = JSON.parse(jsonText);
              if (data.type === 'progress') {
                callbacks.onProgress?.(data);
              } else if (data.type === 'extension_complete') {
                callbacks.onComplete?.(data);
                // Broadcast globally for pages to react (e.g., Builder)
                const payload = data.extension ?? data.response;
                window.dispatchEvent(
                  new CustomEvent('goose:extensionGenerated', { detail: payload })
                );
                this.cleanup();
                return {
                  success: data.success,
                  response: data.response,
                  error: data.error,
                  // bubble through the extension payload if present
                  ...(data.extension ? { response: data.extension } : {}),
                };
              }
            } catch {
              // Be tolerant to stray/partial lines; don't tear down the stream
              console.warn('Ignoring non-JSON SSE data chunk:', jsonText);
              continue;
            }
          }
        }
      }

      this.cleanup();
      const endError = new Error('Stream ended unexpectedly');
      callbacks.onError?.(endError);
      return { success: false, error: endError.message };
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  // Deprecated: EventSource + separate POST approach replaced by single POST with stream parsing
  // Removed (was deprecated)
  // private async sendGenerationRequest(_prompt: string) {}

  private cleanup() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  disconnect() {
    this.cleanup();
  }
}

// Export a singleton instance
export const extensionStreamingClient = new ExtensionStreamingClient();

// Export the main function for convenience
export const generateExtensionWithProgress = (
  prompt: string,
  callbacks?: ExtensionGenerationCallbacks
): Promise<ExtensionGenerationResult> => {
  return extensionStreamingClient.generateExtensionWithProgress(prompt, callbacks);
};
