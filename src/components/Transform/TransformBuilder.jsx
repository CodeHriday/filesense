import React, { useState, useEffect, useCallback } from 'react';
import { FiDatabase, FiArrowRight, FiPlay, FiSave, FiSettings } from 'react-icons/fi';
import LineageBackButton from '../LineageBackButton';
import ConnectionSelector from './ConnectionSelector';
import FileSelector from './FileSelector';
import ColumnMapper from './ColumnMapper';
import TargetSchemaEditor from './TargetSchemaEditor';
import TransformExecutor from './TransformExecutor';
import './TransformBuilder.css';

/**
 * Main Transform Builder component that orchestrates the complete transform workflow
 */
const TransformBuilder = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [transformConfig, setTransformConfig] = useState({
    sourceConnection: null,
    targetConnection: null,
    sourceFile: null,
    sourceSchema: [],
    targetSchema: [],
    columnMappings: [],
    transformName: 'New Transform',
    transformDescription: ''
  });

  const steps = [
    { id: 1, title: 'Select Connections', description: 'Choose source and target connections' },
    { id: 2, title: 'Select Source File', description: 'Pick a file from the source connection' },
    { id: 3, title: 'Map Columns', description: 'Drag and drop columns to create mappings' },
    { id: 4, title: 'Configure Target', description: 'Set up target schema and settings' },
    { id: 5, title: 'Execute Mapping', description: 'Run the transformation and load data' }
  ];

  const updateConfig = useCallback((key, value) => {
    setTransformConfig(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const canProceedToStep = (step) => {
    switch (step) {
      case 2:
        return transformConfig.sourceConnection && transformConfig.targetConnection;
      case 3:
        return transformConfig.sourceFile && transformConfig.sourceSchema.length > 0;
      case 4:
        return transformConfig.columnMappings.length > 0;
      case 5:
        return transformConfig.targetSchema.length > 0;
      default:
        return true;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <ConnectionSelector
            sourceConnection={transformConfig.sourceConnection}
            targetConnection={transformConfig.targetConnection}
            onSourceChange={(conn) => updateConfig('sourceConnection', conn)}
            onTargetChange={(conn) => updateConfig('targetConnection', conn)}
          />
        );
      case 2:
        return (
          <FileSelector
            connection={transformConfig.sourceConnection}
            selectedFile={transformConfig.sourceFile}
            onFileSelect={(file, schema) => {
              updateConfig('sourceFile', file);
              updateConfig('sourceSchema', schema);
            }}
          />
        );
      case 3:
        return (
          <ColumnMapper
            sourceSchema={transformConfig.sourceSchema}
            targetSchema={transformConfig.targetSchema}
            mappings={transformConfig.columnMappings}
            onMappingsChange={(mappings) => updateConfig('columnMappings', mappings)}
            onTargetSchemaChange={(schema) => updateConfig('targetSchema', schema)}
          />
        );
      case 4:
        return (
          <TargetSchemaEditor
            connection={transformConfig.targetConnection}
            schema={transformConfig.targetSchema}
            onSchemaChange={(schema) => updateConfig('targetSchema', schema)}
          />
        );
      case 5:
        return (
          <TransformExecutor
            config={transformConfig}
            onExecute={() => console.log('Executing transform...')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="transform-builder">
      {/* Header */}
      <div className="transform-header">
        <div className="transform-title">
          <h1>Transform Builder</h1>
          <p>Create visual data transformations with drag-and-drop column mapping</p>
        </div>
        <div className="transform-actions">
          <LineageBackButton />
          <button className="btn btn-secondary">
            <FiSave /> Save Draft
          </button>
          <button 
            className="btn btn-primary" 
            disabled={!canProceedToStep(5)}
            onClick={() => {
              if (canProceedToStep(5)) {
                setCurrentStep(5);
              }
            }}
          >
            <FiPlay /> Execute Mapping
          </button>
        </div>
      </div>

      {/* Step Progress */}
      <div className="step-progress">
        {steps.map((step, index) => (
          <div 
            key={step.id}
            className={`step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
            onClick={() => canProceedToStep(step.id) && setCurrentStep(step.id)}
          >
            <div className="step-number">{step.id}</div>
            <div className="step-info">
              <div className="step-title">{step.title}</div>
              <div className="step-description">{step.description}</div>
            </div>
            {index < steps.length - 1 && <FiArrowRight className="step-arrow" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="step-content">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="step-navigation">
        <button 
          className="btn btn-secondary"
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
        >
          Previous
        </button>
        <button 
          className="btn btn-primary"
          onClick={() => setCurrentStep(Math.min(5, currentStep + 1))}
          disabled={currentStep === 5 || !canProceedToStep(currentStep + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default TransformBuilder;