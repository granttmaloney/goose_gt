import React, { useState, useCallback } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { 
  Play, 
  Save, 
  Download, 
  Upload, 
  Code, 
  Settings, 
  TestTube,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileCode,
  Globe,
  Terminal,
  Zap
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// Import our builder components
import ExtensionTypeSelector from './builder/ExtensionTypeSelector';
import CodeEditor from './builder/CodeEditor';
import ToolBuilder from './builder/ToolBuilder';
import DependencyManager from './builder/DependencyManager';
import ExtensionTester from './builder/ExtensionTester';
import ExtensionExporter from './builder/ExtensionExporter';

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
    properties: Record<string, any>;
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

  // Update extension data
  const updateExtensionData = useCallback((updates: Partial<ExtensionBuilderData>) => {
    setExtensionData(prev => ({ ...prev, ...updates }));
  }, []);

  // Test extension
  const testExtension = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // TODO: Implement actual testing API call
      // For now, simulate testing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result: TestResult = {
        success: true,
        errors: [],
        warnings: [],
        tools: extensionData.tools,
        executionTime: 1.2
      };

      setTestResult(result);
      toast.success('Extension test completed successfully!');
    } catch (error) {
      const result: TestResult = {
        success: false,
        errors: ['Failed to test extension: ' + (error as Error).message],
        warnings: []
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Extension saved successfully!');
    } catch (error) {
      toast.error('Failed to save extension: ' + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  // Export extension
  const exportExtension = () => {
    const exportData = {
      ...extensionData,
      version: '1.0.0',
      created: new Date().toISOString(),
      author: 'User'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
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

  // Import extension
  const importExtension = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        setExtensionData(data);
        toast.success('Extension imported successfully!');
      } catch (error) {
        toast.error('Failed to import extension: Invalid JSON');
      }
    };
    reader.readAsText(file);
  };

  // Get extension type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'inline_python': return <Code className="h-4 w-4" />;
      case 'frontend': return <Globe className="h-4 w-4" />;
      case 'stdio': return <Terminal className="h-4 w-4" />;
      case 'sse': return <Zap className="h-4 w-4" />;
      case 'streamable_http': return <Globe className="h-4 w-4" />;
      default: return <FileCode className="h-4 w-4" />;
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
              variant={testResult.success ? "default" : "destructive"}
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
              <CardDescription>
                Configure your extension type, code, and tools
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="type">Type</TabsTrigger>
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="tools">Tools</TabsTrigger>
                  <TabsTrigger value="deps">Dependencies</TabsTrigger>
                  <TabsTrigger value="config">Config</TabsTrigger>
                </TabsList>

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
              <CardDescription>
                Validate your extension before saving
              </CardDescription>
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
              <CardDescription>
                Save, export, or import extensions
              </CardDescription>
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
                <Button
                  variant="outline"
                  className="w-full"
                >
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
              <CardDescription>
                Preview your extension configuration
              </CardDescription>
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
