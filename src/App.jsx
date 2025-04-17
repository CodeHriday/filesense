import React, { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { FileUpload } from './pages/FileUpload';
import { DataProfile } from './pages/DataProfile';
import { QualityChecks } from './pages/QualityChecks';
import { AlertsConfig } from './pages/AlertsConfig';
import { FileCatalog } from './pages/FileCatalog';
import './App.css';

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedFile, setSelectedFile] = useState(null);
  
  const handleNavigate = (page, params) => {
    setActivePage(page);
    
    // Handle any navigation parameters
    if (params && params.fileId) {
      // In a real app, we would fetch the file data by ID here
      console.log('Navigate to file:', params.fileId);
    }
  };
  
  const handleFileSelect = (file) => {
    setSelectedFile(file);
    
    // If a file is selected and we're on the upload page, navigate to the profile page
    if (file && activePage === 'upload') {
      setActivePage('profile');
    }
  };
  
  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      case 'upload':
        return <FileUpload onFileSelect={handleFileSelect} />;
      case 'profile':
        return <DataProfile selectedFile={selectedFile} />;
      case 'quality':
        return <QualityChecks selectedFile={selectedFile} />;
      case 'alerts':
        return <AlertsConfig />;
      case 'catalog':
        return <FileCatalog onFileSelect={handleFileSelect} />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };
  
  return (
    <div className="app">
      <Header />
      
      <div className="app-container">
        <Sidebar activePage={activePage} onNavigate={handleNavigate} />
        
        <main className="main-content">
          <div className="container">
            {renderActivePage()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;