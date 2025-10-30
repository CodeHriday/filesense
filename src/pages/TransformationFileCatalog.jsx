import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiTrash2, FiChevronDown, FiChevronRight, FiGitBranch, FiSearch } from 'react-icons/fi';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import TransformationProfilingModal from '../components/TransformationProfilingModal';
import TransformationDetailsPanel from '../components/TransformationDetailsPanel';
import { PageTransition } from '../components/MicroAnimations';
import { formatBytes, formatDate } from '../utils/formatters';
import { getLineages } from '../api/lineageService';
import './TransformationFileCatalog.css';

const TransformationFileCatalog = () => {
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

  useEffect(() => {
    fetchTransformationFiles();
  }, []);

  useEffect(() => {
    // Debounce search: wait 300ms after user stops typing
    const timeoutId = setTimeout(() => {
      fetchTransformationFiles();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

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

  const fetchTransformationFiles = async () => {
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
      </div>
    </PageTransition>
  );
};

export default TransformationFileCatalog;
