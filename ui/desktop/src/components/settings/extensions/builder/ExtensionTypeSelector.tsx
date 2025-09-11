import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { 
  Code, 
  Globe, 
  Terminal, 
  Zap, 
  FileCode,
  CheckCircle,
  Info
} from 'lucide-react';
import { ExtensionBuilderData } from '../ExtensionBuilder';

interface ExtensionTypeSelectorProps {
  type: ExtensionBuilderData['type'];
  name: string;
  description: string;
  onChange: (updates: Partial<ExtensionBuilderData>) => void;
}

const extensionTypes = [
  {
    id: 'inline_python' as const,
    name: 'Inline Python',
    description: 'Write Python code directly in the browser',
    icon: <Code className="h-6 w-6" />,
    features: ['No compilation needed', 'Hot reloading', 'Package dependencies', 'Easy testing'],
    color: 'bg-blue-500',
    recommended: true
  },
  {
    id: 'frontend' as const,
    name: 'Frontend Extension',
    description: 'Create UI-based tools that run in the browser',
    icon: <Globe className="h-6 w-6" />,
    features: ['Interactive UI', 'Real-time updates', 'No server needed', 'Rich user experience'],
    color: 'bg-green-500',
    recommended: false
  },
  {
    id: 'stdio' as const,
    name: 'Command Line Tool',
    description: 'Integrate existing CLI tools and executables',
    icon: <Terminal className="h-6 w-6" />,
    features: ['Use existing tools', 'System integration', 'Powerful capabilities', 'External processes'],
    color: 'bg-purple-500',
    recommended: false
  },
  {
    id: 'sse' as const,
    name: 'Server-Sent Events',
    description: 'Connect to real-time data streams',
    icon: <Zap className="h-6 w-6" />,
    features: ['Real-time data', 'Event streaming', 'Live updates', 'WebSocket-like'],
    color: 'bg-orange-500',
    recommended: false
  },
  {
    id: 'streamable_http' as const,
    name: 'HTTP API',
    description: 'Connect to REST APIs and web services',
    icon: <FileCode className="h-6 w-6" />,
    features: ['REST API integration', 'HTTP requests', 'Authentication', 'Web services'],
    color: 'bg-indigo-500',
    recommended: false
  }
];

const ExtensionTypeSelector: React.FC<ExtensionTypeSelectorProps> = ({
  type,
  name,
  description,
  onChange
}) => {
  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-textStandard mb-2">
            Extension Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full px-3 py-2 border border-borderSubtle rounded-md bg-backgroundStandard text-textStandard"
            placeholder="my-awesome-extension"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-textStandard mb-2">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => onChange({ description: e.target.value })}
            className="w-full px-3 py-2 border border-borderSubtle rounded-md bg-backgroundStandard text-textStandard"
            placeholder="A brief description of your extension"
          />
        </div>
      </div>

      {/* Extension Type Selection */}
      <div>
        <h3 className="text-lg font-semibold text-textStandard mb-4">
          Choose Extension Type
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {extensionTypes.map((extensionType) => (
            <Card
              key={extensionType.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                type === extensionType.id
                  ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => onChange({ type: extensionType.id })}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${extensionType.color} text-white`}>
                      {extensionType.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {extensionType.name}
                        {extensionType.recommended && (
                          <Badge variant="secondary" className="text-xs">
                            Recommended
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                  </div>
                  
                  {type === extensionType.id && (
                    <CheckCircle className="h-5 w-5 text-blue-500" />
                  )}
                </div>
                <CardDescription className="text-sm">
                  {extensionType.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-textStandard">Features:</h4>
                  <ul className="text-xs text-textSubtle space-y-1">
                    {extensionType.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-gray-400 rounded-full" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Type-specific Information */}
      {type && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                {extensionTypes.find(t => t.id === type)?.name} Extension
              </h4>
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                {type === 'inline_python' && (
                  <>
                    <p>Write Python code that will be executed using uvx with the MCP framework.</p>
                    <p>Perfect for data processing, API integrations, and automation tasks.</p>
                    <p>Dependencies will be automatically installed when the extension runs.</p>
                  </>
                )}
                {type === 'frontend' && (
                  <>
                    <p>Create interactive tools that run directly in the browser.</p>
                    <p>Ideal for UI-heavy operations, file browsers, and visual tools.</p>
                    <p>Tools are executed by the frontend when called by the AI agent.</p>
                  </>
                )}
                {type === 'stdio' && (
                  <>
                    <p>Integrate existing command-line tools and executables.</p>
                    <p>Great for system operations, file processing, and external tools.</p>
                    <p>Tools run as separate processes with full system access.</p>
                  </>
                )}
                {type === 'sse' && (
                  <>
                    <p>Connect to real-time data streams using Server-Sent Events.</p>
                    <p>Perfect for live data feeds, monitoring, and real-time updates.</p>
                    <p>Maintains persistent connections for continuous data flow.</p>
                  </>
                )}
                {type === 'streamable_http' && (
                  <>
                    <p>Connect to REST APIs and web services using HTTP.</p>
                    <p>Ideal for integrating with external services and APIs.</p>
                    <p>Supports authentication headers and custom request configurations.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtensionTypeSelector;
