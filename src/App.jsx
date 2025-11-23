import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { initializeAuditInterceptor } from './utils/auditInterceptor';

// External link component for BlumeETL redirect
const BlumeETLRedirect = () => {
  useEffect(() => {
    window.location.href = "https://blume-etl.example.com";
  }, []);
  return <div className="loading-screen">Redirecting to BlumeETL...</div>;
};
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import NotificationList from './components/Notifications/NotificationList';
import PerformanceOptimizations from './pages/PerformanceOptimizations';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import FileUpload from './pages/FileUpload';
import { FileCatalog } from './pages/FileCatalog';
import DataProfile from './pages/DataProfile';
import QualityChecks from './pages/QualityChecks';
import QualityReport from './pages/QualityReport';
import QualityRules from './pages/QualityRules';
import ErrorReview from './pages/ErrorReview';
import Connections from './pages/Connections';
import Mappings from './pages/Mappings';
import MappingWizard from './pages/MappingWizard';
import ETLJobDetails from './pages/ETLJobDetails';
import Transform from './pages/Transform';
import FileLineage from './pages/FileLineage';
import LineageImpact from './pages/LineageImpact';
import LineagePage from './pages/LineagePage';
import Monitor from './pages/Monitor';
import Scheduler from './pages/Scheduler';
import Badges from './pages/Badges';
import DataInsights from './pages/DataInsights';
import FileInsights from './pages/FileInsights';
import Recommendations from './pages/Recommendations';
import DataStories from './pages/DataStories';
import DashboardSettings from './pages/DashboardSettings';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import AuditTrail from './pages/AuditTrail';
import Notifications from './pages/Notifications';
import VendorManagement from './pages/VendorManagement';
import VendorUserManagement from './pages/VendorUserManagement';
import VendorRoleManagement from './pages/VendorRoleManagement';
import VendorAgreements from './pages/VendorAgreements';
import VendorFileUpload from './pages/VendorFileUpload';
import VendorFileQuality from './pages/VendorFileQuality';
import SLAMonitoring from './pages/SLAMonitoring';
import DBTTransformations from './pages/DBTTransformations';
import HooksDemo from './pages/HooksDemo';
// Business Process Management imports
import Groups from './pages/Groups';
import BusinessProcesses from './pages/BusinessProcesses';
import Jobs from './pages/Jobs';
import ProcessedFileCatalog from './pages/ProcessedFileCatalog';
// ProcessManagementWizard removed
// ETL Orchestration imports
import MappingGroups from './pages/MappingGroups';
import MappingGroupForm from './pages/MappingGroupForm';
import NStepWorkflows from './pages/NStepWorkflows';
import ETLScheduler from './pages/ETLScheduler';
import SchedulerForm from './pages/SchedulerForm';
import PolicyManagement from './pages/PolicyManagement';
import TagManagement from './pages/TagManagement';
import ProjectManagement from './pages/ProjectManagement';
import Projects from './pages/Projects';
import GroupManagement from './pages/GroupManagement';
import SystemCleanup from './pages/SystemCleanup';
import RetentionPolicies from './pages/RetentionPolicies';
import ArchivedFiles from './pages/ArchivedFiles';
import Anomalies from './pages/Anomalies';
import { AlertsConfig } from './pages/AlertsConfig';
import { EmailProvidersConfig } from './pages/EmailProvidersConfig';
import AlertHistory from './pages/AlertHistory';
import { OAuth2Callback } from './pages/OAuth2Callback';
import APITokens from './pages/APITokens';
import APIDocumentation from './pages/APIDocumentation';
import FailedJobs from './pages/FailedJobs';
import WorkflowCanvas from './pages/WorkflowCanvas';
import WorkflowCanvasFixed from './pages/WorkflowCanvasFixed';
import WorkflowCanvasStandalone from './pages/WorkflowCanvasStandalone';
import WorkflowTest from './pages/WorkflowTest';
import WorkflowBuilder from './pages/WorkflowBuilder';
import WorkflowManager from './pages/WorkflowManager';
import OnboardingWizard from './components/OnboardingWizard';
import AccessibilityWidget from './components/AccessibilityWidget';
import { AccessibilityProvider } from './context/AccessibilityContext';
import AuthProvider, { useAuth } from './context/AuthContext';
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { AnnouncementProvider } from './components/accessibility';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider, ModalProvider } from './hooks';
import { NotificationProvider } from './contexts/NotificationContext';
import ToastContainer from './components/ToastContainer';
import { isVendorUser } from './utils/userHelpers';
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
// ProcessManagementWizard styles removed
import './styles/Transformations.css';
import './styles/ETLOrchestration.css';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const location = window.location.pathname;
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  // Extract route parameters to pass to children if it's a function
  // This handles routes like /profile/:fileId
  if (typeof children === 'function') {
    // Extract fileId from the path based on various possible route patterns
    let fileId = null;
    const profileMatch = location.match(/\/profile\/([^\/]+)/);
    const qualityMatch = location.match(/\/quality\/([^\/]+)/);
    const reportMatch = location.match(/\/report\/([^\/]+)/);
    const lineageMatch = location.match(/\/lineage\/impact\/([^\/]+)/);
    
    if (profileMatch) fileId = profileMatch[1];
    else if (qualityMatch) fileId = qualityMatch[1];
    else if (reportMatch) fileId = reportMatch[1];
    else if (lineageMatch) fileId = lineageMatch[1];
    
    // Also validate fileId format is reasonable (not "undefined" as string)
    if (fileId === 'undefined') fileId = null;
    
    return children({ fileId });
  }
  
  return children;
};

