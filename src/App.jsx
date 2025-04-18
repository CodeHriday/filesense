import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import FileUpload from './pages/FileUpload';
import DataProfile from './pages/DataProfile';
import QualityChecks from './pages/QualityChecks';
import Alerts from './pages/Alerts';
import Connections from './pages/Connections';
import Mappings from './pages/Mappings';
import FileLineage from './pages/FileLineage';
import Monitor from './pages/Monitor';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Header />
        <div className="main-container">
          <Sidebar />
          <main className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/upload" element={<FileUpload />} />
              <Route path="/profile/:fileId" element={<DataProfile />} />
              <Route path="/quality/:fileId" element={<QualityChecks />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/mappings" element={<Mappings />} />
              <Route path="/lineage" element={<FileLineage />} />
              <Route path="/monitor" element={<Monitor />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;