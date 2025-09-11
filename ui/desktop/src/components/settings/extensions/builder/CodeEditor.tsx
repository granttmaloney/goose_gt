import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Badge } from '../../../ui/badge';
import { 
  Code, 
  Copy, 
  Download, 
  Upload, 
  Play, 
  FileText,
  Lightbulb,
  AlertCircle
} from 'lucide-react';

interface CodeEditorProps {
  code: string;
  language: string;
  extensionType: string;
  onChange: (code: string) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language,
  extensionType,
  onChange
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [code]);

  // Copy code to clipboard
  const copyCode = () => {
    navigator.clipboard.writeText(code);
  };

  // Download code as file
  const downloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extension.${language === 'python' ? 'py' : 'json'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Upload code from file
  const uploadCode = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onChange(content);
    };
    reader.readAsText(file);
  };

  // Get template code based on extension type
  const getTemplateCode = () => {
    switch (extensionType) {
      case 'inline_python':
        return `import asyncio
import json
from typing import List, Dict, Any
from mcp import Tool

# Example tool definition
EXAMPLE_TOOL = {
    "name": "example_tool",
    "description": "An example tool that demonstrates the MCP interface",
    "inputSchema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "A message to process"
            }
        },
        "required": ["message"]
    }
}

# Tool implementation
def example_tool(message: str) -> str:
    """Process the input message and return a response."""
    return f"Processed: {message}"

# Register tools with MCP
tools = [EXAMPLE_TOOL]

# Main MCP server setup
if __name__ == "__main__":
    # Your MCP server implementation here
    pass`;

      case 'frontend':
        return `{
  "name": "frontend_extension",
  "description": "A frontend extension with custom tools",
  "tools": [
    {
      "name": "custom_tool",
      "description": "A custom frontend tool",
      "inputSchema": {
        "type": "object",
        "properties": {
          "input": {
            "type": "string",
            "description": "Input parameter"
          }
        },
        "required": ["input"]
      }
    }
  ],
  "instructions": "This extension provides custom frontend tools for interactive operations."
}`;

      case 'stdio':
        return `#!/bin/bash
# Example stdio extension script
# This script will be executed when the extension is called

echo "Hello from stdio extension!"
echo "Arguments: $@"

# Process input from stdin
while read line; do
    echo "Processing: $line"
done`;

      case 'sse':
        return `{
  "name": "sse_extension",
  "description": "Server-Sent Events extension configuration",
  "endpoint": "https://example.com/sse",
  "headers": {
    "Authorization": "Bearer your-token"
  },
  "timeout": 300
}`;

      case 'streamable_http':
        return `{
  "name": "http_extension",
  "description": "HTTP API extension configuration",
  "endpoint": "https://api.example.com",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-token"
  },
  "timeout": 300
}`;

      default:
        return '';
    }
  };

  // Get language-specific syntax hints
  const getSyntaxHints = () => {
    if (language === 'python') {
      return [
        'Use the MCP framework for tool definitions',
        'Import required packages at the top',
        'Define tools as dictionaries with name, description, and inputSchema',
        'Implement tool functions that return results',
        'Use type hints for better code clarity'
      ];
    } else if (language === 'json') {
      return [
        'Use valid JSON syntax',
        'Define tools in the tools array',
        'Include proper inputSchema for each tool',
        'Use descriptive names and descriptions',
        'Validate your JSON before saving'
      ];
    }
    return [];
  };

  const syntaxHints = getSyntaxHints();

  return (
    <div className="space-y-4">
      {/* Editor Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Code className="h-5 w-5 text-textStandard" />
          <h3 className="text-lg font-semibold text-textStandard">Code Editor</h3>
          <Badge variant="outline">{language.toUpperCase()}</Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(getTemplateCode())}
          >
            <FileText className="h-4 w-4 mr-2" />
            Load Template
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={copyCode}
            disabled={!code}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCode}
            disabled={!code}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          
          <div className="relative">
            <input
              type="file"
              accept={language === 'python' ? '.py' : '.json'}
              onChange={uploadCode}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </div>
        </div>
      </div>

      {/* Code Editor */}
      <Card className={isFullscreen ? 'fixed inset-4 z-50' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Extension Code</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
          </div>
          <CardDescription>
            Write your extension code here. Use the template button to get started.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => onChange(e.target.value)}
              className="w-full min-h-[400px] p-4 font-mono text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`Enter your ${language} code here...`}
              spellCheck={false}
            />
            
            {/* Line numbers */}
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 rounded-l-lg flex flex-col text-xs text-gray-500 dark:text-gray-400 font-mono">
              {code.split('\n').map((_, index) => (
                <div key={index} className="h-6 flex items-center justify-center">
                  {index + 1}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Syntax Hints */}
      {syntaxHints.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Syntax Hints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syntaxHints.map((hint, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-textSubtle">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-blue-500" />
                  <span>{hint}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Code Statistics */}
      <div className="flex items-center gap-4 text-sm text-textSubtle">
        <span>Lines: {code.split('\n').length}</span>
        <span>Characters: {code.length}</span>
        <span>Words: {code.split(/\s+/).filter(word => word.length > 0).length}</span>
      </div>
    </div>
  );
};

export default CodeEditor;
