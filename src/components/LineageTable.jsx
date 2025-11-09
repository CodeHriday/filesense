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

  // Helper function to remove job prefix from transformed filenames
  const cleanTransformedFilename = (filename) => {
    if (!filename) return filename;
    // Remove pattern like "transformed_JOB-1762509569854-06fe5455_"
    const cleanedName = filename.replace(/^transformed_JOB-[0-9]+-[a-f0-9]+_/, '');
    return cleanedName;
  };

  const handleViewDetails = (lineage) => {
    setSelectedLineage(lineage);
  };

  // Helper function to extract file type from filename
  const getFileTypeFromFilename = (filename) => {
    if (!filename) return null;
    const ext = filename.split('.').pop()?.toLowerCase();
    const typeMap = {
      'csv': 'CSV',
      'json': 'JSON',
      'xml': 'XML',
      'xlsx': 'XLSX',
      'xls': 'XLSX',
      'parquet': 'Parquet'
    };
    return typeMap[ext] || null;
  };

  // Helper function to get display file type
  const getDisplayFileType = (lineage, isSource) => {
    if (lineage.type === 'transformation') {
      if (isSource) {
        // For source: extract from source_pattern or source_file_pattern
        const pattern = lineage.source_pattern || lineage.source_file_pattern;
        const inferredType = getFileTypeFromFilename(pattern);
        return inferredType || getFileTypeFromFilename(lineage.source_filename) || 'N/A';
      } else {
        // For target: use target_file_format or extract from pattern
        if (lineage.target_file_format) return lineage.target_file_format.toUpperCase();
        const pattern = lineage.target_pattern || lineage.target_file_name;
        const inferredType = getFileTypeFromFilename(pattern);
        return inferredType || getFileTypeFromFilename(lineage.target_filename) || 'N/A';
      }
    } else {
      // Manual lineage - use the file_type or extract from filename
      if (isSource) {
        return lineage.source_file_type?.toUpperCase() || getFileTypeFromFilename(lineage.source_filename) || 'N/A';
      } else {
        return lineage.target_file_type?.toUpperCase() || getFileTypeFromFilename(lineage.target_filename) || 'N/A';
      }
    }
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
              <th>Type</th>
              <th></th>
              <th>Target File</th>
              <th>Type</th>
              <th>Owner</th>
              <th>Contract ID</th>
              <th>Transformation Job</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allLineage.map((lineage, index) => (
              <tr key={`${lineage.type}-${lineage.id}-${index}`}>
                <td className="source-cell">
                  <div className="file-name-compact">
                    {lineage.type === 'transformation' 
                      ? (lineage.source_pattern || lineage.source_file_pattern || lineage.source_filename)
                      : lineage.source_filename}
                  </div>
                </td>
                <td className="type-cell">
                  {getDisplayFileType(lineage, true)}
                </td>
                <td className="arrow-cell">
                  <FiArrowRight className="flow-arrow" />
                </td>
                <td className="target-cell">
                  <div className="file-name-compact">
                    {lineage.type === 'transformation' 
                      ? cleanTransformedFilename(lineage.target_pattern || lineage.target_file_name || lineage.target_filename)
                      : lineage.target_filename}
                  </div>
                </td>
                <td className="type-cell">
                  {getDisplayFileType(lineage, false)}
                </td>
                <td className="owner-cell">
                  {lineage.source_owner || lineage.target_owner || '-'}
                </td>
                <td className="contract-cell">
                  {lineage.agreement_name || lineage.source_agreement_name || lineage.target_agreement_name || '-'}
                </td>
                <td className="job-cell">
                  {lineage.type === 'transformation' ? (
                    lineage.mapping_name || 'ETL Transform'
                  ) : (
                    '-'
                  )}
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
