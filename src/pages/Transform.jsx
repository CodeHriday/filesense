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
    return <Navigate to={`/mappings/edit/${encodeURIComponent(id)}`} replace />;
  }

  return <TransformBuilder />;
};

export default Transform;
