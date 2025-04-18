import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import FileUpload from './pages/FileUpload';
import DataProfile from './pages/DataProfile';
import QualityChecks from './pages/QualityChecks';
import QualityReport from './pages/QualityReport';
import Alerts from './pages/Alerts';
import Connections from './pages/Connections';
import Mappings from './pages/Mappings';
import FileLineage from './pages/FileLineage';
import LineageImpact from './pages/LineageImpact';
import Monitor from './pages/Monitor';
import Badges from './pages/Badges';
import DataInsights from './pages/DataInsights';
import Recommendations from './pages/Recommendations';
import DataStories from './pages/DataStories';
import DashboardSettings from './pages/DashboardSettings';
import OnboardingWizard from './components/OnboardingWizard';
import AccessibilityWidget from './components/AccessibilityWidget';
import { AccessibilityProvider } from './context/AccessibilityContext';
import './App.css';
import './styles/accessibility.css';

function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // Check if this is a new user (no onboarding completed flag in localStorage)
  useEffect(() => {
    const hasCompletedOnboarding = localStorage.getItem('dfo-onboarding-completed');
    if (hasCompletedOnboarding !== 'true') {
      setShowOnboarding(true);
    }
  }, []);
  
  return (
    <AccessibilityProvider>
      <Router>
        <div className="app">
          {/* Skip to main content link for keyboard users */}
          <a href="#main-content" className="skip-link">Skip to main content</a>
          
          <Header />
          <div className="main-container">
            <Sidebar />
            <main id="main-content" className="content" tabIndex="-1">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/upload" element={<FileUpload />} />
                <Route path="/profile/:fileId" element={<DataProfile />} />
                <Route path="/quality/:fileId" element={<QualityChecks />} />
                <Route path="/report/:fileId" element={<QualityReport />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/mappings" element={<Mappings />} />
                <Route path="/lineage" element={<FileLineage />} />
                <Route path="/lineage/impact/:fileId" element={<LineageImpact />} />
                <Route path="/monitor" element={<Monitor />} />
                <Route path="/badges" element={<Badges />} />
                <Route path="/insights" element={<DataInsights />} />
                <Route path="/recommendations" element={<Recommendations />} />
                <Route path="/stories" element={<DataStories />} />
                <Route path="/dashboard-settings" element={<DashboardSettings />} />
              </Routes>
            </main>
          </div>
          
          {/* Accessibility Widget */}
          <AccessibilityWidget />
          
          {/* Onboarding Wizard */}
          {showOnboarding && (
            <OnboardingWizard onClose={() => setShowOnboarding(false)} />
          )}
        </div>
      </Router>
    </AccessibilityProvider>
  );
}

export default App;