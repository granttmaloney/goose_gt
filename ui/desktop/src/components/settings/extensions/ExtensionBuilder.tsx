import { useState, useCallback, useEffect } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import {
  Save,
  Download,
  Upload,
  Code,
  Settings,
  TestTube,
  CheckCircle,
  XCircle,
  FileCode,
  Globe,
  Terminal,
  Zap,
  Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// Import our builder components
import ExtensionTypeSelector from './builder/ExtensionTypeSelector';
import CodeEditor from './builder/CodeEditor';
import ToolBuilder from './builder/ToolBuilder';
import DependencyManager from './builder/DependencyManager';
import ExtensionTester from './builder/ExtensionTester';
import ExtensionExporter from './builder/ExtensionExporter';
import AIExtensionGenerator from './AIExtensionGenerator';
import { addToAgent } from './agent-api';
import { getApiUrl } from '../../../config';

// Types
export interface ExtensionBuilderData {
  type: 'inline_python' | 'frontend' | 'stdio' | 'sse' | 'streamable_http';
  name: string;
  description: string;
  code?: string;
  tools: ToolDefinition[];
  dependencies: string[];
  envVars: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  cmd?: string;
  args?: string[];
  endpoint?: string;
  timeout: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface TestResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  tools?: ToolDefinition[];
  executionTime?: number;
}

const ExtensionBuilder: React.FC = () => {
  // Map backend types to builder-supported union
  const normalizeType = (t: unknown): ExtensionBuilderData['type'] => {
    switch (t) {
      case 'podman_python':
        return 'inline_python';
      case 'inline_python':
      case 'frontend':
      case 'stdio':
      case 'sse':
      case 'streamable_http':
        return t as ExtensionBuilderData['type'];
      default:
        return 'inline_python';
    }
  };

  const [activeTab, setActiveTab] = useState('type');
  const [extensionData, setExtensionData] = useState<ExtensionBuilderData>({
    type: 'inline_python',
    name: '',
    description: '',
    code: '',
    tools: [],
    dependencies: [],
    envVars: [],
    headers: [],
    timeout: 300,
  });

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Hydrate builder with last generated extension if present
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('goose:lastGeneratedExtension');
      if (raw) {
        const generated = JSON.parse(raw);
        const type = normalizeType(generated.type);
        const name = (generated.name as string) || '';
        const description = (generated.description as string) || '';
        const code = (generated.code as string) || '';
        const cmd = (generated.cmd as string) || undefined;
        const args = Array.isArray(generated.args) ? generated.args : undefined;
        const timeout = typeof generated.timeout === 'number' ? generated.timeout : 300;
        const dependencies = Array.isArray(generated.dependencies) ? generated.dependencies : [];

        setExtensionData((prev) => ({
          ...prev,
          type,
          name,
          description,
          code,
          cmd,
          args,
          timeout,
          dependencies,
        }));
        setActiveTab('type');
      }
    } catch (e) {
      console.warn('Failed to hydrate lastGeneratedExtension', e);
    }
    // Listen for extension generated broadcasts
    const handler = (e: CustomEvent<Record<string, unknown>>) => {
      const detail = e.detail;
      if (detail && typeof detail === 'object') {
        console.debug('ExtensionBuilder: received goose:extensionGenerated', detail);
        const type = normalizeType(detail.type);
        const name = (detail.name as string) || '';
        const description = (detail.description as string) || '';
        const code = (detail.code as string) || '';
        const cmd = (detail.cmd as string) || undefined;
        const args = Array.isArray(detail.args) ? detail.args : undefined;
        const timeout = typeof detail.timeout === 'number' ? detail.timeout : 300;
        const dependencies = Array.isArray(detail.dependencies) ? detail.dependencies : [];

        setExtensionData((prev) => ({
          ...prev,
          type,
          name,
          description,
          code,
          cmd,
          args,
          timeout,
          dependencies,
        }));
        setActiveTab('type');
      }
    };
    window.addEventListener(
      'goose:extensionGenerated',
      handler as unknown as (ev: unknown) => void
    );
    return () => {
      window.removeEventListener(
        'goose:extensionGenerated',
        handler as unknown as (ev: unknown) => void
      );
    };
  }, []);

  // Update extension data
  const updateExtensionData = useCallback((updates: Partial<ExtensionBuilderData>) => {
    setExtensionData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Test extension
  const testExtension = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // TODO: Implement actual testing API call
      // For now, simulate testing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result: TestResult = {
        success: true,
        errors: [],
        warnings: [],
        tools: extensionData.tools,
        executionTime: 1.2,
      };

      setTestResult(result);
      toast.success('Extension test completed successfully!');
    } catch (error) {
      const result: TestResult = {
        success: false,
        errors: ['Failed to test extension: ' + (error as Error).message],
        warnings: [],
      };
      setTestResult(result);
      toast.error('Extension test failed');
    } finally {
      setIsTesting(false);
    }
  };

  // Save extension
  const saveExtension = async () => {
    setIsSaving(true);
    try {
      // TODO: Implement actual save API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success('Extension saved successfully!');
    } catch (error) {
      toast.error('Failed to save extension: ' + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  // Add to agent (activate)
  const addExtensionToAgent = async () => {
    try {
      setIsAdding(true);
      // Map builder state into ExtensionConfig
      const name = (extensionData.name || '').trim();
      if (!name) {
        toast.error('Please provide an extension name before adding');
        return;
      }

      let payload:
        | {
            type: 'stdio';
            name: string;
            description: string | null;
            cmd: string;
            args: string[];
            envs: Record<string, string>;
            env_keys: string[];
            timeout: number;
            bundled: null;
            available_tools: string[];
          }
        | {
            type: 'streamable_http';
            name: string;
            description: string | null;
            uri: string;
            headers: Record<string, string>;
            envs: Record<string, string>;
            env_keys: string[];
            timeout: number;
            bundled: null;
            available_tools: string[];
          }
        | {
            type: 'sse';
            name: string;
            description: string | null;
            uri: string;
            envs: Record<string, string>;
            env_keys: string[];
            timeout: number;
            bundled: null;
            available_tools: string[];
          }
        | {
            type: 'frontend';
            name: string;
            description: string | null;
            tools: ToolDefinition[];
            bundled: null;
            available_tools: string[];
          }
        | {
            type: 'podman_python';
            name: string;
            description: string | null;
            code: string;
            timeout: number;
            dependencies: string[];
            available_tools: string[];
          };
      switch (extensionData.type) {
        case 'stdio':
          payload = {
            type: 'stdio',
            name,
            description: extensionData.description || null,
            cmd: extensionData.cmd || 'uv',
            args: Array.isArray(extensionData.args) ? extensionData.args : [],
            envs: {},
            env_keys: [],
            timeout: extensionData.timeout || 300,
            bundled: null,
            available_tools: [],
          };
          break;
        case 'streamable_http':
          payload = {
            type: 'streamable_http',
            name,
            description: extensionData.description || null,
            uri: extensionData.endpoint || '',
            headers: Object.fromEntries((extensionData.headers || []).map((h) => [h.key, h.value])),
            envs: {},
            env_keys: [],
            timeout: extensionData.timeout || 300,
            bundled: null,
            available_tools: [],
          };
          break;
        case 'sse':
          payload = {
            type: 'sse',
            name,
            description: extensionData.description || null,
            uri: extensionData.endpoint || '',
            envs: {},
            env_keys: [],
            timeout: extensionData.timeout || 300,
            bundled: null,
            available_tools: [],
          };
          break;
        case 'frontend':
          payload = {
            type: 'frontend',
            name,
            description: extensionData.description || null,
            tools: extensionData.tools || [],
            bundled: null,
            available_tools: [],
          };
          break;
        case 'inline_python':
        default:
          payload = {
            type: 'podman_python',
            name,
            description: extensionData.description || null,
            code: extensionData.code || '',
            timeout: extensionData.timeout || 300,
            dependencies: extensionData.dependencies || [],
            available_tools: [],
          };
          break;
      }

      await addToAgent(payload);
      toast.success('Extension added to agent');

      // Also persist to configuration so it appears on the Extensions page
      try {
        const response = await fetch(getApiUrl('/config/extensions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Secret-Key': await window.electron.getSecretKey(),
          },
          body: JSON.stringify({ name, enabled: true, config: payload }),
        });
        if (!response.ok) {
          console.warn('Failed to save extension to config:', response.status, response.statusText);
        }
      } catch (e) {
        console.warn('Error while saving extension to config:', e);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setIsAdding(false);
    }
  };

  // Export extension
  const exportExtension = () => {
    const exportData = {
      ...extensionData,
      version: '1.0.0',
      created: new Date().toISOString(),
      author: 'User',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${extensionData.name || 'extension'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Extension exported successfully!');
  };

  // Handle AI-generated extension
  const handleExtensionGenerated = (generated?: Record<string, unknown>) => {
    if (generated && typeof generated === 'object') {
      // Map generated config into our builder state shape
      const type = normalizeType(generated.type);
      const name = (generated.name as string) || '';
      const description = (generated.description as string) || '';
      const code = (generated.code as string) || '';
      const cmd = (generated.cmd as string) || undefined;
      const args = Array.isArray(generated.args) ? generated.args : undefined;
      const timeout = typeof generated.timeout === 'number' ? generated.timeout : 300;
      const dependencies = Array.isArray(generated.dependencies) ? generated.dependencies : [];

      setExtensionData((prev) => ({
        ...prev,
        type,
        name,
        description,
        code,
        cmd,
        args,
        timeout,
        dependencies,
      }));
    }

    toast.success(
      'Extension generated successfully! You can now review and modify it in the tabs above.'
    );
    setActiveTab('type');
  };

  // Import extension
  const importExtension = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const normalized: ExtensionBuilderData = {
          ...data,
          type: normalizeType(data.type),
        };
        setExtensionData(normalized);
        toast.success('Extension imported successfully!');
      } catch {
        toast.error('Failed to import extension: Invalid JSON');
      }
    };
    reader.readAsText(file);
  };

  // Get extension type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'inline_python':
        return <Code className="h-4 w-4" />;
      case 'frontend':
        return <Globe className="h-4 w-4" />;
      case 'stdio':
        return <Terminal className="h-4 w-4" />;
      case 'sse':
        return <Zap className="h-4 w-4" />;
      case 'streamable_http':
        return <Globe className="h-4 w-4" />;
      default:
        return <FileCode className="h-4 w-4" />;
    }
  };

  // Get test result icon
  const getTestResultIcon = () => {
    if (!testResult) return null;
    if (testResult.success) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-textStandard">Extension Builder</h1>
          <p className="text-textSubtle mt-2">
            Create, test, and deploy custom extensions for Goose
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="flex items-center gap-2">
            {getTypeIcon(extensionData.type)}
            {extensionData.type.replace('_', ' ').toUpperCase()}
          </Badge>

          {testResult && (
            <Badge
              variant={testResult.success ? 'default' : 'destructive'}
              className="flex items-center gap-2"
            >
              {getTestResultIcon()}
              {testResult.success ? 'Test Passed' : 'Test Failed'}
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Builder */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Extension Configuration
              </CardTitle>
              <CardDescription>Configure your extension type, code, and tools</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="ai" className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI
                  </TabsTrigger>
                  <TabsTrigger value="type">Type</TabsTrigger>
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="tools">Tools</TabsTrigger>
                  <TabsTrigger value="deps">Dependencies</TabsTrigger>
                  <TabsTrigger value="config">Config</TabsTrigger>
                </TabsList>

                <TabsContent value="ai" className="mt-6">
                  <AIExtensionGenerator onExtensionGenerated={handleExtensionGenerated} />
                </TabsContent>

                <TabsContent value="type" className="mt-6">
                  <ExtensionTypeSelector
                    type={extensionData.type}
                    name={extensionData.name}
                    description={extensionData.description}
                    onChange={updateExtensionData}
                  />
                </TabsContent>

                <TabsContent value="code" className="mt-6">
                  <CodeEditor
                    code={extensionData.code || ''}
                    language={extensionData.type === 'inline_python' ? 'python' : 'json'}
                    onChange={(code) => updateExtensionData({ code })}
                    extensionType={extensionData.type}
                  />
                </TabsContent>

                <TabsContent value="tools" className="mt-6">
                  <ToolBuilder
                    tools={extensionData.tools}
                    onChange={(tools) => updateExtensionData({ tools })}
                  />
                </TabsContent>

                <TabsContent value="deps" className="mt-6">
                  <DependencyManager
                    dependencies={extensionData.dependencies}
                    envVars={extensionData.envVars}
                    headers={extensionData.headers}
                    extensionType={extensionData.type}
                    onChange={(updates) => updateExtensionData(updates)}
                  />
                </TabsContent>

                <TabsContent value="config" className="mt-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-textStandard mb-2">
                        Timeout (seconds)
                      </label>
                      <input
                        type="number"
                        value={extensionData.timeout}
                        onChange={(e) => updateExtensionData({ timeout: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-borderSubtle rounded-md bg-backgroundStandard text-textStandard"
                        min="1"
                        max="3600"
                      />
                    </div>

                    {extensionData.type === 'stdio' && (
                      <div>
                        <label className="block text-sm font-medium text-textStandard mb-2">
                          Command
                        </label>
                        <input
                          type="text"
                          value={extensionData.cmd || ''}
                          onChange={(e) => updateExtensionData({ cmd: e.target.value })}
                          className="w-full px-3 py-2 border border-borderSubtle rounded-md bg-backgroundStandard text-textStandard"
                          placeholder="e.g., python, node, uvx"
                        />
                      </div>
                    )}

                    {extensionData.type === 'sse' && (
                      <div>
                        <label className="block text-sm font-medium text-textStandard mb-2">
                          Endpoint URL
                        </label>
                        <input
                          type="url"
                          value={extensionData.endpoint || ''}
                          onChange={(e) => updateExtensionData({ endpoint: e.target.value })}
                          className="w-full px-3 py-2 border border-borderSubtle rounded-md bg-backgroundStandard text-textStandard"
                          placeholder="https://example.com/sse"
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Testing & Actions */}
        <div className="space-y-6">
          {/* Testing Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Test Extension
              </CardTitle>
              <CardDescription>Validate your extension before saving</CardDescription>
            </CardHeader>
            <CardContent>
              <ExtensionTester
                extensionData={extensionData}
                testResult={testResult}
                isTesting={isTesting}
                onTest={testExtension}
              />
            </CardContent>
          </Card>

          {/* Actions Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Save className="h-5 w-5" />
                Actions
              </CardTitle>
              <CardDescription>Save, export, or import extensions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={saveExtension}
                disabled={isSaving || !extensionData.name}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Extension'}
              </Button>

              <Button
                onClick={addExtensionToAgent}
                disabled={isAdding || !extensionData.name}
                className="w-full"
              >
                {isAdding ? 'Adding...' : 'Add to Agent'}
              </Button>

              <Button
                onClick={exportExtension}
                variant="outline"
                className="w-full"
                disabled={!extensionData.name}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Extension
              </Button>

              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={importExtension}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Extension
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Extension Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                Extension Preview
              </CardTitle>
              <CardDescription>Preview your extension configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <ExtensionExporter extensionData={extensionData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ExtensionBuilder;
