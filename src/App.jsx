import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import NotificationList from './components/Notifications/NotificationList';
import Dashboard from './pages/Dashboard';
import FileUpload from './pages/FileUpload';
import DataProfile from './pages/DataProfile';
import QualityChecks from './pages/QualityChecks';
import QualityReport from './pages/QualityReport';
import Alerts from './pages/Alerts';
import Connections from './pages/Connections';
import Mappings from './pages/Mappings';
import Transformations from './pages/Transformations';
import FileLineage from './pages/FileLineage';
import LineageImpact from './pages/LineageImpact';
import Monitor from './pages/Monitor';
import Scheduler from './pages/Scheduler';
import Badges from './pages/Badges';
import DataInsights from './pages/DataInsights';
import Recommendations from './pages/Recommendations';
import DataStories from './pages/DataStories';
import DashboardSettings from './pages/DashboardSettings';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import HooksDemo from './pages/HooksDemo';
// Business Process Management imports
import Groups from './pages/Groups';
import BusinessProcesses from './pages/BusinessProcesses';
import Jobs from './pages/Jobs';
import ProcessManagementWizard from './pages/ProcessManagementWizard';
import OnboardingWizard from './components/OnboardingWizard';
import AccessibilityWidget from './components/AccessibilityWidget';
import { AccessibilityProvider } from './context/AccessibilityContext';
import AuthProvider, { useAuth } from './context/AuthContext';
import { AnnouncementProvider } from './components/accessibility';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider, ModalProvider } from './hooks';
import './App.css';
import './styles/accessibility.css';
import './styles/Login.css';
import './styles/UserManagement.css';
import './styles/RoleManagement.css';
import './styles/AIPredictiveInsights.css';
// Business Process Management styles
import './styles/Groups.css';
import './styles/BusinessProcesses.css';
import './styles/Jobs.css';
import './styles/ProcessManagementWizard.css';
import './styles/Transformations.css';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

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
      <AuthProvider>
        <AnnouncementProvider>
          <ToastProvider>
            <NotificationsProvider>
              <ModalProvider>
                <Router>
                  <AppContent showOnboarding={showOnboarding} setShowOnboarding={setShowOnboarding} />
                </Router>
              </ModalProvider>
            </NotificationsProvider>
          </ToastProvider>
        </AnnouncementProvider>
      </AuthProvider>
    </AccessibilityProvider>
  );
}

// Separate component to use useAuth() hook inside Router context
function AppContent({ showOnboarding, setShowOnboarding }) {
  const { currentUser } = useAuth();
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState(null);
  
  // Function to toggle AI Insights sidebar
  const toggleAIInsights = (fileId = null) => {
    setSelectedFileId(fileId);
    setShowAIInsights(prev => fileId ? true : !prev);
  };
  
  return (
    <div className="app">
      {/* Skip to main content link for keyboard users */}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      
      {/* Show header and sidebar only if logged in */}
      {currentUser && (
        <>
          <Header showAIInsights={toggleAIInsights} />
          <div className="main-container">
            <Sidebar />
            <main id="main-content" className="content" tabIndex="-1">
              <Routes>
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/upload" element={<ProtectedRoute><FileUpload /></ProtectedRoute>} />
                <Route path="/profile/:fileId" element={<ProtectedRoute><DataProfile showAIInsights={toggleAIInsights} /></ProtectedRoute>} />
                <Route path="/quality/:fileId" element={<ProtectedRoute><QualityChecks showAIInsights={toggleAIInsights} /></ProtectedRoute>} />
                <Route path="/report/:fileId" element={<ProtectedRoute><QualityReport /></ProtectedRoute>} />
                <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
                <Route path="/connections" element={<ProtectedRoute><Connections /></ProtectedRoute>} />
                <Route path="/mappings" element={<ProtectedRoute><Mappings /></ProtectedRoute>} />
                <Route path="/transformations" element={<ProtectedRoute><Transformations /></ProtectedRoute>} />
                <Route path="/lineage" element={<ProtectedRoute><FileLineage /></ProtectedRoute>} />
                <Route path="/lineage/impact/:fileId" element={<ProtectedRoute><LineageImpact /></ProtectedRoute>} />
                <Route path="/monitor" element={<ProtectedRoute><Monitor /></ProtectedRoute>} />
                <Route path="/scheduler" element={<ProtectedRoute><Scheduler /></ProtectedRoute>} />
                <Route path="/badges" element={<ProtectedRoute><Badges /></ProtectedRoute>} />
                <Route path="/insights" element={<ProtectedRoute><DataInsights /></ProtectedRoute>} />
                <Route path="/recommendations" element={<ProtectedRoute><Recommendations /></ProtectedRoute>} />
                <Route path="/stories" element={<ProtectedRoute><DataStories /></ProtectedRoute>} />
                <Route path="/dashboard-settings" element={<ProtectedRoute><DashboardSettings /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
                <Route path="/roles" element={<ProtectedRoute><RoleManagement /></ProtectedRoute>} />
                {/* Business Process Management routes */}
                <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
                <Route path="/business-processes" element={<ProtectedRoute><BusinessProcesses /></ProtectedRoute>} />
                <Route path="/business-processes/:processId" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                <Route path="/jobs/:jobId" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                <Route path="/process-management-wizard" element={<ProtectedRoute><ProcessManagementWizard /></ProtectedRoute>} />
                {/* Development Routes */}
                <Route path="/hooks-demo" element={<ProtectedRoute><HooksDemo /></ProtectedRoute>} />
                <Route path="/performance-optimizations" element={<ProtectedRoute><PerformanceOptimizations /></ProtectedRoute>} />
                <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
          
          {/* AI Insights Sidebar - only show when toggled */}
          {showAIInsights && selectedFileId && (
            <div className="ai-insights-container">
              {/* Import dynamically to reduce initial load time */}
              {React.lazy(() => import('./components/AIPredictiveInsights')).render({
                fileId: selectedFileId,
                onClose: () => setShowAIInsights(false)
              })}
            </div>
          )}
        </>
      )}
      
      {/* Login route when not logged in */}
      {!currentUser && (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
      
      {/* Accessibility Widget - always show */}
      <AccessibilityWidget />
      
      {/* Onboarding Wizard - only for logged in users */}
      {currentUser && showOnboarding && (
        <OnboardingWizard onClose={() => setShowOnboarding(false)} />
      )}
      
      {/* Global Notifications */}
      <NotificationList />
    </div>
  );
}

export default App;