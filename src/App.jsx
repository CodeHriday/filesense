import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { initializeAuditInterceptor } from './utils/auditInterceptor';
import PropTypes from 'prop-types';


// Loading fallback component
const LoadingFallback = () => (
  <div className="loading-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <div>Loading...</div>
  </div>
);

// External link component for BlumeETL redirect
const BlumeETLRedirect = () => {
  useEffect(() => {
    window.location.href = "https://blume-etl.example.com";
  }, []);
  return <div className="loading-screen">Redirecting to BlumeETL...</div>;
};

// Core components (loaded immediately)
import Sidebar from './components/Sidebar';
import NotificationList from './components/Notifications/NotificationList';
import AccessibilityWidget from './components/AccessibilityWidget';
import ToastContainer from './components/ToastContainer';
import Login from './pages/Login';

// Context providers (needed immediately)
import { AccessibilityProvider } from './context/AccessibilityContext';
import AuthProvider, { useAuth } from './context/AuthContext';
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { AnnouncementProvider } from './components/accessibility';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider, ModalProvider } from './hooks';
import { NotificationProvider } from './contexts/NotificationContext';
import { isVendorUser } from './utils/userHelpers';

// Lazy-loaded page components (heavy components loaded on demand)
const PerformanceOptimizations = lazy(() => import('./pages/PerformanceOptimizations'));
const ExecutiveDashboard = lazy(() => import('./pages/ExecutiveDashboard'));
const FileUpload = lazy(() => import('./pages/FileUpload'));
const FileCatalog = lazy(() => import('./pages/FileCatalog').then(m => ({ default: m.FileCatalog })));
const DataProfile = lazy(() => import('./pages/DataProfile'));
const QualityChecks = lazy(() => import('./pages/QualityChecks'));
const QualityReport = lazy(() => import('./pages/QualityReport'));
const QualityRules = lazy(() => import('./pages/QualityRules'));
const ErrorReview = lazy(() => import('./pages/ErrorReview'));
const Connections = lazy(() => import('./pages/Connections'));
const Mappings = lazy(() => import('./pages/Mappings'));
const MappingWizard = lazy(() => import('./pages/MappingWizard'));
const ETLJobDetails = lazy(() => import('./pages/ETLJobDetails'));
const Transform = lazy(() => import('./pages/Transform'));
const FileLineage = lazy(() => import('./pages/FileLineage'));
const LineageImpact = lazy(() => import('./pages/LineageImpact'));
const LineagePage = lazy(() => import('./pages/LineagePage'));
const LineageListPage = lazy(() => import('./pages/LineageListPage'));
const Monitor = lazy(() => import('./pages/Monitor'));
const Scheduler = lazy(() => import('./pages/Scheduler'));
const Badges = lazy(() => import('./pages/Badges'));
const DataStories = lazy(() => import('./pages/DataStories'));
const DashboardSettings = lazy(() => import('./pages/DashboardSettings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const AuditTrail = lazy(() => import('./pages/AuditTrail'));
const Notifications = lazy(() => import('./pages/Notifications'));
const VendorManagement = lazy(() => import('./pages/VendorManagement'));
const VendorUserManagement = lazy(() => import('./pages/VendorUserManagement'));
const VendorRoleManagement = lazy(() => import('./pages/VendorRoleManagement'));
const VendorAgreements = lazy(() => import('./pages/VendorAgreements'));
const VendorFileUpload = lazy(() => import('./pages/VendorFileUpload'));
const VendorFileQuality = lazy(() => import('./pages/VendorFileQuality'));
const SLAMonitoring = lazy(() => import('./pages/SLAMonitoring'));
const DBTTransformations = lazy(() => import('./pages/DBTTransformations'));
const HooksDemo = lazy(() => import('./pages/HooksDemo'));
const Groups = lazy(() => import('./pages/Groups'));
const BusinessProcesses = lazy(() => import('./pages/BusinessProcesses'));
const Jobs = lazy(() => import('./pages/Jobs'));
const ProcessedFileCatalog = lazy(() => import('./pages/ProcessedFileCatalog'));
const MappingGroups = lazy(() => import('./pages/MappingGroups'));
const MappingGroupForm = lazy(() => import('./pages/MappingGroupForm'));
const NStepWorkflows = lazy(() => import('./pages/NStepWorkflows'));
const ETLScheduler = lazy(() => import('./pages/ETLScheduler'));
const SchedulerForm = lazy(() => import('./pages/SchedulerForm'));
const PolicyManagement = lazy(() => import('./pages/PolicyManagement'));
const TagManagement = lazy(() => import('./pages/TagManagement'));
const ProjectManagement = lazy(() => import('./pages/ProjectManagement'));
const Projects = lazy(() => import('./pages/Projects'));
const GroupManagement = lazy(() => import('./pages/GroupManagement'));
const SystemCleanup = lazy(() => import('./pages/SystemCleanup'));
const RetentionPolicies = lazy(() => import('./pages/RetentionPolicies'));
const ArchivedFiles = lazy(() => import('./pages/ArchivedFiles'));
const Anomalies = lazy(() => import('./pages/Anomalies'));
const AlertsConfig = lazy(() => import('./pages/AlertsConfig').then(m => ({ default: m.AlertsConfig })));
const EmailProvidersConfig = lazy(() => import('./pages/EmailProvidersConfig').then(m => ({ default: m.EmailProvidersConfig })));
const AlertHistory = lazy(() => import('./pages/AlertHistory'));
const OAuth2Callback = lazy(() => import('./pages/OAuth2Callback').then(m => ({ default: m.OAuth2Callback })));
const APITokens = lazy(() => import('./pages/APITokens'));
const APIDocumentation = lazy(() => import('./pages/APIDocumentation'));
const FailedJobs = lazy(() => import('./pages/FailedJobs'));
const WorkflowCanvasStandalone = lazy(() => import('./pages/WorkflowCanvasStandalone'));
const WorkflowTest = lazy(() => import('./pages/WorkflowTest'));
const WorkflowBuilder = lazy(() => import('./pages/archived/WorkflowBuilder'));
const WorkflowManager = lazy(() => import('./pages/WorkflowManager'));
const VisualMappingCanvas = lazy(() => import('./pages/VisualMappingCanvas'));
const VisualMappingManager = lazy(() => import('./pages/VisualMappingManager'));
const Documentation = lazy(() => import('./pages/Documentation'));

// Styles
import './App.css';
import './styles/accessibility.css';
import './styles/Login.css';
import './styles/UserManagement.css';
import './styles/RoleManagement.css';
import './styles/AIPredictiveInsights.css';
import './styles/Groups.css';
import './styles/BusinessProcesses.css';
import './styles/Jobs.css';
import './styles/Transformations.css';
import './styles/ETLOrchestration.css';
import './styles/global-page-styles.css';

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
ProtectedRoute.propTypes = {
  children: PropTypes.oneOfType([
    PropTypes.node,
    PropTypes.func
  ]).isRequired
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
              <Suspense fallback={<LoadingFallback />}>
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
                <Route path="/visual-lineage" element={<ProtectedRoute><LineageListPage /></ProtectedRoute>} />
                <Route path="/visual-lineage/new" element={<ProtectedRoute><LineagePage /></ProtectedRoute>} />
                <Route path="/visual-lineage/:graphId" element={<ProtectedRoute><LineagePage /></ProtectedRoute>} />
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
                <Route path="/visual-mappings/new" element={<ProtectedRoute><VisualMappingCanvas /></ProtectedRoute>} />
                <Route path="/visual-mappings/:mappingId" element={<ProtectedRoute><VisualMappingCanvas /></ProtectedRoute>} />
                <Route path="/visual-mappings/manage" element={<ProtectedRoute><VisualMappingManager /></ProtectedRoute>} />
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
                <Route path="/documentation" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
                <Route path="/help" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
                {/* Development Routes */}
                <Route path="/hooks-demo" element={<ProtectedRoute><HooksDemo /></ProtectedRoute>} />
                <Route path="/performance-optimizations" element={<ProtectedRoute><PerformanceOptimizations /></ProtectedRoute>} />
                <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
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
AppContent.propTypes = {
  showOnboarding: PropTypes.bool.isRequired,
  setShowOnboarding: PropTypes.func.isRequired
};

export default App;