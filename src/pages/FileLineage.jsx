import React, { useState, useEffect } from 'react';
import { 
  FiInfo, 
  FiActivity,
  FiGitBranch,
  FiSearch
} from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import LineageTable from '../components/LineageTable';
import Pagination from '../components/Pagination';
import { getLineages, scanAndPopulateLineage } from '../api/lineageService';
import './FileLineage.css';

function FileLineage() {
  const [lineages, setLineages] = useState({ manual_lineage: [], transformation_lineage: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const lineageData = await getLineages();
        setLineages(lineageData);
        setError(null);
      } catch (err) {
        console.error('Error fetching lineage data:', err);
        setError('Failed to load lineage data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Success message timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  const handleScanAndPopulate = async () => {
    try {
      setScanLoading(true);
      setScanResults(null);
      setError(null);
      
      const results = await scanAndPopulateLineage();
      
      setScanResults(results.summary);
      
      // Refresh lineage data if any were created or updated
      const totalChanges = (results.summary.lineageCreated || 0) + (results.summary.lineageUpdated || 0);
      if (totalChanges > 0) {
        const lineageData = await getLineages();
        setLineages(lineageData);
        const createdMsg = results.summary.lineageCreated > 0 ? `created ${results.summary.lineageCreated}` : '';
        const updatedMsg = results.summary.lineageUpdated > 0 ? `updated ${results.summary.lineageUpdated}` : '';
        const separator = createdMsg && updatedMsg ? ' and ' : '';
        setSuccessMessage(`Successfully ${createdMsg}${separator}${updatedMsg} lineage record(s)!`);
      } else {
        setSuccessMessage('Scan complete. All lineage records are up to date.');
      }
    } catch (err) {
      console.error('Error scanning and populating lineage:', err);
      setError('Failed to scan and populate lineage. Please try again.');
    } finally {
      setScanLoading(false);
    }
  };
  
  // Combine and filter lineage records
  const allLineage = [
    ...(lineages.manual_lineage || []).map(l => ({ ...l, type: 'manual' })),
    ...(lineages.transformation_lineage || []).map(l => ({ ...l, type: 'transformation' }))
  ];

  // Sort by created_at descending
  allLineage.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Filter based on search term
  const filteredLineage = allLineage.filter(lineage => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true; // Show all if search is empty
    
    const sourceName = lineage.type === 'transformation'
      ? (lineage.source_pattern || lineage.source_file_pattern || lineage.source_filename || '')
      : (lineage.source_filename || '');
    const targetName = lineage.type === 'transformation'
      ? (lineage.target_pattern || lineage.target_file_name || lineage.target_filename || '')
      : (lineage.target_filename || '');
    const mappingName = lineage.mapping_name || '';

    return (
      sourceName.toLowerCase().includes(term) ||
      targetName.toLowerCase().includes(term) ||
      mappingName.toLowerCase().includes(term)
    );
  });

  // Pagination calculations
  const totalItems = filteredLineage.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Reset currentPage when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Clamp currentPage when filtered results change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedLineage = filteredLineage.slice(startIndex, endIndex);

  // Reconstruct the lineages object for LineageTable with paginated data
  const paginatedLineages = {
    manual_lineage: paginatedLineage.filter(l => l.type === 'manual'),
    transformation_lineage: paginatedLineage.filter(l => l.type === 'transformation')
  };

  const totalLineage = allLineage.length;
  
  return (
    <div className="lineage-container">
      <div className="page-header">
        <h1>File Lineage Visualization</h1>
        <p className="header-description">
          Visualize data flow and transformations across your files
        </p>
      </div>
      
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button 
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          )}
          
          {successMessage && (
            <div className="success-message">
              <p>{successMessage}</p>
            </div>
          )}
      
          {/* Lineage Table View */}
          <Card className="lineage-visualization-card">
            <div className="card-header">
              <div className="header-title">
                <FiActivity className="header-icon" />
                <h2>File Lineage Records</h2>
              </div>
              <div className="header-actions">
                <div style={{ position: 'relative', marginRight: '1rem' }}>
                  <FiSearch style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search lineage..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ 
                      padding: '0.5rem 0.5rem 0.5rem 2.5rem', 
                      border: '1px solid #ddd', 
                      borderRadius: '4px',
                      width: '250px'
                    }}
                  />
                </div>
                <button 
                  className="btn btn-secondary scan-btn"
                  onClick={handleScanAndPopulate}
                  disabled={scanLoading}
                  title="Scan existing transformation jobs and populate missing lineage records"
                >
                  {scanLoading ? (
                    <>
                      <div className="spinner-small"></div>
                      Scanning...
                    </>
                  ) : (
                    <>
                      <FiGitBranch />
                      Scan & Populate Lineage
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="section-description">
              View all lineage relationships between source and target files. Click the scan button to automatically populate lineage from transformation jobs.
            </p>
            
            {scanResults && (
              <div className="scan-results">
                <h4>Scan Results:</h4>
                <div className="scan-stats">
                  <div className="scan-stat">
                    <span className="stat-label">Unique Mappings:</span>
                    <span className="stat-value">{scanResults.totalMappingsProcessed || scanResults.totalJobsProcessed}</span>
                  </div>
                  <div className="scan-stat created">
                    <span className="stat-label">Lineage Created:</span>
                    <span className="stat-value">{scanResults.lineageCreated}</span>
                  </div>
                  {scanResults.lineageUpdated > 0 && (
                    <div className="scan-stat updated">
                      <span className="stat-label">Lineage Updated:</span>
                      <span className="stat-value">{scanResults.lineageUpdated}</span>
                    </div>
                  )}
                  <div className="scan-stat skipped">
                    <span className="stat-label">Skipped:</span>
                    <span className="stat-value">{scanResults.lineageSkipped}</span>
                  </div>
                  {scanResults.errors > 0 && (
                    <div className="scan-stat errors">
                      <span className="stat-label">Errors:</span>
                      <span className="stat-value">{scanResults.errors}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <LineageTable lineages={paginatedLineages} />

            {!loading && totalPages > 1 && (
              <div style={{ marginTop: '1.5rem' }}>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  itemsPerPage={pageSize}
                  totalItems={totalItems}
                />
              </div>
            )}
          </Card>
      
          <Card className="lineage-info-card">
            <div className="info-header">
              <FiInfo className="info-icon" />
              <h3>Understanding File Lineage</h3>
            </div>
            <p>
              File lineage tracks how data flows through your transformation pipeline. Each record shows:
            </p>
            <ul className="lineage-features">
              <li><strong>Source File:</strong> The input file used in the transformation</li>
              <li><strong>Target File:</strong> The output file created by the transformation</li>
              <li><strong>Transformation:</strong> The ETL mapping that processed the data (if applicable)</li>
              <li><strong>View Details:</strong> Click to see complete file metadata, field mappings, and derived expressions</li>
            </ul>
            <p style={{marginTop: '15px'}}>
              The lineage is automatically generated when transformation jobs execute. Use the "Scan & Populate" button to backfill lineage from historical transformation runs.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

export default FileLineage;
