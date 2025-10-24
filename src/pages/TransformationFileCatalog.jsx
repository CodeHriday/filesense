import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import TransformationProfilingModal from '../components/TransformationProfilingModal';
import { PageTransition } from '../components/MicroAnimations';
import { formatBytes, formatDate } from '../utils/formatters';

const TransformationFileCatalog = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [showProfilingModal, setShowProfilingModal] = useState(false);

  useEffect(() => {
    fetchTransformationFiles();
  }, []);

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

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentFiles = files.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(files.length / itemsPerPage);

  return (
    <PageTransition>
      <div className="transformation-catalog-page">
        <PageHeader
          title="Transformation File Catalog"
          subtitle="Files created by ETL transformations with profiling history"
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        <div className="catalog-stats" style={{ 
          padding: '1rem',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <div style={{ fontSize: '0.95rem', color: '#475569' }}>
            <strong style={{ fontSize: '1.25rem', color: '#0f172a', marginRight: '0.5rem' }}>
              {files.length}
            </strong>
            Total Files
          </div>
        </div>

        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Target File</th>
                <th>Source File</th>
                <th>Mapping</th>
                <th>Created</th>
                <th>Project</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentFiles.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    <p>No transformation files found. Transform data using ETL Mappings to see files here.</p>
                  </td>
                </tr>
              ) : (
                currentFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <span>{file.file_name}</span>
                    </td>
                    <td>{file.source_path || '-'}</td>
                    <td>
                      {file.mapping_name ? (
                        <Link 
                          to={`/mappings`} 
                          className="mapping-link"
                          title="View mapping"
                        >
                          {file.mapping_name}
                        </Link>
                      ) : '-'}
                    </td>
                    <td>
                      {formatDate(file.created_dt)}
                    </td>
                    <td>{file.project_name || 'Default Project'}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setSelectedJobId(file.job_id);
                          setShowProfilingModal(true);
                        }}
                        disabled={!file.job_id}
                      >
                        View Profiling Results
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {files.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={files.length}
            />
          )}
        </div>

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
