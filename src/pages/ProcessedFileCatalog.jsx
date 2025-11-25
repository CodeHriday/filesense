import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiTrash2, FiChevronDown, FiChevronRight, FiGitBranch, FiSearch, FiEye } from 'react-icons/fi';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import TransformationProfilingModal from '../components/TransformationProfilingModal';
import TransformationDetailsPanel from '../components/TransformationDetailsPanel';
import { PageTransition } from '../components/MicroAnimations';
import { formatBytes, formatDate } from '../utils/formatters';
import { getLineages } from '../api/lineageService';
import ConfirmModal from '../components/ConfirmModal';
import './ProcessedFileCatalog.css';

const ProcessedFileCatalog = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [groupedFiles, setGroupedFiles] = useState({});
  const [expandedMappings, setExpandedMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [showProfilingModal, setShowProfilingModal] = useState(false);
  const [selectedLineage, setSelectedLineage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  const fetchTransformationFiles = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch file audit records for transformation-generated files
      const params = {
        load_type: 'etl_transformation',
        file_role: 'target'
      };

      // Add search parameter if present
      if (searchTerm && searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const response = await axios.get('/api/file-audit', { params });
      
      setFiles(response.data.audits || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching transformation files:', err);
      setError('Failed to load transformation file catalog');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchTransformationFiles();
  }, [fetchTransformationFiles]);

  // Listen for vendor file uploads from other components/tabs
  useEffect(() => {
    const handleFileUploaded = (event) => {
      console.log('Vendor file uploaded, refreshing processed catalog...', event.detail);
      fetchTransformationFiles();
    };

    window.addEventListener('vendorFileUploaded', handleFileUploaded);

    return () => {
      window.removeEventListener('vendorFileUploaded', handleFileUploaded);
    };
  }, [fetchTransformationFiles]);

  useEffect(() => {
    // Debounce search: wait 300ms after user stops typing
    const timeoutId = setTimeout(() => {
      fetchTransformationFiles();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, fetchTransformationFiles]);

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

    // Start all mappings collapsed
    const initialExpanded = {};
    Object.keys(grouped).forEach(key => {
      initialExpanded[key] = false;
    });
    setExpandedMappings(initialExpanded);
  }, [files]);

  const handleDeleteProfiling = async (correlationId, fileName) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete all profiling results for "${fileName}"? This will remove both source and target profiling data.`,
      action: async () => {
        try {
          await axios.delete(`/api/file-audit/correlation/${correlationId}`);
          // Refresh the file list after deletion
          await fetchTransformationFiles();
        } catch (err) {
          console.error('Error deleting profiling results:', err);
          alert('Failed to delete profiling results. Please try again.');
        }
      }
    });
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

  const handleViewLineage = async (mappingName) => {
    try {
      // Fetch all lineage data
      const lineageData = await getLineages();
      
      // Find the transformation lineage for this specific mapping
      const transformationLineage = lineageData.transformation_lineage || [];
      const mappingLineage = transformationLineage.find(
        lineage => lineage.mapping_name === mappingName
      );

      if (mappingLineage) {
        // Add type property for TransformationDetailsPanel
        setSelectedLineage({ ...mappingLineage, type: 'transformation' });
      } else {
        alert(`No lineage found for mapping "${mappingName}"`);
      }
    } catch (err) {
      console.error('Error fetching lineage:', err);
      alert('Failed to load lineage data. Please try again.');
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="gps-page-container">
          <PageHeader
            title="Processed File Catalog"
            subtitle="Files created by ETL transformations"
            hideHomeButton={true}
          />
          <LoadingSpinner />
        </div>
      </PageTransition>
    );
  }

  const mappingKeys = Object.keys(groupedFiles).sort();

  return (
    <PageTransition>
      <div className="gps-page-container">
        <PageHeader
          title="Processed File Catalog"
          subtitle="Files created by ETL transformations with profiling history"
          hideHomeButton={true}
          actions={
            <div className="catalog-file-count">
              <strong>{getTotalFiles()}</strong>
              <span>Total Files</span>
            </div>
          }
        />

        <div className="search-input-container">
          <FiSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search by mapping or file name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

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
                      <button
                        className="view-lineage-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewLineage(mappingName);
                        }}
                        title="View lineage for this mapping"
                      >
                        <FiGitBranch size={16} />
                        View Lineage
                      </button>
                    </div>
                    <div className="mapping-header-right">
                      <span className="file-count-badge">
                        {filesInGroup.length} {filesInGroup.length === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mapping-group-body">
                      <div style={{ overflowX: 'auto', width: '100%' }}>
                        <table className="gps-table">
                        <thead>
                          <tr>
                            <th>Source File</th>
                            <th>Target File</th>
                            <th>Created</th>
                            <th>Project</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filesInGroup.map((file) => (
                            <tr key={file.id}>
                              <td className="source-file">
                                <span className="file-name">
                                  {file.source_path || '-'}
                                  {file.has_schema_changes && (
                                    <span 
                                      className="schema-changed-badge" 
                                      title="Schema has changed from previous upload"
                                      style={{
                                        marginLeft: '8px',
                                        padding: '2px 8px',
                                        backgroundColor: '#ff9800',
                                        color: 'white',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: '500',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      <FiGitBranch size={12} /> Schema Changed
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td>{file.file_name}</td>
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
                                    title="View source file profiling results"
                                  >
                                    Source File Profile
                                  </button>
                                  <button 
                                    className="btn-view-profile"
                                    onClick={() => navigate(`/profile/${encodeURIComponent(file.file_id)}`)}
                                    disabled={!file.file_id}
                                    title="View target file profile and schema history"
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: '#3b82f6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: file.file_id ? 'pointer' : 'not-allowed',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontSize: '0.875rem',
                                      marginLeft: '8px'
                                    }}
                                  >
                                    <FiEye size={16} /> Target File Profile
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

        {/* Lineage Details Modal */}
        {selectedLineage && (
          <TransformationDetailsPanel
            transformationData={selectedLineage}
            onClose={() => setSelectedLineage(null)}
          />
        )}

        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          onConfirm={() => {
            confirmModal.action?.();
            setConfirmModal({ ...confirmModal, isOpen: false });
          }}
          title={confirmModal.title}
          message={confirmModal.message}
          variant="danger"
        />
      </div>
    </PageTransition>
  );
};

export default ProcessedFileCatalog;
