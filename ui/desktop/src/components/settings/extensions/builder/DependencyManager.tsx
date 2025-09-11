import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Badge } from '../../../ui/badge';
import { Input } from '../../../ui/input';
import { 
  Plus, 
  Trash2, 
  Package, 
  Key, 
  Globe,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import { ExtensionBuilderData } from '../ExtensionBuilder';

interface DependencyManagerProps {
  dependencies: string[];
  envVars: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  extensionType: string;
  onChange: (updates: Partial<ExtensionBuilderData>) => void;
}

const DependencyManager: React.FC<DependencyManagerProps> = ({
  dependencies,
  envVars,
  headers,
  extensionType,
  onChange
}) => {
  const [newDependency, setNewDependency] = useState('');
  const [newEnvVar, setNewEnvVar] = useState({ key: '', value: '' });
  const [newHeader, setNewHeader] = useState({ key: '', value: '' });

  // Add dependency
  const addDependency = () => {
    if (newDependency.trim() && !dependencies.includes(newDependency.trim())) {
      onChange({ dependencies: [...dependencies, newDependency.trim()] });
      setNewDependency('');
    }
  };

  // Remove dependency
  const removeDependency = (index: number) => {
    const newDependencies = dependencies.filter((_, i) => i !== index);
    onChange({ dependencies: newDependencies });
  };

  // Add environment variable
  const addEnvVar = () => {
    if (newEnvVar.key.trim() && newEnvVar.value.trim()) {
      const newEnvVars = [...envVars, { ...newEnvVar }];
      onChange({ envVars: newEnvVars });
      setNewEnvVar({ key: '', value: '' });
    }
  };

  // Remove environment variable
  const removeEnvVar = (index: number) => {
    const newEnvVars = envVars.filter((_, i) => i !== index);
    onChange({ envVars: newEnvVars });
  };

  // Update environment variable
  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index][field] = value;
    onChange({ envVars: newEnvVars });
  };

  // Add header
  const addHeader = () => {
    if (newHeader.key.trim() && newHeader.value.trim()) {
      const newHeaders = [...headers, { ...newHeader }];
      onChange({ headers: newHeaders });
      setNewHeader({ key: '', value: '' });
    }
  };

  // Remove header
  const removeHeader = (index: number) => {
    const newHeaders = headers.filter((_, i) => i !== index);
    onChange({ headers: newHeaders });
  };

  // Update header
  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    onChange({ headers: newHeaders });
  };

  // Get popular Python packages
  const getPopularPackages = () => {
    return [
      'requests',
      'pandas',
      'numpy',
      'matplotlib',
      'beautifulsoup4',
      'selenium',
      'flask',
      'fastapi',
      'pydantic',
      'aiohttp',
      'asyncio',
      'json',
      'datetime',
      'pathlib',
      'os',
      'sys'
    ];
  };

  // Get common environment variables
  const getCommonEnvVars = () => {
    return [
      { key: 'API_KEY', value: 'your-api-key' },
      { key: 'DATABASE_URL', value: 'postgresql://...' },
      { key: 'SECRET_KEY', value: 'your-secret-key' },
      { key: 'DEBUG', value: 'false' },
      { key: 'LOG_LEVEL', value: 'INFO' }
    ];
  };

  // Get common headers
  const getCommonHeaders = () => {
    return [
      { key: 'Authorization', value: 'Bearer your-token' },
      { key: 'Content-Type', value: 'application/json' },
      { key: 'User-Agent', value: 'Goose-Extension/1.0' },
      { key: 'Accept', value: 'application/json' }
    ];
  };

  return (
    <div className="space-y-6">
      {/* Python Dependencies */}
      {extensionType === 'inline_python' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Python Dependencies
            </CardTitle>
            <CardDescription>
              Specify Python packages that your extension requires
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add dependency */}
            <div className="flex gap-2">
              <Input
                value={newDependency}
                onChange={(e) => setNewDependency(e.target.value)}
                placeholder="e.g., requests, pandas, numpy"
                onKeyPress={(e) => e.key === 'Enter' && addDependency()}
              />
              <Button onClick={addDependency} disabled={!newDependency.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Popular packages */}
            <div>
              <h4 className="text-sm font-medium text-textStandard mb-2">Popular Packages:</h4>
              <div className="flex flex-wrap gap-2">
                {getPopularPackages().map((pkg) => (
                  <Badge
                    key={pkg}
                    variant="outline"
                    className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                    onClick={() => {
                      if (!dependencies.includes(pkg)) {
                        onChange({ dependencies: [...dependencies, pkg] });
                      }
                    }}
                  >
                    {pkg}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Dependencies list */}
            {dependencies.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-textStandard mb-2">Selected Dependencies:</h4>
                <div className="space-y-2">
                  {dependencies.map((dep, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="font-mono text-sm">{dep}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDependency(index)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">Dependency Installation</p>
                  <p>Dependencies will be automatically installed using uvx when your extension runs. Make sure to specify the exact package names as they appear on PyPI.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Environment Variables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Environment Variables
          </CardTitle>
          <CardDescription>
            Configure environment variables for your extension
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add environment variable */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              value={newEnvVar.key}
              onChange={(e) => setNewEnvVar({ ...newEnvVar, key: e.target.value })}
              placeholder="Variable name"
            />
            <Input
              value={newEnvVar.value}
              onChange={(e) => setNewEnvVar({ ...newEnvVar, value: e.target.value })}
              placeholder="Variable value"
              type="password"
            />
            <Button 
              onClick={addEnvVar} 
              disabled={!newEnvVar.key.trim() || !newEnvVar.value.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Common environment variables */}
          <div>
            <h4 className="text-sm font-medium text-textStandard mb-2">Common Variables:</h4>
            <div className="space-y-1">
              {getCommonEnvVars().map((envVar, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                    onClick={() => {
                      if (!envVars.some(ev => ev.key === envVar.key)) {
                        onChange({ envVars: [...envVars, envVar] });
                      }
                    }}
                  >
                    {envVar.key}
                  </Badge>
                  <span className="text-xs text-textSubtle">{envVar.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Environment variables list */}
          {envVars.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-textStandard mb-2">Configured Variables:</h4>
              <div className="space-y-2">
                {envVars.map((envVar, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Input
                      value={envVar.key}
                      onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                      placeholder="Variable name"
                    />
                    <Input
                      value={envVar.value}
                      onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                      placeholder="Variable value"
                      type="password"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEnvVar(index)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security warning */}
          <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium mb-1">Security Notice</p>
                <p>Environment variables are stored securely in the system keyring. Never commit sensitive values to version control.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* HTTP Headers (for HTTP extensions) */}
      {(extensionType === 'sse' || extensionType === 'streamable_http') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              HTTP Headers
            </CardTitle>
            <CardDescription>
              Configure HTTP headers for API requests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input
                value={newHeader.key}
                onChange={(e) => setNewHeader({ ...newHeader, key: e.target.value })}
                placeholder="Header name"
              />
              <Input
                value={newHeader.value}
                onChange={(e) => setNewHeader({ ...newHeader, value: e.target.value })}
                placeholder="Header value"
              />
              <Button 
                onClick={addHeader} 
                disabled={!newHeader.key.trim() || !newHeader.value.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Common headers */}
            <div>
              <h4 className="text-sm font-medium text-textStandard mb-2">Common Headers:</h4>
              <div className="space-y-1">
                {getCommonHeaders().map((header, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                      onClick={() => {
                        if (!headers.some(h => h.key === header.key)) {
                          onChange({ headers: [...headers, header] });
                        }
                      }}
                    >
                      {header.key}
                    </Badge>
                    <span className="text-xs text-textSubtle">{header.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Headers list */}
            {headers.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-textStandard mb-2">Configured Headers:</h4>
                <div className="space-y-2">
                  {headers.map((header, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Input
                        value={header.key}
                        onChange={(e) => updateHeader(index, 'key', e.target.value)}
                        placeholder="Header name"
                      />
                      <Input
                        value={header.value}
                        onChange={(e) => updateHeader(index, 'value', e.target.value)}
                        placeholder="Header value"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeHeader(index)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Configuration Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-textStandard mb-2">Dependencies</h4>
              <p className="text-textSubtle">
                {dependencies.length} package{dependencies.length !== 1 ? 's' : ''} selected
              </p>
            </div>
            <div>
              <h4 className="font-medium text-textStandard mb-2">Environment Variables</h4>
              <p className="text-textSubtle">
                {envVars.length} variable{envVars.length !== 1 ? 's' : ''} configured
              </p>
            </div>
            <div>
              <h4 className="font-medium text-textStandard mb-2">HTTP Headers</h4>
              <p className="text-textSubtle">
                {headers.length} header{headers.length !== 1 ? 's' : ''} configured
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DependencyManager;
