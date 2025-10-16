import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import WorkflowList from '../components/workflows/WorkflowList';
import WorkflowForm from '../components/workflows/WorkflowForm';

const Workflows: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<WorkflowList />} />
      <Route path="/new" element={<WorkflowForm />} />
      <Route path="/:workflowName/edit" element={<WorkflowForm />} />
      <Route path="*" element={<Navigate to="/workflows" replace />} />
    </Routes>
  );
};

export default Workflows;
