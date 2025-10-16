import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import MappingGroupList from '../components/mappingGroups/MappingGroupList';
import MappingGroupForm from '../components/mappingGroups/MappingGroupForm';

const MappingGroups: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<MappingGroupList />} />
      <Route path="/new" element={<MappingGroupForm />} />
      <Route path="/:id/edit" element={<MappingGroupForm />} />
      <Route path="*" element={<Navigate to="/mapping-groups" replace />} />
    </Routes>
  );
};

export default MappingGroups;
