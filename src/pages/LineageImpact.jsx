import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FiArrowLeft, FiRefreshCw, FiArrowDown, FiArrowUp, 
  FiBox, FiFile, FiFileText
} from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import LineageImpactGraph from '../components/LineageImpactGraph';
import { getFileDetails } from '../api/fileService';
import { getImpactAnalysis } from '../api/lineageService';
import { formatDate, formatBytes } from '../utils/formatters';
import './LineageImpact.css';
import '../components/LineageGraph.css';

function LineageImpact() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [direction, setDirection] = useState('downstream');
  const [depth, setDepth] = useState(3);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Get file details and impact analysis
        const [fileDetails, impact] = await Promise.all([
          getFileDetails(fileId),
          getImpactAnalysis(fileId, direction, depth)
        ]);
        
        setFile(fileDetails);
        setImpactData(impact);
        setError(null);
      } catch (err) {
        console.error('Error fetching lineage impact data:', err);
        setError('Failed to load impact analysis. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [fileId, direction, depth]);
  
  const handleDirectionChange = (newDirection) => {
    if (newDirection !== direction) {
      setDirection(newDirection);
    }
  };
  
  const handleDepthChange = (e) => {
    const newDepth = parseInt(e.target.value);
    setDepth(newDepth);
  };
  
  const handleGoBack = () => {
    navigate('/lineage');
  };
  
  if (loading) {
    return <LoadingSpinner message="Loading impact analysis..." />;
  }
  
  if (error) {
    return (
      <div className="error-message">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="lineage-impact-container">
      <div className="page-header">
        <button className="back-button" onClick={handleGoBack}>
          <FiArrowLeft /> Back to Lineage
        </button>
        <h1>File Lineage Impact Analysis</h1>
      </div>
      
      {file && (
        <Card className="file-info-card">
          <div className="file-header">
            <div className="file-icon">
              {file.file_type === 'csv' && <FiFileText size={24} />}
              {file.file_type === 'json' && <FiFile size={24} />}
              {file.file_type !== 'csv' && file.file_type !== 'json' && <FiBox size={24} />}
            </div>
            <div className="file-details">
              <h2>{file.filename}</h2>
              <div className="file-meta">
                <span className="file-type">{file.file_type.toUpperCase()}</span>
                <span className="file-size">{formatBytes(file.file_size)}</span>
                <span className="file-date">Uploaded: {formatDate(file.created_at)}</span>
              </div>
            </div>
          </div>
          
          <div className="impact-controls">
            <div className="direction-toggle">
              <span>Direction:</span>
              <div className="toggle-buttons">
                <button 
                  className={`toggle-btn ${direction === 'upstream' ? 'active' : ''}`}
                  onClick={() => handleDirectionChange('upstream')}
                >
                  <FiArrowUp className="btn-icon" /> Upstream (Inputs)
                </button>
                <button 
                  className={`toggle-btn ${direction === 'downstream' ? 'active' : ''}`}
                  onClick={() => handleDirectionChange('downstream')}
                >
                  <FiArrowDown className="btn-icon" /> Downstream (Outputs)
                </button>
              </div>
            </div>
            
            <div className="depth-selector">
              <label htmlFor="depth">
                Depth:
                <select 
                  id="depth" 
                  value={depth}
                  onChange={handleDepthChange}
                  className="depth-select"
                >
                  <option value="1">1 Level</option>
                  <option value="2">2 Levels</option>
                  <option value="3">3 Levels</option>
                  <option value="5">5 Levels</option>
                  <option value="10">10 Levels</option>
                </select>
              </label>
            </div>
            
            <button 
              className="btn btn-primary refresh-btn"
              onClick={() => window.location.reload()}
            >
              <FiRefreshCw className="btn-icon" /> Refresh
            </button>
          </div>
        </Card>
      )}
      
      <Card className="impact-graph-card">
        <div className="impact-title">
          <h3>
            {direction === 'downstream' 
              ? 'Downstream Impact (Files affected by changes)' 
              : 'Upstream Dependencies (Files that affect this file)'}
          </h3>
          <div className="impact-legend">
            <div className="legend-item">
              <div className="legend-color root"></div>
              <span>Selected File</span>
            </div>
            <div className="legend-item">
              <div className="legend-color related"></div>
              <span>Related Files</span>
            </div>
          </div>
        </div>
        
        <LineageImpactGraph impactData={impactData} direction={direction} />
        
        {impactData && impactData.relationships && impactData.relationships.length > 0 && (
          <div className="impact-summary">
            <FiInfo className="info-icon" />
            <p>
              {direction === 'downstream' 
                ? `This file impacts ${impactData.relationships.length} ${impactData.relationships.length === 1 ? 'file' : 'files'} downstream.`
                : `This file depends on ${impactData.relationships.length} ${impactData.relationships.length === 1 ? 'file' : 'files'} upstream.`}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default LineageImpact;