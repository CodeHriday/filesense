import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import { getFileCatalog, getFileProfile, getFileQuality } from '../api/fileService';
import { formatBytes, formatDate, getTimeSince } from '../utils/formatters';
import './Monitor.css';

function Monitor() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileDetails, setFileDetails] = useState(null);
  const [fileQuality, setFileQuality] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  const navigate = useNavigate();
  
  // Fetch all files on component mount
  useEffect(() => {
    fetchFiles();
  }, []);
  
  // Fetch file details when a file is selected
  useEffect(() => {
    if (selectedFile) {
      fetchFileDetails(selectedFile.file_id);
    }
  }, [selectedFile]);
  
  const fetchFiles = async () => {
    try {
      setLoading(true);
      const data = await getFileCatalog();
      setFiles(data);
      setError(null);
      
      // Select the first file by default if available
      if (data.length > 0 && !selectedFile) {
        setSelectedFile(data[0]);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
      setError('Failed to load files. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchFileDetails = async (fileId) => {
    try {
      setLoadingDetails(true);
      
      // Fetch both profile and quality data in parallel
      const [profileData, qualityData] = await Promise.all([
        getFileProfile(fileId),
        getFileQuality(fileId)
      ]);
      
      setFileDetails(profileData);
      setFileQuality(qualityData);
      setError(null);
    } catch (err) {
      console.error('Error fetching file details:', err);
      setError('Failed to load file details. Please try again later.');
    } finally {
      setLoadingDetails(false);
    }
  };
  
  const handleFileSelect = (file) => {
    setSelectedFile(file);
  };
  
  const handleViewProfile = () => {
    if (selectedFile) {
      navigate(`/profile/${selectedFile.file_id}`);
    }
  };
  
  const handleViewQuality = () => {
    if (selectedFile) {
      navigate(`/quality/${selectedFile.file_id}`);
    }
  };
  
  const getQualityBadgeClass = (score) => {
    if (score >= 80) return 'quality-badge high';
    if (score >= 60) return 'quality-badge medium';
    return 'quality-badge low';
  };
  
  return (
    <div className="monitor-container">
      <h1>File Monitor</h1>
      
      {loading ? (
        <div className="loading">Loading files...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <div className="monitor-layout">
          <Card className="files-list">
            <h2>Uploaded Files</h2>
            {files.length === 0 ? (
              <div className="no-files">No files uploaded yet.</div>
            ) : (
              <div className="file-list">
                {files.map(file => (
                  <div 
                    key={file.file_id} 
                    className={`file-item ${selectedFile && selectedFile.file_id === file.file_id ? 'selected' : ''}`}
                    onClick={() => handleFileSelect(file)}
                  >
                    <div className="file-icon">
                      {file.file_type === 'csv' ? '📊' : 
                       file.file_type === 'json' ? '📋' : 
                       file.file_type === 'parquet' ? '📁' : '📄'}
                    </div>
                    <div className="file-info">
                      <div className="file-name">{file.filename}</div>
                      <div className="file-meta">
                        <span>{file.file_type.toUpperCase()}</span>
                        <span>{formatBytes(file.file_size)}</span>
                        <span title={formatDate(file.created_at)}>
                          {getTimeSince(file.created_at)}
                        </span>
                      </div>
                    </div>
                    {file.quality_score !== undefined && (
                      <div className={getQualityBadgeClass(file.quality_score)}>
                        {file.quality_score}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
          
          <div className="file-details-container">
            {selectedFile ? (
              loadingDetails ? (
                <div className="loading">Loading file details...</div>
              ) : (
                <>
                  <Card className="file-overview">
                    <div className="file-header">
                      <h2>{selectedFile.filename}</h2>
                      <div className="file-actions">
                        <button 
                          className="btn btn-primary"
                          onClick={handleViewProfile}
                        >
                          View Full Profile
                        </button>
                        <button 
                          className="btn btn-secondary"
                          onClick={handleViewQuality}
                        >
                          View Quality Details
                        </button>
                      </div>
                    </div>
                    
                    <div className="file-meta-details">
                      <div className="meta-item">
                        <span className="label">File Type:</span>
                        <span className="value">{selectedFile.file_type.toUpperCase()}</span>
                      </div>
                      <div className="meta-item">
                        <span className="label">Size:</span>
                        <span className="value">{formatBytes(selectedFile.file_size)}</span>
                      </div>
                      <div className="meta-item">
                        <span className="label">Uploaded:</span>
                        <span className="value" title={formatDate(selectedFile.created_at)}>
                          {getTimeSince(selectedFile.created_at)}
                        </span>
                      </div>
                      {fileDetails?.basic_info?.row_count && (
                        <div className="meta-item">
                          <span className="label">Rows:</span>
                          <span className="value">{fileDetails.basic_info.row_count.toLocaleString()}</span>
                        </div>
                      )}
                      {fileDetails?.basic_info?.column_count && (
                        <div className="meta-item">
                          <span className="label">Columns:</span>
                          <span className="value">{fileDetails.basic_info.column_count}</span>
                        </div>
                      )}
                      {fileQuality?.overall_score !== undefined && (
                        <div className="meta-item">
                          <span className="label">Quality Score:</span>
                          <span className={`value ${getQualityBadgeClass(fileQuality.overall_score)}`}>
                            {fileQuality.overall_score}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                  
                  {fileDetails && (
                    <Card className="columns-overview">
                      <h3>Column Overview</h3>
                      {fileDetails.columns && fileDetails.columns.length > 0 ? (
                        <div className="columns-table">
                          <div className="table-header">
                            <div className="col">Name</div>
                            <div className="col">Type</div>
                            <div className="col">Completeness</div>
                          </div>
                          <div className="table-body">
                            {fileDetails.columns.map((column, index) => {
                              const completeness = fileQuality?.column_metrics?.find(
                                cm => cm.name === column.name
                              )?.completeness || 100;
                              
                              return (
                                <div className="table-row" key={index}>
                                  <div className="col">{column.name}</div>
                                  <div className="col">{column.type}</div>
                                  <div className="col">
                                    <div className="completeness-bar-container">
                                      <div 
                                        className="completeness-bar" 
                                        style={{width: `${completeness}%`}}
                                      />
                                      <span>{completeness.toFixed(1)}%</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="no-columns">No column information available.</div>
                      )}
                    </Card>
                  )}
                </>
              )
            ) : (
              <div className="no-selection">
                <p>Select a file to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Monitor;