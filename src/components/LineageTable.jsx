import React, { useState } from 'react';
import { FiEye, FiArrowRight, FiGitMerge } from 'react-icons/fi';
import TransformationDetailsPanel from './TransformationDetailsPanel';
import './LineageTable.css';

function LineageTable({ lineages }) {
  const [selectedLineage, setSelectedLineage] = useState(null);

  // Combine manual and transformation lineage into a single list
  const allLineage = [
    ...(lineages.manual_lineage || []).map(l => ({ ...l, type: 'manual' })),
    ...(lineages.transformation_lineage || []).map(l => ({ ...l, type: 'transformation' }))
  ];

  // Sort by created_at descending
  allLineage.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewDetails = (lineage) => {
    setSelectedLineage(lineage);
  };

  if (allLineage.length === 0) {
    return (
      <div className="empty-lineage-message">
        <p>No lineage records found. Use "Scan & Populate" to generate lineage from transformation jobs.</p>
      </div>
    );
  }

  return (
    <>
      <div className="lineage-table-wrapper">
        <table className="lineage-table">
          <thead>
            <tr>
              <th>Source File</th>
              <th></th>
              <th>Target File</th>
              <th>Transformation</th>
              <th>Owner</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allLineage.map((lineage, index) => (
              <tr key={`${lineage.type}-${lineage.id}-${index}`}>
                <td className="source-cell">
                  <div className="file-info">
                    <div className="file-name">
                      {lineage.type === 'transformation' 
                        ? (lineage.source_pattern || lineage.source_file_pattern || lineage.source_filename)
                        : lineage.source_filename}
                    </div>
                    <div className="file-meta">
                      {lineage.type === 'transformation' 
                        ? (lineage.source_file_pattern ? 'PATTERN' : lineage.source_file_type?.toUpperCase())
                        : lineage.source_file_type?.toUpperCase()}
                      {lineage.source_owner && (
                        <span className="owner-badge" title="Source Owner">
                          {' • '}{lineage.source_owner}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="arrow-cell">
                  <FiArrowRight className="flow-arrow" />
                </td>
                <td className="target-cell">
                  <div className="file-info">
                    <div className="file-name">
                      {lineage.type === 'transformation' 
                        ? (lineage.target_pattern || lineage.target_file_name || lineage.target_filename)
                        : lineage.target_filename}
                    </div>
                    <div className="file-meta">
                      {lineage.type === 'transformation' 
                        ? (lineage.target_file_format?.toUpperCase() || 'PATTERN')
                        : lineage.target_file_type?.toUpperCase()}
                      {lineage.target_owner && (
                        <span className="owner-badge" title="Target Owner">
                          {' • '}{lineage.target_owner}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="transformation-cell">
                  {lineage.type === 'transformation' ? (
                    <div className="transformation-badge">
                      <FiGitMerge />
                      <span>{lineage.mapping_name || 'ETL Transform'}</span>
                    </div>
                  ) : (
                    <span className="no-transformation">Direct</span>
                  )}
                </td>
                <td className="owner-cell">
                  <div className="owner-info">
                    {lineage.source_owner && (
                      <div className="owner-item" title="Source Owner">
                        <span className="owner-label">Src:</span>
                        <span className="owner-value">{lineage.source_owner}</span>
                      </div>
                    )}
                    {lineage.target_owner && (
                      <div className="owner-item" title="Target Owner">
                        <span className="owner-label">Tgt:</span>
                        <span className="owner-value">{lineage.target_owner}</span>
                      </div>
                    )}
                    {!lineage.source_owner && !lineage.target_owner && (
                      <span className="no-owner">N/A</span>
                    )}
                  </div>
                </td>
                <td className="date-cell">{formatDate(lineage.created_at)}</td>
                <td className="actions-cell">
                  <button
                    className="view-btn"
                    onClick={() => handleViewDetails(lineage)}
                    title="View Details"
                  >
                    <FiEye />
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedLineage && (
        <TransformationDetailsPanel
          transformationData={selectedLineage}
          onClose={() => setSelectedLineage(null)}
        />
      )}
    </>
  );
}

export default LineageTable;
