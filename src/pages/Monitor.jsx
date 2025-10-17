import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBarChart2, FiCheckSquare, FiFileText, FiList, FiClock } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getFileCatalog, getFileProfile, getFileQuality } from '../api/fileService';
import { formatBytes, formatDate, getTimeSince } from '../utils/formatters';
import axios from 'axios';
import './Monitor.css';

function Monitor() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileDetails, setFileDetails] = useState(null);
  const [fileQuality, setFileQuality] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [fileAudit, setFileAudit] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState(null);
  
  const navigate = useNavigate();
  
  // Fetch all files on component mount
  useEffect(() => {
    fetchFiles();
  }, []);
  
  // Fetch file details when a file is selected
  useEffect(() => {
    if (selectedFile) {
      fetchFileDetails(selectedFile.file_id);
      // Clear audit data when switching files to prevent stale data
      setFileAudit([]);
    }
  }, [selectedFile]);
  
  // Fetch audit data when audit tab is active and file is selected
  useEffect(() => {
    if (selectedFile && activeTab === 'audit') {
      fetchFileAudit(selectedFile.file_id);
    }
  }, [selectedFile, activeTab]);
  
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
  
  const fetchFileAudit = async (fileId) => {
    try {
      setLoadingAudit(true);
      setAuditError(null);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/file-audit/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFileAudit(response.data.audits || []);
    } catch (err) {
      console.error('Error fetching file audit:', err);
      setFileAudit([]);
      setAuditError('Failed to load audit trail. Please try again.');
    } finally {
      setLoadingAudit(false);
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
  
  const handleGenerateReport = () => {
    if (selectedFile) {
      navigate(`/report/${selectedFile.file_id}`);
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
        <LoadingSpinner />
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
                    <div className="file-info">
                      <div className="file-name">
                        <span className="file-icon">
                          {file.file_type === 'csv' ? '📊' : 
                           file.file_type === 'json' ? '📋' : 
                           file.file_type === 'parquet' ? '📁' : '📄'}
                        </span>
                        {file.filename}
                      </div>
                    </div>
                    <div className="file-stats">
                      <span>{file.file_type.toUpperCase()} | {formatBytes(file.file_size)}</span>
                    </div>
                    <div className="file-quality">
                      {file.quality_score !== undefined ? (
                        <div className={getQualityBadgeClass(file.quality_score)}>
                          {file.quality_score}
                        </div>
                      ) : (
                        <span className="no-quality">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          
          <div className="file-details-container">
            {selectedFile ? (
              loadingDetails ? (
                <LoadingSpinner size="small" />
              ) : (
                <>
                  <Card className="file-overview">
                    <div className="file-header">
                      <h2>{selectedFile.filename}</h2>
                    </div>
                    
                    <div className="file-meta-details">
                      <div className="meta-item">
                        <span className="label">File Type</span>
                        <span className="value">{selectedFile.file_type.toUpperCase()}</span>
                      </div>
                      <div className="meta-item">
                        <span className="label">Size</span>
                        <span className="value">{formatBytes(selectedFile.file_size)}</span>
                      </div>
                      <div className="meta-item">
                        <span className="label">Uploaded</span>
                        <span className="value" title={formatDate(selectedFile.created_at)}>
                          {getTimeSince(selectedFile.created_at)}
                        </span>
                      </div>
                      {fileDetails?.basic_info?.row_count && (
                        <div className="meta-item">
                          <span className="label">Rows</span>
                          <span className="value">{fileDetails.basic_info.row_count.toLocaleString()}</span>
                        </div>
                      )}
                      {fileDetails?.basic_info?.column_count && (
                        <div className="meta-item">
                          <span className="label">Columns</span>
                          <span className="value">{fileDetails.basic_info.column_count}</span>
                        </div>
                      )}
                      {fileQuality?.overall_score !== undefined && (
                        <div className="meta-item">
                          <span className="label">Quality Score</span>
                          <span className={`value ${getQualityBadgeClass(fileQuality.overall_score)}`}>
                            {fileQuality.overall_score}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="file-actions">
                      <button 
                        className="btn btn-primary"
                        onClick={handleViewProfile}
                      >
                        <FiBarChart2 /> View Profile
                      </button>
                      <button 
                        className="btn btn-secondary"
                        onClick={handleViewQuality}
                      >
                        <FiCheckSquare /> Quality Details
                      </button>
                      <button 
                        className="btn btn-success"
                        onClick={handleGenerateReport}
                      >
                        <FiFileText /> Generate Report
                      </button>
                    </div>
                  </Card>
                  
                  <div className="file-tabs">
                    <button 
                      className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab('overview');
                      }}
                    >
                      <FiList /> Overview
                    </button>
                    <button 
                      className={`tab-button ${activeTab === 'audit' ? 'active' : ''}`}
                      onClick={() => setActiveTab('audit')}
                    >
                      <FiClock /> Audit Trail
                    </button>
                  </div>
                  
                  {activeTab === 'overview' && fileDetails && (
                    <Card className="columns-overview">
                      <h3>
                        <FiList className="section-icon" /> 
                        Column Overview
                      </h3>
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
                              
                              const completenessClass = 
                                completeness >= 90 ? 'high' : 
                                completeness >= 70 ? 'medium' : 'low';
                              
                              return (
                                <div className="table-row" key={index}>
                                  <div className="col col-name">{column.name}</div>
                                  <div className="col col-type">{column.type}</div>
                                  <div className="col">
                                    <div className="completeness-bar-container">
                                      <div 
                                        className={`completeness-bar ${completenessClass}`}
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
                  
                  {activeTab === 'audit' && (
                    <Card className="audit-trail">
                      <h3>
                        <FiClock className="section-icon" /> 
                        Audit Trail
                      </h3>
                      {loadingAudit ? (
                        <LoadingSpinner size="small" />
                      ) : auditError ? (
                        <div className="error">{auditError}</div>
                      ) : fileAudit.length === 0 ? (
                        <div className="no-data">No audit records found for this file.</div>
                      ) : (
                        <div className="audit-table">
                          <div className="table-header">
                            <div className="col">Date</div>
                            <div className="col">Source</div>
                            <div className="col">Load Type</div>
                            <div className="col">Records</div>
                            <div className="col">Status</div>
                            <div className="col">Duration</div>
                          </div>
                          <div className="table-body">
                            {fileAudit.map((audit, index) => (
                              <div className="table-row" key={index}>
                                <div className="col">{formatDate(audit.created_dt)}</div>
                                <div className="col">{audit.source || '-'}</div>
                                <div className="col">{audit.load_type || '-'}</div>
                                <div className="col">{(audit.no_of_records_in_source || 0).toLocaleString()}</div>
                                <div className="col">
                                  <span className={`status-badge ${audit.status || 'unknown'}`}>
                                    {audit.status || 'unknown'}
                                  </span>
                                </div>
                                <div className="col">
                                  {audit.processing_duration_ms 
                                    ? `${(audit.processing_duration_ms / 1000).toFixed(2)}s` 
                                    : '-'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
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