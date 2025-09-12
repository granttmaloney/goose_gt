import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Badge } from '../../../ui/badge';
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Code,
  Settings,
  TestTube,
  Loader2,
} from 'lucide-react';
import { ExtensionBuilderData, TestResult } from '../ExtensionBuilder';

interface ExtensionTesterProps {
  extensionData: ExtensionBuilderData;
  testResult: TestResult | null;
  isTesting: boolean;
  onTest: () => void;
}

const ExtensionTester: React.FC<ExtensionTesterProps> = ({
  extensionData,
  testResult,
  isTesting,
  onTest,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // Validate extension data
  const validateExtension = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!extensionData.name.trim()) {
      errors.push('Extension name is required');
    }

    if (!extensionData.description.trim()) {
      errors.push('Extension description is required');
    }

    if (extensionData.type === 'inline_python' && !extensionData.code?.trim()) {
      errors.push('Python code is required for inline Python extensions');
    }

    if (extensionData.type === 'stdio' && !extensionData.cmd?.trim()) {
      errors.push('Command is required for stdio extensions');
    }

    if (
      (extensionData.type === 'sse' || extensionData.type === 'streamable_http') &&
      !extensionData.endpoint?.trim()
    ) {
      errors.push('Endpoint URL is required for HTTP extensions');
    }

    if (extensionData.tools.length === 0) {
      errors.push('At least one tool must be defined');
    }

    // Validate tools
    extensionData.tools.forEach((tool, index) => {
      if (!tool.name.trim()) {
        errors.push(`Tool ${index + 1}: Name is required`);
      }
      if (!tool.description.trim()) {
        errors.push(`Tool ${index + 1}: Description is required`);
      }
      if (!tool.inputSchema.properties || Object.keys(tool.inputSchema.properties).length === 0) {
        errors.push(`Tool ${index + 1}: At least one input property is required`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  const validation = validateExtension();

  // Get test status
  const getTestStatus = () => {
    if (isTesting) return 'testing';
    if (testResult) return testResult.success ? 'passed' : 'failed';
    return 'not-tested';
  };

  const testStatus = getTestStatus();

  // Get status icon
  const getStatusIcon = () => {
    switch (testStatus) {
      case 'testing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'passed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <TestTube className="h-5 w-5 text-gray-400" />;
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (testStatus) {
      case 'testing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'passed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // Get status text
  const getStatusText = () => {
    switch (testStatus) {
      case 'testing':
        return 'Testing...';
      case 'passed':
        return 'Test Passed';
      case 'failed':
        return 'Test Failed';
      default:
        return 'Not Tested';
    }
  };

  return (
    <div className="space-y-4">
      {/* Test Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h4 className="font-medium text-textStandard">Test Status</h4>
            <p className="text-sm text-textSubtle">
              {testStatus === 'testing'
                ? 'Running tests...'
                : testStatus === 'passed'
                  ? 'All tests passed successfully'
                  : testStatus === 'failed'
                    ? 'Tests failed - check details below'
                    : 'Click "Test Extension" to validate your extension'}
            </p>
          </div>
        </div>

        <Badge className={getStatusColor()}>{getStatusText()}</Badge>
      </div>

      {/* Test Button */}
      <Button
        onClick={onTest}
        disabled={isTesting || !validation.isValid}
        className="w-full"
        variant={validation.isValid ? 'default' : 'outline'}
      >
        {isTesting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Testing Extension...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Test Extension
          </>
        )}
      </Button>

      {/* Validation Errors */}
      {!validation.isValid && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Validation Errors
            </CardTitle>
            <CardDescription>Fix these issues before testing your extension</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {validation.errors.map((error, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300"
                >
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testResult && (
        <Card
          className={
            testResult.success
              ? 'border-green-200 dark:border-green-800'
              : 'border-red-200 dark:border-red-800'
          }
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              Test Results
            </CardTitle>
            <CardDescription>
              {testResult.success
                ? 'Extension validation completed successfully'
                : 'Extension validation failed'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Test Summary */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-textStandard">Status:</span>
                <span className={`ml-2 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.success ? 'PASSED' : 'FAILED'}
                </span>
              </div>
              {testResult.executionTime && (
                <div>
                  <span className="font-medium text-textStandard">Execution Time:</span>
                  <span className="ml-2 text-textSubtle">{testResult.executionTime}s</span>
                </div>
              )}
            </div>

            {/* Errors */}
            {testResult.errors.length > 0 && (
              <div>
                <h5 className="font-medium text-red-600 dark:text-red-400 mb-2">Errors:</h5>
                <ul className="space-y-1">
                  {testResult.errors.map((error, index) => (
                    <li
                      key={index}
                      className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2"
                    >
                      <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {testResult.warnings.length > 0 && (
              <div>
                <h5 className="font-medium text-yellow-600 dark:text-yellow-400 mb-2">Warnings:</h5>
                <ul className="space-y-1">
                  {testResult.warnings.map((warning, index) => (
                    <li
                      key={index}
                      className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2"
                    >
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Discovered Tools */}
            {testResult.tools && testResult.tools.length > 0 && (
              <div>
                <h5 className="font-medium text-textStandard mb-2">Discovered Tools:</h5>
                <div className="space-y-2">
                  {testResult.tools.map((tool, index) => (
                    <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-textStandard">{tool.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {Object.keys(tool.inputSchema.properties || {}).length} params
                        </Badge>
                      </div>
                      <p className="text-sm text-textSubtle mt-1">{tool.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Show Details Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full"
            >
              <Settings className="h-4 w-4 mr-2" />
              {showDetails ? 'Hide Details' : 'Show Details'}
            </Button>

            {/* Detailed Results */}
            {showDetails && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h6 className="font-medium text-textStandard mb-2">Detailed Test Results:</h6>
                <pre className="text-xs text-textSubtle overflow-x-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            What Gets Tested
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-textSubtle">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Extension configuration validation</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Tool schema validation</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Code syntax checking</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Dependency resolution</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Tool discovery and registration</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExtensionTester;
