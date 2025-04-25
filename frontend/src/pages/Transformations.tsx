import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import TransformationList from '../components/transformations/TransformationList';
import TransformationForm from '../components/transformations/TransformationForm';

/**
 * Transformations page component with routing for list, create, edit, and view
 */
const Transformations: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<TransformationList />} />
      <Route path="/new" element={<TransformationForm />} />
      <Route path="/:id" element={<TransformationForm />} />
      <Route path="/:id/edit" element={<TransformationForm />} />
      <Route path="*" element={<Navigate to="/transformations" replace />} />
    </Routes>
  );
};

export default Transformations;