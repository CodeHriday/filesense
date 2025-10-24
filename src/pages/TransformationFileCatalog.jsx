import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiTrash2, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import TransformationProfilingModal from '../components/TransformationProfilingModal';
import { PageTransition } from '../components/MicroAnimations';
import { formatBytes, formatDate } from '../utils/formatters';
import './TransformationFileCatalog.css';

const TransformationFileCatalog = () => {
  const [files, setFiles] = useState([]);
  const [groupedFiles, setGroupedFiles] = useState({});
  const [expandedMappings, setExpandedMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [showProfilingModal, setShowProfilingModal] = useState(false);

  useEffect(() => {
    fetchTransformationFiles();
  }, []);

  useEffect(() => {
    // Group files by mapping_name when files change
    const grouped = files.reduce((acc, file) => {
      const mappingName = file.mapping_name || 'Unknown Mapping';
      if (!acc[mappingName]) {
        acc[mappingName] = [];
      }
      acc[mappingName].push(file);
      return acc;
    }, {});

    // Sort files within each group by created_dt (newest first)
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => new Date(b.created_dt) - new Date(a.created_dt));
    });

    setGroupedFiles(grouped);

    // Auto-expand all mappings on initial load
    const initialExpanded = {};
    Object.keys(grouped).forEach(key => {
      initialExpanded[key] = true;
    });
    setExpandedMappings(initialExpanded);
  }, [files]);

  const fetchTransformationFiles = async () => {
    try {
      setLoading(true);
      // Fetch file audit records for transformation-generated files
      const response = await axios.get('/api/file-audit', {
        params: {
          load_type: 'etl_transformation',
          file_role: 'target'
        }
      });
      
      setFiles(response.data.audits || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching transformation files:', err);
      setError('Failed to load transformation file catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfiling = async (correlationId, fileName) => {
    if (!window.confirm(`Are you sure you want to delete all profiling results for "${fileName}"? This will remove both source and target profiling data.`)) {
      return;
    }

    try {
      await axios.delete(`/api/file-audit/correlation/${correlationId}`);
      // Refresh the file list after deletion
      await fetchTransformationFiles();
    } catch (err) {
      console.error('Error deleting profiling results:', err);
      alert('Failed to delete profiling results. Please try again.');
    }
  };

  const toggleMapping = (mappingName) => {
    setExpandedMappings(prev => ({
      ...prev,
      [mappingName]: !prev[mappingName]
    }));
  };

  const getTotalFiles = () => {
    return Object.values(groupedFiles).reduce((sum, files) => sum + files.length, 0);
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="transformation-catalog-page">
          <PageHeader
            title="Transformation File Catalog"
            subtitle="Files created by ETL transformations"
          />
          <LoadingSpinner />
        </div>
      </PageTransition>
    );
  }

  const mappingKeys = Object.keys(groupedFiles).sort();

  return (
    <PageTransition>
      <div className="transformation-catalog-page">
        <PageHeader
          title="Transformation File Catalog"
          subtitle="Files created by ETL transformations with profiling history"
          actions={
            <div className="catalog-file-count">
              <strong>{getTotalFiles()}</strong>
              <span>Total Files</span>
            </div>
          }
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {mappingKeys.length === 0 ? (
          <div className="empty-state-card">
            <p>No transformation files found. Transform data using ETL Mappings to see files here.</p>
          </div>
        ) : (
          <div className="mapping-groups-container">
            {mappingKeys.map((mappingName) => {
              const filesInGroup = groupedFiles[mappingName];
              const isExpanded = expandedMappings[mappingName];

              return (
                <div key={mappingName} className="mapping-group">
                  <div 
                    className="mapping-group-header"
                    onClick={() => toggleMapping(mappingName)}
                  >
                    <div className="mapping-header-left">
                      {isExpanded ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
                      <span className="mapping-name-title">
                        {mappingName}
                      </span>
                      <Link 
                        to={`/mappings`} 
                        className="view-mapping-link"
                        onClick={(e) => e.stopPropagation()}
                        title="View mapping"
                      >
                        <FiArrowRight size={16} />
                        View Mapping
                      </Link>
                    </div>
                    <div className="mapping-header-right">
                      <span className="file-count-badge">
                        {filesInGroup.length} {filesInGroup.length === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mapping-group-body">
                      <table className="files-table">
                        <thead>
                          <tr>
                            <th>Target File</th>
                            <th>Source File</th>
                            <th>Created</th>
                            <th>Project</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filesInGroup.map((file) => (
                            <tr key={file.id}>
                              <td>
                                <span className="file-name">{file.file_name}</span>
                              </td>
                              <td className="source-file">{file.source_path || '-'}</td>
                              <td className="created-date">
                                {formatDate(file.created_dt)}
                              </td>
                              <td className="project-name">{file.project_name || 'Default Project'}</td>
                              <td>
                                <div className="action-buttons">
                                  <button 
                                    className="btn-view-profiling"
                                    onClick={() => {
                                      setSelectedJobId(file.job_id);
                                      setShowProfilingModal(true);
                                    }}
                                    disabled={!file.job_id}
                                    title="View profiling results"
                                  >
                                    View Profiling Results
                                  </button>
                                  <button 
                                    className="btn-delete-profiling"
                                    onClick={() => handleDeleteProfiling(file.correlation_id, file.file_name)}
                                    disabled={!file.correlation_id}
                                    title="Delete profiling results"
                                  >
                                    <FiTrash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Profiling Modal */}
        {showProfilingModal && selectedJobId && (
          <TransformationProfilingModal
            jobId={selectedJobId}
            onClose={() => {
              setShowProfilingModal(false);
              setSelectedJobId(null);
            }}
          />
        )}
      </div>
    </PageTransition>
  );
};

export default TransformationFileCatalog;
