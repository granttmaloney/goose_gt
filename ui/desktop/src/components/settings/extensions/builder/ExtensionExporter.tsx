import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Badge } from '../../../ui/badge';
import { 
  FileCode, 
  Copy, 
  Download, 
  Eye, 
  EyeOff,
  CheckCircle,
  Info
} from 'lucide-react';
import { ExtensionBuilderData } from '../ExtensionBuilder';

interface ExtensionExporterProps {
  extensionData: ExtensionBuilderData;
}

const ExtensionExporter: React.FC<ExtensionExporterProps> = ({ extensionData }) => {
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate the extension configuration
  const generateExtensionConfig = () => {
    const config: any = {
      name: extensionData.name,
      description: extensionData.description,
      type: extensionData.type,
      timeout: extensionData.timeout,
      bundled: false,
      available_tools: extensionData.tools.map(tool => tool.name)
    };

    // Add type-specific configuration
    switch (extensionData.type) {
      case 'inline_python':
        config.code = extensionData.code;
        config.dependencies = extensionData.dependencies;
        break;
      case 'frontend':
        config.tools = extensionData.tools;
        config.instructions = `Frontend extension providing ${extensionData.tools.length} tools`;
        break;
      case 'stdio':
        config.cmd = extensionData.cmd;
        config.args = extensionData.args || [];
        config.envs = extensionData.envVars.reduce((acc, env) => {
          acc[env.key] = env.value;
          return acc;
        }, {} as Record<string, string>);
        break;
      case 'sse':
        config.uri = extensionData.endpoint;
        config.envs = extensionData.envVars.reduce((acc, env) => {
          acc[env.key] = env.value;
          return acc;
        }, {} as Record<string, string>);
        break;
      case 'streamable_http':
        config.uri = extensionData.endpoint;
        config.headers = extensionData.headers.reduce((acc, header) => {
          acc[header.key] = header.value;
          return acc;
        }, {} as Record<string, string>);
        config.envs = extensionData.envVars.reduce((acc, env) => {
          acc[env.key] = env.value;
          return acc;
        }, {} as Record<string, string>);
        break;
    }

    return config;
  };

  // Generate the complete extension package
  const generateExtensionPackage = () => {
    return {
      extension: generateExtensionConfig(),
      tools: extensionData.tools,
      metadata: {
        version: '1.0.0',
        created: new Date().toISOString(),
        author: 'User',
        description: extensionData.description
      }
    };
  };

  const extensionConfig = generateExtensionConfig();
  const extensionPackage = generateExtensionPackage();

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Download as file
  const downloadAsFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get extension type info
  const getExtensionTypeInfo = () => {
    switch (extensionData.type) {
      case 'inline_python':
        return {
          name: 'Inline Python',
          description: 'Python code executed with uvx',
          icon: '🐍'
        };
      case 'frontend':
        return {
          name: 'Frontend Extension',
          description: 'Browser-based tools',
          icon: '🌐'
        };
      case 'stdio':
        return {
          name: 'Command Line Tool',
          description: 'External executable integration',
          icon: '⚡'
        };
      case 'sse':
        return {
          name: 'Server-Sent Events',
          description: 'Real-time data streaming',
          icon: '📡'
        };
      case 'streamable_http':
        return {
          name: 'HTTP API',
          description: 'REST API integration',
          icon: '🔗'
        };
      default:
        return {
          name: 'Unknown',
          description: 'Unknown extension type',
          icon: '❓'
        };
    }
  };

  const typeInfo = getExtensionTypeInfo();

  return (
    <div className="space-y-4">
      {/* Extension Summary */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{typeInfo.icon}</span>
          <div>
            <h4 className="font-semibold text-textStandard">
              {extensionData.name || 'Untitled Extension'}
            </h4>
            <p className="text-sm text-textSubtle">{typeInfo.name}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-textStandard">Tools:</span>
            <span className="ml-2 text-textSubtle">{extensionData.tools.length}</span>
          </div>
          <div>
            <span className="font-medium text-textStandard">Dependencies:</span>
            <span className="ml-2 text-textSubtle">{extensionData.dependencies.length}</span>
          </div>
          <div>
            <span className="font-medium text-textStandard">Environment Variables:</span>
            <span className="ml-2 text-textSubtle">{extensionData.envVars.length}</span>
          </div>
          <div>
            <span className="font-medium text-textStandard">Timeout:</span>
            <span className="ml-2 text-textSubtle">{extensionData.timeout}s</span>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowJson(!showJson)}
        >
          {showJson ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {showJson ? 'Hide JSON' : 'Show JSON'}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyToClipboard(JSON.stringify(extensionConfig, null, 2))}
        >
          {copied ? <CheckCircle className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
          {copied ? 'Copied!' : 'Copy Config'}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadAsFile(
            JSON.stringify(extensionConfig, null, 2),
            `${extensionData.name || 'extension'}-config.json`
          )}
        >
          <Download className="h-4 w-4 mr-2" />
          Download Config
        </Button>
      </div>

      {/* JSON Preview */}
      {showJson && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Extension Configuration
            </CardTitle>
            <CardDescription>
              This is the configuration that will be saved to your Goose extensions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto border">
              {JSON.stringify(extensionConfig, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Export Package */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Package
          </CardTitle>
          <CardDescription>
            Export the complete extension package for sharing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(extensionPackage, null, 2))}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Package
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadAsFile(
                JSON.stringify(extensionPackage, null, 2),
                `${extensionData.name || 'extension'}-package.json`
              )}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Package
            </Button>
          </div>
          
          <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Sharing Extensions</p>
                <p>
                  The extension package includes all configuration, tools, and metadata needed to share your extension with others. 
                  Recipients can import this file to use your extension in their Goose installation.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Installation Instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Installation Instructions</CardTitle>
          <CardDescription>
            How to install this extension in Goose
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div>
              <h5 className="font-medium text-textStandard mb-1">Method 1: Import Package</h5>
              <p className="text-textSubtle">
                1. Download the extension package above<br/>
                2. In Goose, go to Extensions → Import Extension<br/>
                3. Select the downloaded package file<br/>
                4. The extension will be automatically installed and configured
              </p>
            </div>
            
            <div>
              <h5 className="font-medium text-textStandard mb-1">Method 2: Manual Configuration</h5>
              <p className="text-textSubtle">
                1. Copy the extension configuration JSON above<br/>
                2. In Goose, go to Extensions → Add Custom Extension<br/>
                3. Paste the configuration in the JSON editor<br/>
                4. Save the extension
              </p>
            </div>
            
            <div>
              <h5 className="font-medium text-textStandard mb-1">Method 3: CLI Installation</h5>
              <p className="text-textSubtle">
                1. Save the configuration to a file (e.g., extension.json)<br/>
                2. Run: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">goose extension add extension.json</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExtensionExporter;