// Component to redirect vendor users to vendor file upload page, others to executive dashboard
const DashboardOrRedirect = () => {
  const { currentUser } = useAuth();
  
  // Redirect vendor users to the vendor file upload page
  if (isVendorUser(currentUser)) {
    return <Navigate to="/vendor-file-upload" replace />;
  }
  
  // Show executive dashboard for all other users
  return <ExecutiveDashboard />;
};

// Component to block vendor users from accessing regular file upload
const FileUploadOrRedirect = () => {
  const { currentUser } = useAuth();
  
  // Redirect vendor users away from regular file upload
  if (isVendorUser(currentUser)) {
    return <Navigate to="/vendor-file-upload" replace />;
  }
  
  // Show regular file upload for non-vendor users
  return <FileUpload />;
};

function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  useEffect(() => {
    initializeAuditInterceptor();
  }, []);
  
  return (
    <ErrorBoundary componentName="App">
      <AccessibilityProvider>
        <AuthProvider>
          <SidebarProvider>
            <AnnouncementProvider>
              <NotificationProvider>
                <ToastProvider>
                  <NotificationsProvider>
                    <ModalProvider>
                      <Router>
                        <AppContent showOnboarding={showOnboarding} setShowOnboarding={setShowOnboarding} />
                      </Router>
                    </ModalProvider>
                  </NotificationsProvider>
                </ToastProvider>
              </NotificationProvider>
            </AnnouncementProvider>
          </SidebarProvider>
        </AuthProvider>
      </AccessibilityProvider>
    </ErrorBoundary>
  );
}

