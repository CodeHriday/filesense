import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUpload, FiCheck, FiAlertTriangle, FiBarChart2, FiGrid, FiLink, FiChevronLeft, FiChevronRight, FiX, FiEye } from 'react-icons/fi';
import axios from 'axios';
import FilePreview from './FilePreview';
import './OnboardingWizard.css';
import PropTypes from 'prop-types';

const OnboardingWizard = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showWizard, setShowWizard] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileId, setUploadedFileId] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Always show wizard when component is mounted (controlled by parent)
  useEffect(() => {
    setShowWizard(true);
  }, []);

  const steps = [
    {
      title: 'Welcome to Data File Observatory',
      description: 'A comprehensive platform for data file quality monitoring and governance.',
      content: (
        <div className="welcome-content">
          <div className="welcome-icon">
            <FiBarChart2 size={60} className="primary-icon" />
          </div>
          <h3>Monitor Data Quality with Ease</h3>
          <p>
            Data File Observatory helps you track and improve the quality of your 
            data files over time. This quick guide will walk you through the key features.
          </p>
          <div className="feature-highlights">
            <div className="feature">
              <FiUpload className="feature-icon" />
              <span>Upload and profile data files</span>
            </div>
            <div className="feature">
              <FiCheck className="feature-icon" />
              <span>Run quality checks</span>
            </div>
            <div className="feature">
              <FiAlertTriangle className="feature-icon" />
              <span>Set up alerts</span>
            </div>
            <div className="feature">
              <FiGrid className="feature-icon" />
              <span>Transform and map data</span>
            </div>
            <div className="feature">
              <FiLink className="feature-icon" />
              <span>Track data lineage</span>
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'Upload Your First File',
      description: 'Start by uploading a CSV, JSON, or other supported file format.',
      content: (
        <div className="upload-content">
          <div className="upload-area">
            {!file ? (
              <div 
                className="drop-zone"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <FiUpload size={40} className="upload-icon" />
                <p>Drag and drop your file here or</p>
                <input
                  type="file"
                  id="file-upload"
                  className="file-input"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                  accept=".csv,.json,.parquet,.xlsx"
                />
                <label htmlFor="file-upload" className="file-button">
                  Select File
                </label>
                <p className="supported-formats">
                  Supported formats: CSV, JSON, Parquet, Excel
                </p>
              </div>
            ) : (
              <div className="selected-file">
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <button 
                  className="remove-file"
                  onClick={() => setFile(null)}
                >
                  <FiX />
                </button>
                {uploading && (
                  <div className="upload-progress">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                    <span className="progress-text">{uploadProgress}%</span>
                  </div>
                )}
                {error && (
                  <div className="upload-error">
                    <FiAlertTriangle /> {error}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="upload-tips">
            <h4>Tips for best results:</h4>
            <ul>
              <li>Files should have a header row with column names</li>
              <li>CSV files should use standard delimiters (comma, tab)</li>
              <li>Include metadata columns when available (timestamps, IDs)</li>
              <li>Consistent data formats yield better profile accuracy</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      title: 'Preview Your Data',
      description: 'Review your uploaded file before proceeding with analysis.',
      content: (
        <div className="preview-content">
          {uploadedFileId ? (
            <FilePreview fileId={uploadedFileId} maxRows={100} />
          ) : (
            <div className="preview-placeholder">
              <FiEye size={40} className="preview-icon" />
              <p>Upload a file first to preview its contents</p>
              <div className="preview-placeholder-description">
                <p>The preview will show the first 100 records from your file, helping you:</p>
                <ul>
                  <li>Verify the data was uploaded correctly</li>
                  <li>Check column headers and data types</li>
                  <li>Identify potential quality issues before analysis</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Explore Your Data Profile',
      description: 'After uploading, we\'ll automatically analyze your file.',
      content: (
        <div className="profile-content">
          <div className="profile-demo">
            <img 
              src="/images/profile-demo.svg" 
              alt="Data Profile Demo"
              className="demo-image" 
            />
            <div className="profile-details">
              <h4>Data Profile Information</h4>
              <ul className="profile-info-list">
                <li>
                  <span className="info-label">Column Statistics</span>
                  <span className="info-description">Data types, value ranges, patterns</span>
                </li>
                <li>
                  <span className="info-label">Completeness Analysis</span>
                  <span className="info-description">Missing values, empty cells</span>
                </li>
                <li>
                  <span className="info-label">Distribution Visualizations</span>
                  <span className="info-description">Histograms, outlier detection</span>
                </li>
                <li>
                  <span className="info-label">Metadata Assessment</span>
                  <span className="info-description">File size, row count, created date</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="profile-navigation">
            <p>
              After profiling, you can navigate to the <strong>Data Profile</strong> page 
              to see detailed analysis of your data.
            </p>
          </div>
        </div>
      )
    },
    {
      title: 'Set Up Quality Checks',
      description: 'Define custom quality rules to monitor your data.',
      content: (
        <div className="quality-content">
          <div className="quality-demo">
            <div className="quality-checks-list">
              <div className="quality-check">
                <div className="check-header">
                  <span className="check-type">Completeness</span>
                  <span className="check-status passed">
                    <FiCheck /> Passed
                  </span>
                </div>
                <p className="check-description">
                  Ensures required fields don't have missing values
                </p>
              </div>
              
              <div className="quality-check">
                <div className="check-header">
                  <span className="check-type">Consistency</span>
                  <span className="check-status warning">
                    <FiAlertTriangle /> Warning
                  </span>
                </div>
                <p className="check-description">
                  Verifies data follows expected patterns and relationships
                </p>
              </div>
              
              <div className="quality-check">
                <div className="check-header">
                  <span className="check-type">Accuracy</span>
                  <span className="check-status passed">
                    <FiCheck /> Passed
                  </span>
                </div>
                <p className="check-description">
                  Validates data values against known reference points
                </p>
              </div>
              
              <div className="quality-check">
                <div className="check-header">
                  <span className="check-type">Timeliness</span>
                  <span className="check-status failed">
                    <FiX /> Failed
                  </span>
                </div>
                <p className="check-description">
                  Checks if data is updated within expected timeframes
                </p>
              </div>
            </div>
            
            <div className="custom-check-example">
              <h4>Example Custom Check</h4>
              <div className="check-config">
                <div className="config-row">
                  <span className="config-label">Column</span>
                  <span className="config-value">email</span>
                </div>
                <div className="config-row">
                  <span className="config-label">Check Type</span>
                  <span className="config-value">Pattern Match</span>
                </div>
                <div className="config-row">
                  <span className="config-label">Pattern</span>
                  <span className="config-value">{"^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,}$"}</span>
                </div>
                <div className="config-row">
                  <span className="config-label">Threshold</span>
                  <span className="config-value">&gt;95%</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="quality-tips">
            <p>
              Navigate to <strong>Quality Checks</strong> to set up custom rules
              for your data files. Create alerts for when quality scores drop 
              below your defined thresholds.
            </p>
          </div>
        </div>
      )
    },
    {
      title: 'Ready to Get Started',
      description: 'You\'re all set to begin monitoring your data files.',
      content: (
        <div className="final-content">
          <div className="completion-icon">
            <FiCheck size={60} className="success-icon" />
          </div>
          <h3>Congratulations!</h3>
          <p className="completion-message">
            You've completed the onboarding guide for Data File Observatory.
            You're now ready to take control of your data quality.
          </p>
          
          <div className="next-steps">
            <h4>Next Steps</h4>
            <ul className="next-steps-list">
              <li>
                <span className="step-icon"><FiUpload /></span>
                <span className="step-text">Upload more data files</span>
              </li>
              <li>
                <span className="step-icon"><FiBarChart2 /></span>
                <span className="step-text">Review data profiles and trends</span>
              </li>
              <li>
                <span className="step-icon"><FiAlertTriangle /></span>
                <span className="step-text">Configure alert notifications</span>
              </li>
              <li>
                <span className="step-icon"><FiLink /></span>
                <span className="step-text">Set up data lineage relationships</span>
              </li>
            </ul>
          </div>
          
          <div className="help-resources">
            <h4>Help Resources</h4>
            <p>
              Visit our documentation for detailed guides on all features.
              If you need assistance, contact our support team.
            </p>
          </div>
        </div>
      )
    }
  ];

  // Handle file upload
  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    setError(null);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        }
      });
      
      if (response.data && response.data.file_id) {
        setUploadedFileId(response.data.file_id);
        // Automatically go to next step after successful upload
        setTimeout(() => {
          setCurrentStep(currentStep + 1);
        }, 1000);
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Navigation functions
  const goToNextStep = () => {
    // If on the upload step and a file is selected but not uploaded yet
    if (currentStep === 1 && file && !uploadedFileId && !uploading) {
      handleUpload();
      return;
    }
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // On the last step, mark onboarding as completed
      localStorage.setItem('dfo-onboarding-completed', 'true');
      handleClose();
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('dfo-onboarding-completed', 'true');
    handleClose();
  };

  const handleClose = () => {
    setShowWizard(false);
    if (onClose) onClose();
  };

  // Check if we should show "Upload" button instead of "Next"
  const isUploadStep = currentStep === 1;
  const showUploadButton = isUploadStep && file && !uploadedFileId && !uploading;

  // If onboarding is already completed or manually closed
  if (!showWizard) {
    return null;
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-wizard">
        <div className="wizard-header">
          <h2>{steps[currentStep].title}</h2>
          <button className="close-wizard" onClick={handleClose}>
            <FiX />
          </button>
        </div>
        
        <div className="wizard-progress">
          {steps.map((step, index) => (
            <div 
              key={index} 
              className={`progress-step ${index <= currentStep ? 'completed' : ''} ${index === currentStep ? 'active' : ''}`}
            >
              <div className="step-indicator">
                {index < currentStep ? (
                  <FiCheck className="step-icon" />
                ) : (
                  <span className="step-number">{index + 1}</span>
                )}
              </div>
              <div className="step-label">
                {step.title}
              </div>
            </div>
          ))}
        </div>
        
        <div className="wizard-content">
          <p className="step-description">{steps[currentStep].description}</p>
          {steps[currentStep].content}
        </div>
        
        <div className="wizard-footer">
          <div className="wizard-controls">
            <button 
              className="wizard-button secondary"
              onClick={goToPreviousStep}
              disabled={currentStep === 0}
            >
              <FiChevronLeft /> Back
            </button>
            
            {showUploadButton ? (
              <button 
                className="wizard-button primary"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            ) : (
              <button 
                className="wizard-button primary"
                onClick={goToNextStep}
                disabled={isUploadStep && !uploadedFileId && !uploading}
              >
                {currentStep === steps.length - 1 ? 'Finish' : 'Next'} <FiChevronRight />
              </button>
            )}
          </div>
          
          <button 
            className="wizard-button text-button"
            onClick={handleSkip}
          >
            Skip Tutorial
          </button>
        </div>
      </div>
    </div>
  );
};
OnboardingWizard.propTypes = {
 
  onClose: PropTypes.func
};

OnboardingWizard.defaultProps = {
  onClose: null
};
export default OnboardingWizard;