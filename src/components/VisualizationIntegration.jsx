import React, { useState, useEffect, useRef } from 'react';
import { FiExternalLink, FiDownload, FiShare2, FiSettings, FiPlus, FiCopy } from 'react-icons/fi';
import { ContextualTooltip } from './ContextualTooltip';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ToggleSwitch } from './MicroInteractions';
import './VisualizationIntegration.css';
import PropTypes from 'prop-types';

/**
 * Component for integrating with external data visualization tools
 */
const VisualizationIntegration = ({
  fileData,
  className = '',
  style = {},
  onExport,
  loading = false
}) => {
  const [selectedTool, setSelectedTool] = useState('tableau');
  const [exportFormat, setExportFormat] = useState('json');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [apiKeyStatus, setApiKeyStatus] = useState({});
  const [connectStatus, setConnectStatus] = useState({});
  const [exportUrl, setExportUrl] = useState('');
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const exportOptionsRef = useRef(null);
  
  // List of supported visualization tools
  const visualizationTools = [
    {
      id: 'tableau',
      name: 'Tableau',
      description: 'Connect to Tableau for interactive dashboards and visualizations',
      icon: '/icons/tableau-icon.svg',
      exportFormats: ['tde', 'hyper', 'csv'],
      requiresApiKey: true,
      connectionType: 'api'
    },
    {
      id: 'powerbi',
      name: 'Power BI',
      description: 'Integrate with Microsoft Power BI for business intelligence',
      icon: '/icons/powerbi-icon.svg',
      exportFormats: ['pbix', 'csv', 'xlsx'],
      requiresApiKey: true,
      connectionType: 'api'
    },
    {
      id: 'looker',
      name: 'Looker',
      description: 'Connect to Looker for advanced business intelligence and analytics',
      icon: '/icons/looker-icon.svg',
      exportFormats: ['json', 'csv'],
      requiresApiKey: true,
      connectionType: 'api'
    },
    {
      id: 'quicksight',
      name: 'Amazon QuickSight',
      description: 'Integrate with AWS QuickSight for cloud-based visualizations',
      icon: '/icons/quicksight-icon.svg',
      exportFormats: ['json', 'csv'],
      requiresApiKey: true,
      connectionType: 'api'
    },
    {
      id: 'superset',
      name: 'Apache Superset',
      description: 'Connect to open-source Apache Superset for data exploration',
      icon: '/icons/superset-icon.svg',
      exportFormats: ['json', 'csv'],
      requiresApiKey: false,
      connectionType: 'direct'
    },
    {
      id: 'jupyter',
      name: 'Jupyter Notebook',
      description: 'Export to Jupyter Notebook for interactive data analysis',
      icon: '/icons/jupyter-icon.svg',
      exportFormats: ['ipynb', 'json', 'csv'],
      requiresApiKey: false,
      connectionType: 'export'
    },
    {
      id: 'local',
      name: 'Download File',
      description: 'Export data to file for use in any visualization tool',
      icon: '/icons/download-icon.svg',
      exportFormats: ['csv', 'json', 'xlsx', 'parquet'],
      requiresApiKey: false,
      connectionType: 'export'
    }
  ];
  
  // List of export format options
  const exportFormatOptions = {
    json: {
      name: 'JSON',
      description: 'JavaScript Object Notation format',
      contentType: 'application/json',
      extension: '.json'
    },
    csv: {
      name: 'CSV',
      description: 'Comma-separated values',
      contentType: 'text/csv',
      extension: '.csv'
    },
    xlsx: {
      name: 'Excel',
      description: 'Microsoft Excel spreadsheet',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: '.xlsx'
    },
    parquet: {
      name: 'Parquet',
      description: 'Apache Parquet columnar storage',
      contentType: 'application/octet-stream',
      extension: '.parquet'
    },
    tde: {
      name: 'Tableau Data Extract',
      description: 'Tableau data extract format',
      contentType: 'application/octet-stream',
      extension: '.tde'
    },
    hyper: {
      name: 'Tableau Hyper',
      description: 'Tableau Hyper high-performance format',
      contentType: 'application/octet-stream',
      extension: '.hyper'
    },
    pbix: {
      name: 'Power BI Template',
      description: 'Microsoft Power BI template',
      contentType: 'application/octet-stream',
      extension: '.pbix'
    },
    ipynb: {
      name: 'Jupyter Notebook',
      description: 'Interactive Python notebook',
      contentType: 'application/x-ipynb+json',
      extension: '.ipynb'
    }
  };
  
  // Get the current selected tool
  const currentTool = visualizationTools.find(tool => tool.id === selectedTool);
  
  // Check for existing API keys on mount
  useEffect(() => {
    const checkApiKeys = async () => {
      try {
        const keys = {
          tableau: localStorage.getItem('dfo-tableau-api-key'),
          powerbi: localStorage.getItem('dfo-powerbi-api-key'),
          looker: localStorage.getItem('dfo-looker-api-key'),
          quicksight: localStorage.getItem('dfo-quicksight-api-key')
        };
        
        const status = {};
        Object.entries(keys).forEach(([tool, key]) => {
          status[tool] = !!key;
        });
        
        setApiKeyStatus(status);
      } catch (error) {
        console.error('Error checking API keys:', error);
      }
    };
    
    checkApiKeys();
  }, []);
  
  // Close export options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportOptionsRef.current && !exportOptionsRef.current.contains(event.target)) {
        setShowExportOptions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Handle tool selection change
  const handleToolChange = (toolId) => {
    setSelectedTool(toolId);
    
    // Reset export format to a supported one for the new tool
    const tool = visualizationTools.find(t => t.id === toolId);
    if (tool && !tool.exportFormats.includes(exportFormat)) {
      setExportFormat(tool.exportFormats[0]);
    }
    
    // Reset success state
    setExportSuccess(false);
  };
  
  // Handle export format change
  const handleFormatChange = (event) => {
    setExportFormat(event.target.value);
  };
  
  // Handle metadata toggle
  const handleMetadataToggle = (value) => {
    setIncludeMetadata(value);
  };
  
  // Connect to the selected visualization tool
  const handleConnect = async () => {
    if (!currentTool) return;
    
    setConnectStatus(prev => ({
      ...prev,
      [currentTool.id]: 'connecting'
    }));
    
    try {
      // Simulating connection to external service
      // In a real app, this would make an API call to your backend
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Connection successful
      setConnectStatus(prev => ({
        ...prev,
        [currentTool.id]: 'connected'
      }));
      
      // Generate a sample URL for demonstration
      if (currentTool.id !== 'local') {
        const timestamp = new Date().getTime();
        setExportUrl(`https://example.com/${currentTool.id}/view/${timestamp}`);
      }
    } catch (error) {
      console.error(`Error connecting to ${currentTool.name}:`, error);
      
      setConnectStatus(prev => ({
        ...prev,
        [currentTool.id]: 'error'
      }));
    }
  };
  
  // Save an API key for a visualization tool
  const handleSaveApiKey = (event, toolId) => {
    event.preventDefault();
    
    const form = event.target;
    const apiKey = form.apiKey.value.trim();
    
    if (!apiKey) return;
    
    try {
      // In a real app, you would validate this key with your backend
      localStorage.setItem(`dfo-${toolId}-api-key`, apiKey);
      
      setApiKeyStatus(prev => ({
        ...prev,
        [toolId]: true
      }));
      
      // Reset form
      form.reset();
    } catch (error) {
      console.error(`Error saving API key for ${toolId}:`, error);
    }
  };
  
  // Handle export action
  const handleExport = async () => {
    if (!currentTool || !exportFormat) return;
    
    try {
      // Call the onExport callback if provided
      if (onExport) {
        await onExport({
          tool: currentTool.id,
          format: exportFormat,
          includeMetadata
        });
      }
      
      // If this is a direct download
      if (currentTool.id === 'local') {
        // In a real app, this would call a backend endpoint to generate and download the file
        const filename = `${fileData?.filename || 'data'}_export_${new Date().getTime()}${exportFormatOptions[exportFormat].extension}`;
        const url = `/api/files/export/${fileData?.file_id}?format=${exportFormat}&includeMetadata=${includeMetadata}`;
        
        // Create a link and click it to trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // For other tools, we'd generate a connection or export to the tool
        await handleConnect();
      }
      
      // Show success state
      setExportSuccess(true);
      
      // Reset success state after a delay
      setTimeout(() => {
        setExportSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };
  
  // Copy URL to clipboard
  const handleCopyUrl = () => {
    if (!exportUrl) return;
    
    navigator.clipboard.writeText(exportUrl)
      .then(() => {
        // Show temporary success message
        const urlElement = document.getElementById('export-url');
        if (urlElement) {
          urlElement.classList.add('copied');
          setTimeout(() => {
            urlElement.classList.remove('copied');
          }, 2000);
        }
      })
      .catch(err => {
        console.error('Failed to copy URL:', err);
      });
  };
  
  // Render API key form
  const renderApiKeyForm = () => {
    if (!currentTool || !currentTool.requiresApiKey) return null;
    
    const hasApiKey = apiKeyStatus[currentTool.id];
    
    if (hasApiKey) {
      return (
        <div className="api-key-status connected">
          <div className="status-icon">✓</div>
          <div className="status-message">
            API key connected for {currentTool.name}
            <button 
              className="change-key-button"
              onClick={() => setApiKeyStatus(prev => ({
                ...prev,
                [currentTool.id]: false
              }))}
            >
              Change key
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <form className="api-key-form" onSubmit={(e) => handleSaveApiKey(e, currentTool.id)}>
        <div className="form-group">
          <label htmlFor="apiKey">{currentTool.name} API Key</label>
          <input 
            type="text" 
            id="apiKey" 
            name="apiKey" 
            placeholder={`Enter your ${currentTool.name} API key`}
            required
          />
        </div>
        <button type="submit" className="save-key-button">Save Key</button>
      </form>
    );
  };
  
  // Loading skeleton
  if (loading) {
    return (
      <div className={`visualization-integration loading ${className}`} style={style}>
        <div className="integration-header">
          <LoadingSkeleton type="text" width="200px" height="24px" />
        </div>
        
        <div className="tools-container">
          <div className="tools-list">
            {[1, 2, 3, 4, 5].map(i => (
              <LoadingSkeleton
                key={i}
                type="rectangle"
                width="100%"
                height="60px"
                borderRadius="8px"
                className="tool-skeleton"
              />
            ))}
          </div>
          
          <div className="tool-details">
            <LoadingSkeleton type="text" width="150px" height="24px" className="detail-title" />
            <LoadingSkeleton type="text" width="100%" height="16px" />
            <LoadingSkeleton type="text" width="90%" height="16px" />
            
            <div className="detail-section">
              <LoadingSkeleton type="text" width="100px" height="20px" className="section-title" />
              <LoadingSkeleton type="rectangle" width="100%" height="120px" borderRadius="8px" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`visualization-integration ${className}`} style={style}>
      <div className="integration-header">
        <h2>Data Visualization Integrations</h2>
        <ContextualTooltip
          content="Connect your data to popular visualization tools or export it in various formats for external analysis."
          position="right"
          interactive={true}
        />
      </div>
      
      <div className="tools-container">
        <div className="tools-list">
          {visualizationTools.map((tool) => (
            <div 
              key={tool.id}
              className={`tool-item ${selectedTool === tool.id ? 'selected' : ''}`}
              onClick={() => handleToolChange(tool.id)}
            >
              <div className="tool-icon">
                {/* Fallback to text initial if icon is not available */}
                {tool.icon ? (
                  <img src={tool.icon} alt={`${tool.name} logo`} onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }} />
                ) : null}
                <div className="tool-initial" style={{ display: tool.icon ? 'none' : 'flex' }}>
                  {tool.name.charAt(0)}
                </div>
              </div>
              <div className="tool-info">
                <div className="tool-name">{tool.name}</div>
                <div className="tool-connection-type">
                  {tool.connectionType === 'api' && 'API Connection'}
                  {tool.connectionType === 'direct' && 'Direct Connect'}
                  {tool.connectionType === 'export' && 'File Export'}
                </div>
              </div>
              {apiKeyStatus[tool.id] && tool.requiresApiKey && (
                <div className="key-indicator">✓</div>
              )}
            </div>
          ))}
        </div>
        
        <div className="tool-details">
          {currentTool && (
            <>
              <h3 className="tool-detail-title">{currentTool.name}</h3>
              <p className="tool-description">{currentTool.description}</p>
              
              {renderApiKeyForm()}
              
              <div className="export-section">
                <h4>Export Options</h4>
                
                <div className="export-options">
                  <div className="option-group">
                    <label>Format</label>
                    <div className="format-selector">
                      <select 
                        value={exportFormat} 
                        onChange={handleFormatChange}
                      >
                        {currentTool.exportFormats.map(format => (
                          <option key={format} value={format}>
                            {exportFormatOptions[format].name} ({exportFormatOptions[format].extension})
                          </option>
                        ))}
                      </select>
                      
                      <ContextualTooltip
                        content={exportFormatOptions[exportFormat]?.description || 'Select an export format'}
                        position="right"
                      />
                    </div>
                  </div>
                  
                  <div className="option-group">
                    <label>Include Metadata</label>
                    <ToggleSwitch
                      isOn={includeMetadata}
                      onToggle={handleMetadataToggle}
                      size="small"
                    />
                  </div>
                </div>
                
                <div className="export-actions">
                  <div className="primary-action">
                    <button 
                      className={`export-button ${exportSuccess ? 'success' : ''}`}
                      onClick={handleExport}
                      disabled={currentTool.requiresApiKey && !apiKeyStatus[currentTool.id]}
                    >
                      {exportSuccess ? (
                        <>
                          <span className="success-icon">✓</span>
                          {currentTool.id === 'local' ? 'Downloaded' : 'Connected'}
                        </>
                      ) : (
                        <>
                          {currentTool.id === 'local' ? (
                            <>
                              <FiDownload />
                              Download {exportFormatOptions[exportFormat]?.name}
                            </>
                          ) : (
                            <>
                              <FiExternalLink />
                              Connect to {currentTool.name}
                            </>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="secondary-actions">
                    <button 
                      className="advanced-button"
                      onClick={() => setShowExportOptions(!showExportOptions)}
                    >
                      <FiSettings />
                      <span className="button-text">Advanced</span>
                    </button>
                    
                    {showExportOptions && (
                      <div className="advanced-options-panel" ref={exportOptionsRef}>
                        <h5>Advanced Export Options</h5>
                        
                        <div className="advanced-option">
                          <label>
                            <input 
                              type="checkbox" 
                              checked={includeMetadata} 
                              onChange={(e) => setIncludeMetadata(e.target.checked)} 
                            />
                            Include file metadata
                          </label>
                        </div>
                        
                        <div className="advanced-option">
                          <label>
                            <input type="checkbox" defaultChecked={true} />
                            Include quality metrics
                          </label>
                        </div>
                        
                        <div className="advanced-option">
                          <label>
                            <input type="checkbox" defaultChecked={false} />
                            Include lineage information
                          </label>
                        </div>
                        
                        <div className="advanced-option">
                          <label>
                            <input type="checkbox" defaultChecked={false} />
                            Include historical versions
                          </label>
                        </div>
                        
                        <div className="option-group">
                          <label>Data sample size</label>
                          <select defaultValue="full">
                            <option value="full">Full dataset</option>
                            <option value="1000">1,000 rows</option>
                            <option value="5000">5,000 rows</option>
                            <option value="10000">10,000 rows</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {exportUrl && (
                <div className="export-result">
                  <h4>Connection URL</h4>
                  <div className="url-display">
                    <input 
                      type="text" 
                      value={exportUrl} 
                      readOnly 
                      id="export-url"
                    />
                    <button className="copy-url-button" onClick={handleCopyUrl}>
                      <FiCopy />
                    </button>
                  </div>
                  
                  <div className="url-actions">
                    <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="open-url-button">
                      <FiExternalLink /> Open in {currentTool.name}
                    </a>
                    
                    <button className="share-button">
                      <FiShare2 /> Share
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      <div className="integration-footer">
        <button className="add-integration-button">
          <FiPlus /> Add Custom Integration
        </button>
        
        <div className="support-text">
          Need help connecting to your tools? <a href="#">View documentation</a>
        </div>
      </div>
    </div>
  );
};

VisualizationIntegration.propTypes = {
  fileData: PropTypes.shape({
    filename: PropTypes.string,
    file_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }),
  className: PropTypes.string,
  style: PropTypes.object,
  onExport: PropTypes.func,
  loading: PropTypes.bool,
};

VisualizationIntegration.defaultProps = {
  fileData: null,
  className: '',
  style: {},
  onExport: null,
  loading: false,
};

export default VisualizationIntegration;