import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import SchedulerList from '../components/scheduler/SchedulerList';
import SchedulerForm from '../components/scheduler/SchedulerForm';

const Scheduler: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<SchedulerList />} />
      <Route path="/new" element={<SchedulerForm />} />
      <Route path="/:id/edit" element={<SchedulerForm />} />
      <Route path="*" element={<Navigate to="/scheduler" replace />} />
    </Routes>
  );
};

export default Scheduler;
