import React from 'react';
import './StepProgress.css';
import PropTypes from 'prop-types';


const STEPS = [
  {
    id: 'uploading',
    label: 'Upload',
    icon: '📤'
  },
  {
    id: 'processing',
    label: 'Processing',
    icon: '🔍'
  },
  {
    id: 'complete',
    label: 'Done',
    icon: '✅'
  }
];

const STEP_ID_MAP = {
  'uploading': 'uploading',
  'scanning': 'processing',
  'analyzing': 'processing',
  'profiling': 'processing',
  'duplicates': 'processing',
  'schema': 'processing',
  'complete': 'complete'
};

const STEP_DESCRIPTIONS = {
  'uploading': 'Transferring file to server',
  'processing': 'Scanning and processing file',
  'scanning': 'Scanning and processing file',
  'analyzing': 'Scanning and processing file',
  'profiling': 'Scanning and processing file',
  'duplicates': 'Scanning and processing file',
  'schema': 'Scanning and processing file',
  'complete': 'Processing finished'
};

const StepProgress = ({ currentStep, uploadProgress = null }) => {
  const mappedStep = STEP_ID_MAP[currentStep] || currentStep;
  
  const getCurrentStepIndex = () => {
    const index = STEPS.findIndex(s => s.id === mappedStep);
    return index === -1 ? 0 : index;
  };

  const currentIndex = getCurrentStepIndex();
  const currentStepInfo = STEPS[currentIndex];

  const getStepStatus = (stepIndex) => {
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="step-progress-horizontal">
      <div className="step-progress-current">
        <span className="current-step-emoji">{currentStepInfo?.icon}</span>
        <div className="current-step-info">
          <div className="current-step-label">{currentStepInfo?.label}</div>
          <div className="current-step-description">
            {STEP_DESCRIPTIONS[currentStep] || 'Processing...'}
          </div>
        </div>
      </div>

      {currentStep === 'uploading' && uploadProgress !== null && (
        <div className="upload-progress-bar-horizontal">
          <div 
            className="upload-progress-fill-horizontal" 
            style={{ width: `${uploadProgress}%` }}
          ></div>
          <span className="upload-progress-text-horizontal">{uploadProgress}%</span>
        </div>
      )}

      <div className="stepper-bar">
        {STEPS.map((step, index) => {
          const status = getStepStatus(index);
          
          return (
            <React.Fragment key={step.id}>
              <div className={`stepper-circle stepper-${status}`} title={step.label}>
                {status === 'completed' && (
                  <span className="stepper-check">✓</span>
                )}
                {status === 'active' && (
                  <div className="stepper-spinner"></div>
                )}
                {status === 'pending' && (
                  <span className="stepper-number">{index + 1}</span>
                )}
              </div>
              
              {index < STEPS.length - 1 && (
                <div className={`stepper-line stepper-line-${status === 'completed' || (status === 'active' && index < currentIndex) ? 'completed' : 'pending'}`}></div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="stepper-labels">
        {STEPS.map((step, index) => (
          <div key={step.id} className={`stepper-label ${getStepStatus(index) === 'active' ? 'stepper-label-active' : ''}`}>
            {step.label}
          </div>
        ))}
      </div>

      {currentStep === 'complete' && (
        <div className="step-complete-message">
          <span>Processing complete!</span>
        </div>
      )}
    </div>
  );
};
StepProgress.propTypes = {
  currentStep: PropTypes.oneOf([
    'uploading',
    'scanning',
    'analyzing',
    'profiling',
    'duplicates',
    'schema',
    'processing',
    'complete'
  ]).isRequired,

  uploadProgress: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.oneOf([null])
  ])
};

export default StepProgress;