// Separate component to use useAuth() hook inside Router context
function AppContent({ showOnboarding, setShowOnboarding }) {
  const { currentUser } = useAuth();
  const { isCollapsed } = useSidebar();
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
      
      {/* Show sidebar only if logged in */}
      {currentUser && (
        <>
          <div className="main-container">
            <Sidebar />
            <main id="main-content" className={`content ${isCollapsed ? 'sidebar-collapsed' : ''} full-width`} tabIndex="-1">
              <Routes>
                <Route path="/" element={<ProtectedRoute><DashboardOrRedirect /></ProtectedRoute>} />
                <Route path="/executive-dashboard" element={<ProtectedRoute><ExecutiveDashboard /></ProtectedRoute>} />
                <Route path="/upload" element={<ProtectedRoute><FileUploadOrRedirect /></ProtectedRoute>} />
                <Route path="/drop" element={<ProtectedRoute><FileUploadOrRedirect /></ProtectedRoute>} />
                <Route path="/file-catalog" element={<ProtectedRoute><FileCatalog /></ProtectedRoute>} />
                <Route path="/profile/:fileId" element={<ProtectedRoute>
                  {({ fileId }) => {
                    // Only render DataProfile if fileId exists
                    return fileId ? (
                      <DataProfile showAIInsights={toggleAIInsights} />
                    ) : (
                      <Navigate to="/catalog" replace />
                    );
                  }}
                </ProtectedRoute>} />
                <Route path="/quality/:fileId" element={<ProtectedRoute>
                  {({ fileId }) => {
                    return fileId ? (
                      <QualityChecks showAIInsights={toggleAIInsights} />
                    ) : (
                      <Navigate to="/catalog" replace />
                    );
                  }}
                </ProtectedRoute>} />
                <Route path="/report/:fileId" element={<ProtectedRoute>
                  {({ fileId }) => {
                    return fileId ? (
                      <QualityReport />
                    ) : (
                      <Navigate to="/catalog" replace />
                    );
                  }}
                </ProtectedRoute>} />
                <Route path="/quality-rules" element={<ProtectedRoute><QualityRules /></ProtectedRoute>} />
                <Route path="/alerts" element={<Navigate to="/quality-rules" replace />} />
                <Route path="/error-review" element={<ProtectedRoute><ErrorReview /></ProtectedRoute>} />
                <Route path="/connections" element={<ProtectedRoute><Connections /></ProtectedRoute>} />
                <Route path="/mappings" element={<ProtectedRoute><Mappings /></ProtectedRoute>} />
                <Route path="/mappings/create" element={<ProtectedRoute><MappingWizard /></ProtectedRoute>} />
                <Route path="/mappings/edit/:mappingId" element={<ProtectedRoute><MappingWizard /></ProtectedRoute>} />
                <Route path="/transformations" element={<ProtectedRoute><Transform /></ProtectedRoute>} />
                <Route path="/transform" element={<ProtectedRoute><Transform /></ProtectedRoute>} />
                <Route path="/lineage" element={<ProtectedRoute><FileLineage /></ProtectedRoute>} />
                <Route path="/visual-lineage" element={<ProtectedRoute><LineagePage /></ProtectedRoute>} />
                <Route path="/lineage/impact/:fileId" element={<ProtectedRoute>
                  {({ fileId }) => {
                    return fileId ? (
                      <LineageImpact />
                    ) : (
                      <Navigate to="/lineage" replace />
                    );
                  }}
                </ProtectedRoute>} />
                <Route path="/monitor" element={<ProtectedRoute><Monitor /></ProtectedRoute>} />
                <Route path="/scheduler" element={<ProtectedRoute><Scheduler /></ProtectedRoute>} />
                <Route path="/badges" element={<ProtectedRoute><Badges /></ProtectedRoute>} />
                <Route path="/insights" element={<ProtectedRoute><DataInsights /></ProtectedRoute>} />
                <Route path="/file-insights" element={<ProtectedRoute><FileInsights /></ProtectedRoute>} />
                <Route path="/recommendations" element={<ProtectedRoute><Recommendations /></ProtectedRoute>} />
                <Route path="/stories" element={<ProtectedRoute><DataStories /></ProtectedRoute>} />
                <Route path="/dashboard-settings" element={<ProtectedRoute><DashboardSettings /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
                <Route path="/roles" element={<ProtectedRoute><RoleManagement /></ProtectedRoute>} />
                <Route path="/audit-trail" element={<ProtectedRoute><AuditTrail /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/vendor-management" element={<ProtectedRoute><VendorManagement /></ProtectedRoute>} />
                <Route path="/vendors" element={<ProtectedRoute><VendorManagement /></ProtectedRoute>} />
                <Route path="/vendor-users" element={<ProtectedRoute><VendorUserManagement /></ProtectedRoute>} />
                <Route path="/vendor-roles" element={<ProtectedRoute><VendorRoleManagement /></ProtectedRoute>} />
                <Route path="/vendor-agreements" element={<ProtectedRoute><VendorAgreements /></ProtectedRoute>} />
                <Route path="/vendor-file-upload" element={<ProtectedRoute><VendorFileUpload /></ProtectedRoute>} />
                <Route path="/vendor-file-quality" element={<ProtectedRoute><VendorFileQuality /></ProtectedRoute>} />
                <Route path="/sla-monitoring" element={<ProtectedRoute><SLAMonitoring /></ProtectedRoute>} />
                <Route path="/dbt-transformations" element={<ProtectedRoute><DBTTransformations /></ProtectedRoute>} />
                <Route path="/failed-jobs" element={<ProtectedRoute><FailedJobs /></ProtectedRoute>} />
                {/* Business Process Management routes */}
                <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
                <Route path="/business-processes" element={<ProtectedRoute><BusinessProcesses /></ProtectedRoute>} />
                <Route path="/business-processes/:processId" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                <Route path="/jobs/:jobId" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                <Route path="/etl-jobs/:jobId" element={<ProtectedRoute><ETLJobDetails /></ProtectedRoute>} />
                <Route path="/transformation-catalog" element={<ProtectedRoute><ProcessedFileCatalog /></ProtectedRoute>} />
                <Route path="/processed-catalog" element={<ProtectedRoute><ProcessedFileCatalog /></ProtectedRoute>} />
                {/* ProcessManagementWizard route removed */}
                {/* ETL Orchestration routes */}
                <Route path="/mapping-groups" element={<ProtectedRoute><MappingGroups /></ProtectedRoute>} />
                <Route path="/mapping-groups/create" element={<ProtectedRoute><MappingGroupForm /></ProtectedRoute>} />
                <Route path="/mapping-groups/:groupId/edit" element={<ProtectedRoute><MappingGroupForm /></ProtectedRoute>} />
                <Route path="/workflows" element={<ProtectedRoute><NStepWorkflows /></ProtectedRoute>} />
                <Route path="/workflow-builder" element={<ProtectedRoute><WorkflowBuilder /></ProtectedRoute>} />
                <Route path="/workflow-manager" element={<ProtectedRoute><WorkflowManager /></ProtectedRoute>} />
                <Route path="/etl-scheduler" element={<ProtectedRoute><ETLScheduler /></ProtectedRoute>} />
                <Route path="/etl-scheduler/create" element={<ProtectedRoute><SchedulerForm /></ProtectedRoute>} />
                <Route path="/etl-scheduler/:scheduleId/edit" element={<ProtectedRoute><SchedulerForm /></ProtectedRoute>} />
                {/* Data Governance & RBAC routes */}
                <Route path="/policy-management" element={<ProtectedRoute><PolicyManagement /></ProtectedRoute>} />
                <Route path="/retention-policies" element={<ProtectedRoute><RetentionPolicies /></ProtectedRoute>} />
                <Route path="/archived-files" element={<ProtectedRoute><ArchivedFiles /></ProtectedRoute>} />
                <Route path="/anomalies" element={<ProtectedRoute><Anomalies /></ProtectedRoute>} />
                <Route path="/tag-management" element={<ProtectedRoute><TagManagement /></ProtectedRoute>} />
                <Route path="/api-tokens" element={<ProtectedRoute><APITokens /></ProtectedRoute>} />
                <Route path="/api-documentation" element={<ProtectedRoute><APIDocumentation /></ProtectedRoute>} />
                <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
                <Route path="/project-management" element={<ProtectedRoute><ProjectManagement /></ProtectedRoute>} />
                <Route path="/group-management" element={<ProtectedRoute><GroupManagement /></ProtectedRoute>} />
                <Route path="/system-cleanup" element={<ProtectedRoute><SystemCleanup /></ProtectedRoute>} />
                <Route path="/alerts-config" element={<ProtectedRoute><AlertsConfig /></ProtectedRoute>} />
                <Route path="/alert-history" element={<ProtectedRoute><AlertHistory /></ProtectedRoute>} />
                <Route path="/email-providers" element={<ProtectedRoute><EmailProvidersConfig /></ProtectedRoute>} />
                <Route path="/oauth2-callback" element={<OAuth2Callback />} />
                <Route path="/workflow-canvas" element={<ProtectedRoute><WorkflowCanvasStandalone /></ProtectedRoute>} />
                <Route path="/workflow-test" element={<ProtectedRoute><WorkflowTest /></ProtectedRoute>} />
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
      
      {/* Onboarding Wizard removed - no longer displayed */}
      
      {/* Global Notifications */}
      <NotificationList />
      
      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}

export default App;