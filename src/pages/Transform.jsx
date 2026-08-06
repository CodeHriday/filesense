import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { TransformBuilder } from '../components/Transform';

/**
 * Transform page with the new visual drag-and-drop transform builder.
 *
 * When reached via /transformations/:id (e.g. from a lineage panel redirect),
 * the :id is the string mapping_id of an existing transformation_mapping record.
 * We redirect to the Mappings edit wizard so the user lands on that specific
 * transformation rather than the generic creation flow.
 */
const Transform = () => {
  const { id } = useParams();

  if (id) {
    // Visual mapping IDs follow the "vm-{numeric_id}-{timestamp}" pattern.
    // Navigate to the modern visual mapping designer; fall back to the legacy
    // MappingWizard only for traditional (non-vm) mapping IDs.
    const vmMatch = id.match(/^vm-(\d+)-/);
    if (vmMatch) {
      return <Navigate to={`/visual-mappings/${vmMatch[1]}`} replace />;
    }
    return <Navigate to={`/mappings/edit/${encodeURIComponent(id)}`} replace />;
  }

  return <TransformBuilder />;
};

export default Transform;
