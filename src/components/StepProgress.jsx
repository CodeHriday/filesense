import React from 'react';
import './StepProgress.css';

const STEPS = [
  {
    id: 'uploading',
    label: 'Uploading File',
    icon: '📤',
    description: 'Transferring file to server'
  },
  {
    id: 'scanning',
    label: 'Scanning for Viruses',
    icon: '🔍',
    description: 'Checking file security'
  },
  {
    id: 'analyzing',
    label: 'Analyzing Structure',
    icon: '📊',
    description: 'Reading file contents'
  },
  {
    id: 'profiling',
    label: 'Profiling Columns',
    icon: '🔢',
    description: 'Generating statistics'
  },
  {
    id: 'duplicates',
    label: 'Detecting Duplicates',
    icon: '🔎',
    description: 'Checking for duplicate rows'
  },
  {
    id: 'schema',
    label: 'Capturing Schema',
    icon: '📋',
    description: 'Saving metadata'
  },
  {
    id: 'complete',
    label: 'Complete',
    icon: '✅',
    description: 'Processing finished'
  }
];

const StepProgress = ({ currentStep, uploadProgress = null }) => {
  const getCurrentStepIndex = () => {
    const index = STEPS.findIndex(s => s.id === currentStep);
    return index === -1 ? 0 : index;
  };

  const currentIndex = getCurrentStepIndex();

  const getStepStatus = (stepIndex) => {
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="step-progress-container">
      <div className="step-progress-header">
        <h3>Processing Your File</h3>
        <p className="step-progress-subtitle">
          {STEPS[currentIndex]?.description || 'Please wait...'}
        </p>
      </div>

      <div className="steps-list">
        {STEPS.map((step, index) => {
          const status = getStepStatus(index);
          
          return (
            <div key={step.id} className={`step-item step-${status}`}>
              <div className="step-icon-wrapper">
                {status === 'completed' && (
                  <div className="step-icon completed">✓</div>
                )}
                {status === 'active' && (
                  <div className="step-icon active">
                    <div className="spinner"></div>
                  </div>
                )}
                {status === 'pending' && (
                  <div className="step-icon pending">{index + 1}</div>
                )}
              </div>

              <div className="step-content">
                <div className="step-label">{step.label}</div>
                <div className="step-description">{step.description}</div>
                
                {step.id === 'uploading' && status === 'active' && uploadProgress !== null && (
                  <div className="upload-progress-bar">
                    <div 
                      className="upload-progress-fill" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                    <span className="upload-progress-text">{uploadProgress}%</span>
                  </div>
                )}
                
                {status === 'active' && step.id !== 'uploading' && (
                  <div className="step-spinner-text">
                    <span className="spinner-dot">●</span>
                    <span className="spinner-dot">●</span>
                    <span className="spinner-dot">●</span>
                  </div>
                )}
              </div>

              <div className="step-emoji">{step.icon}</div>
            </div>
          );
        })}
      </div>

      {currentStep === 'complete' && (
        <div className="step-progress-footer">
          <div className="success-message">
            <span className="success-icon">🎉</span>
            <span>File processed successfully!</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepProgress;
