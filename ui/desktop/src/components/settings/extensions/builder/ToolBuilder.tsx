import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Badge } from '../../../ui/badge';
import { Input } from '../../../ui/input';
import { Textarea } from '../../../ui/textarea';
import { 
  Plus, 
  Trash2, 
  Settings, 
  Code, 
  Eye,
  Copy,
  FileText,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { ToolDefinition } from '../ExtensionBuilder';

interface ToolBuilderProps {
  tools: ToolDefinition[];
  onChange: (tools: ToolDefinition[]) => void;
}

interface PropertyDefinition {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
}

const ToolBuilder: React.FC<ToolBuilderProps> = ({ tools, onChange }) => {
  const [selectedTool, setSelectedTool] = useState<number | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  // Add new tool
  const addTool = () => {
    const newTool: ToolDefinition = {
      name: '',
      description: '',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    };
    onChange([...tools, newTool]);
    setSelectedTool(tools.length);
  };

  // Remove tool
  const removeTool = (index: number) => {
    const newTools = tools.filter((_, i) => i !== index);
    onChange(newTools);
    if (selectedTool === index) {
      setSelectedTool(null);
    } else if (selectedTool !== null && selectedTool > index) {
      setSelectedTool(selectedTool - 1);
    }
  };

  // Update tool
  const updateTool = (index: number, updates: Partial<ToolDefinition>) => {
    const newTools = [...tools];
    newTools[index] = { ...newTools[index], ...updates };
    onChange(newTools);
  };

  // Add property to tool
  const addProperty = (toolIndex: number) => {
    const tool = tools[toolIndex];
    const newProperty: PropertyDefinition = {
      name: '',
      type: 'string',
      description: '',
      required: false
    };
    
    const newProperties = {
      ...tool.inputSchema.properties,
      [newProperty.name]: {
        type: newProperty.type,
        description: newProperty.description
      }
    };
    
    updateTool(toolIndex, {
      inputSchema: {
        ...tool.inputSchema,
        properties: newProperties
      }
    });
  };

  // Update property
  const updateProperty = (toolIndex: number, propertyName: string, updates: Partial<PropertyDefinition>) => {
    const tool = tools[toolIndex];
    const newProperties = { ...tool.inputSchema.properties };
    
    if (updates.name && updates.name !== propertyName) {
      // Rename property
      newProperties[updates.name] = newProperties[propertyName];
      delete newProperties[propertyName];
    } else if (updates.type || updates.description) {
      // Update property definition
      newProperties[propertyName] = {
        ...newProperties[propertyName],
        ...(updates.type && { type: updates.type }),
        ...(updates.description && { description: updates.description })
      };
    }
    
    updateTool(toolIndex, {
      inputSchema: {
        ...tool.inputSchema,
        properties: newProperties
      }
    });
  };

  // Remove property
  const removeProperty = (toolIndex: number, propertyName: string) => {
    const tool = tools[toolIndex];
    const newProperties = { ...tool.inputSchema.properties };
    delete newProperties[propertyName];
    
    const newRequired = tool.inputSchema.required?.filter(name => name !== propertyName) || [];
    
    updateTool(toolIndex, {
      inputSchema: {
        ...tool.inputSchema,
        properties: newProperties,
        required: newRequired
      }
    });
  };

  // Toggle required property
  const toggleRequired = (toolIndex: number, propertyName: string) => {
    const tool = tools[toolIndex];
    const isRequired = tool.inputSchema.required?.includes(propertyName) || false;
    const newRequired = isRequired
      ? tool.inputSchema.required?.filter(name => name !== propertyName) || []
      : [...(tool.inputSchema.required || []), propertyName];
    
    updateTool(toolIndex, {
      inputSchema: {
        ...tool.inputSchema,
        required: newRequired
      }
    });
  };

  // Copy tool
  const copyTool = (index: number) => {
    const tool = tools[index];
    const newTool = {
      ...tool,
      name: `${tool.name}_copy`
    };
    onChange([...tools, newTool]);
  };

  // Get tool validation status
  const getToolValidation = (tool: ToolDefinition) => {
    const errors = [];
    if (!tool.name) errors.push('Name is required');
    if (!tool.description) errors.push('Description is required');
    if (!tool.inputSchema.properties || Object.keys(tool.inputSchema.properties).length === 0) {
      errors.push('At least one property is required');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-textStandard">Tool Definitions</h3>
          <p className="text-sm text-textSubtle">
            Define the tools that your extension will provide to the AI agent
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJsonEditor(!showJsonEditor)}
          >
            {showJsonEditor ? <Eye className="h-4 w-4 mr-2" /> : <Code className="h-4 w-4 mr-2" />}
            {showJsonEditor ? 'Visual Editor' : 'JSON Editor'}
          </Button>
          
          <Button onClick={addTool} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Tool
          </Button>
        </div>
      </div>

      {/* Tools List */}
      <div className="space-y-4">
        {tools.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-textStandard mb-2">No Tools Defined</h3>
              <p className="text-textSubtle mb-4">
                Add tools to define what your extension can do
              </p>
              <Button onClick={addTool}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Tool
              </Button>
            </CardContent>
          </Card>
        ) : (
          tools.map((tool, index) => {
            const validation = getToolValidation(tool);
            return (
              <Card key={index} className={selectedTool === index ? 'ring-2 ring-blue-500' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-textStandard">
                          {tool.name || `Tool ${index + 1}`}
                        </h4>
                        {validation.isValid ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      
                      <Badge variant={validation.isValid ? "default" : "destructive"}>
                        {validation.isValid ? 'Valid' : `${validation.errors.length} errors`}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyTool(index)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTool(selectedTool === index ? null : index)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTool(index)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {tool.description && (
                    <CardDescription>{tool.description}</CardDescription>
                  )}
                </CardHeader>
                
                {selectedTool === index && (
                  <CardContent className="space-y-4">
                    {/* Tool Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-textStandard mb-2">
                          Tool Name *
                        </label>
                        <Input
                          value={tool.name}
                          onChange={(e) => updateTool(index, { name: e.target.value })}
                          placeholder="my_tool"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-textStandard mb-2">
                          Description *
                        </label>
                        <Input
                          value={tool.description}
                          onChange={(e) => updateTool(index, { description: e.target.value })}
                          placeholder="What does this tool do?"
                        />
                      </div>
                    </div>
                    
                    {/* Properties */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-medium text-textStandard">Input Properties</h5>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addProperty(index)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Property
                        </Button>
                      </div>
                      
                      {Object.keys(tool.inputSchema.properties || {}).length === 0 ? (
                        <div className="text-center py-4 text-textSubtle">
                          No properties defined. Add properties to define the tool's input parameters.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(tool.inputSchema.properties || {}).map(([propName, propDef]) => (
                            <div key={propName} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-textStandard mb-1">
                                    Property Name
                                  </label>
                                  <Input
                                    value={propName}
                                    onChange={(e) => updateProperty(index, propName, { name: e.target.value })}
                                    placeholder="property_name"
                                  />
                                </div>
                                
                                <div>
                                  <label className="block text-xs font-medium text-textStandard mb-1">
                                    Type
                                  </label>
                                  <select
                                    value={propDef.type}
                                    onChange={(e) => updateProperty(index, propName, { type: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-backgroundStandard text-textStandard"
                                  >
                                    <option value="string">String</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="array">Array</option>
                                    <option value="object">Object</option>
                                  </select>
                                </div>
                                
                                <div>
                                  <label className="block text-xs font-medium text-textStandard mb-1">
                                    Description
                                  </label>
                                  <Input
                                    value={propDef.description || ''}
                                    onChange={(e) => updateProperty(index, propName, { description: e.target.value })}
                                    placeholder="Property description"
                                  />
                                </div>
                                
                                <div className="flex items-end gap-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={tool.inputSchema.required?.includes(propName) || false}
                                      onChange={() => toggleRequired(index, propName)}
                                      className="rounded"
                                    />
                                    <span className="text-xs text-textStandard">Required</span>
                                  </label>
                                  
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeProperty(index, propName)}
                                    className="text-red-500 hover:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Validation Errors */}
                    {!validation.isValid && (
                      <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                        <h6 className="font-medium text-red-800 dark:text-red-200 mb-2">Validation Errors:</h6>
                        <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                          {validation.errors.map((error, errorIndex) => (
                            <li key={errorIndex} className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4" />
                              {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* JSON Editor */}
      {showJsonEditor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code className="h-4 w-4" />
              JSON Editor
            </CardTitle>
            <CardDescription>
              Edit the tools definition as JSON
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={JSON.stringify(tools, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  onChange(parsed);
                } catch (error) {
                  // Invalid JSON, don't update
                }
              }}
              className="min-h-[300px] font-mono text-sm"
              placeholder="Enter tools definition as JSON..."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ToolBuilder;
