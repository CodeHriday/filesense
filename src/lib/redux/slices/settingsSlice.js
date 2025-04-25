/**
 * Settings Slice
 * 
 * Redux slice for managing application settings, including:
 * - User preferences
 * - Application configuration
 * - Display settings
 */
import { createSlice } from '@reduxjs/toolkit';

// Initial state
const initialState = {
  userPreferences: {
    dashboard: {
      layout: 'grid',
      visibleWidgets: ['recentFiles', 'fileStatistics', 'qualityMetrics', 'alertSummary'],
      refreshInterval: 5, // In minutes
    },
    fileView: {
      defaultView: 'table',
      showThumbnails: true,
      rowsPerPage: 20,
      showAdditionalDetails: true,
    },
    notifications: {
      emailNotifications: true,
      browserNotifications: true,
      alertNotifications: true,
      digestFrequency: 'daily',
    },
    interface: {
      sidebarCollapsed: false,
      showBreadcrumbs: true,
      showWelcomeScreens: true,
      developerMode: false,
    },
  },
  systemSettings: {
    uploadSettings: {
      maxFileSize: 100 * 1024 * 1024, // 100 MB
      allowedFileTypes: ['csv', 'json', 'parquet', 'xlsx'],
      storageLocation: 'local',
    },
    processingSettings: {
      profileSize: 'full',
      runQualityChecks: true,
      enableAutoDetection: true,
      enableAlerts: true,
    },
    integrationSettings: {
      enableCloudStorage: true,
      enableDataIntegrationTools: true,
      enableExternalDatabases: true,
    },
    securitySettings: {
      dataEncryption: true,
      auditLogging: true,
      passwordComplexity: 'medium',
      sessionTimeout: 60, // In minutes
    },
  },
  loading: false,
  error: null,
};

// Create slice
const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    // User preferences actions
    setDashboardLayout: (state, action) => {
      state.userPreferences.dashboard.layout = action.payload;
    },
    setVisibleWidgets: (state, action) => {
      state.userPreferences.dashboard.visibleWidgets = action.payload;
    },
    setDashboardRefreshInterval: (state, action) => {
      state.userPreferences.dashboard.refreshInterval = action.payload;
    },
    setDefaultFileView: (state, action) => {
      state.userPreferences.fileView.defaultView = action.payload;
    },
    toggleShowThumbnails: (state) => {
      state.userPreferences.fileView.showThumbnails = !state.userPreferences.fileView.showThumbnails;
    },
    setRowsPerPage: (state, action) => {
      state.userPreferences.fileView.rowsPerPage = action.payload;
    },
    toggleShowAdditionalDetails: (state) => {
      state.userPreferences.fileView.showAdditionalDetails = !state.userPreferences.fileView.showAdditionalDetails;
    },
    setEmailNotifications: (state, action) => {
      state.userPreferences.notifications.emailNotifications = action.payload;
    },
    setBrowserNotifications: (state, action) => {
      state.userPreferences.notifications.browserNotifications = action.payload;
    },
    setAlertNotifications: (state, action) => {
      state.userPreferences.notifications.alertNotifications = action.payload;
    },
    setDigestFrequency: (state, action) => {
      state.userPreferences.notifications.digestFrequency = action.payload;
    },
    setSidebarCollapsed: (state, action) => {
      state.userPreferences.interface.sidebarCollapsed = action.payload;
    },
    toggleShowBreadcrumbs: (state) => {
      state.userPreferences.interface.showBreadcrumbs = !state.userPreferences.interface.showBreadcrumbs;
    },
    toggleShowWelcomeScreens: (state) => {
      state.userPreferences.interface.showWelcomeScreens = !state.userPreferences.interface.showWelcomeScreens;
    },
    toggleDeveloperMode: (state) => {
      state.userPreferences.interface.developerMode = !state.userPreferences.interface.developerMode;
    },
    
    // System settings actions
    setMaxFileSize: (state, action) => {
      state.systemSettings.uploadSettings.maxFileSize = action.payload;
    },
    setAllowedFileTypes: (state, action) => {
      state.systemSettings.uploadSettings.allowedFileTypes = action.payload;
    },
    setStorageLocation: (state, action) => {
      state.systemSettings.uploadSettings.storageLocation = action.payload;
    },
    setProfileSize: (state, action) => {
      state.systemSettings.processingSettings.profileSize = action.payload;
    },
    toggleRunQualityChecks: (state) => {
      state.systemSettings.processingSettings.runQualityChecks = !state.systemSettings.processingSettings.runQualityChecks;
    },
    toggleEnableAutoDetection: (state) => {
      state.systemSettings.processingSettings.enableAutoDetection = !state.systemSettings.processingSettings.enableAutoDetection;
    },
    toggleEnableAlerts: (state) => {
      state.systemSettings.processingSettings.enableAlerts = !state.systemSettings.processingSettings.enableAlerts;
    },
    toggleEnableCloudStorage: (state) => {
      state.systemSettings.integrationSettings.enableCloudStorage = !state.systemSettings.integrationSettings.enableCloudStorage;
    },
    toggleEnableDataIntegrationTools: (state) => {
      state.systemSettings.integrationSettings.enableDataIntegrationTools = !state.systemSettings.integrationSettings.enableDataIntegrationTools;
    },
    toggleEnableExternalDatabases: (state) => {
      state.systemSettings.integrationSettings.enableExternalDatabases = !state.systemSettings.integrationSettings.enableExternalDatabases;
    },
    toggleDataEncryption: (state) => {
      state.systemSettings.securitySettings.dataEncryption = !state.systemSettings.securitySettings.dataEncryption;
    },
    toggleAuditLogging: (state) => {
      state.systemSettings.securitySettings.auditLogging = !state.systemSettings.securitySettings.auditLogging;
    },
    setPasswordComplexity: (state, action) => {
      state.systemSettings.securitySettings.passwordComplexity = action.payload;
    },
    setSessionTimeout: (state, action) => {
      state.systemSettings.securitySettings.sessionTimeout = action.payload;
    },
    
    // Set full user preferences (e.g., from loaded profile)
    setUserPreferences: (state, action) => {
      state.userPreferences = {
        ...state.userPreferences,
        ...action.payload,
      };
    },
    
    // Set full system settings (e.g., from API)
    setSystemSettings: (state, action) => {
      state.systemSettings = {
        ...state.systemSettings,
        ...action.payload,
      };
    },
    
    // Loading and error states
    setSettingsLoading: (state, action) => {
      state.loading = action.payload;
    },
    setSettingsError: (state, action) => {
      state.error = action.payload;
    },
    
    // Reset settings to defaults
    resetUserPreferences: (state) => {
      state.userPreferences = initialState.userPreferences;
    },
    resetSystemSettings: (state) => {
      state.systemSettings = initialState.systemSettings;
    },
    resetAllSettings: (state) => {
      Object.assign(state, initialState);
    },
  },
});

// Export actions
export const {
  setDashboardLayout,
  setVisibleWidgets,
  setDashboardRefreshInterval,
  setDefaultFileView,
  toggleShowThumbnails,
  setRowsPerPage,
  toggleShowAdditionalDetails,
  setEmailNotifications,
  setBrowserNotifications,
  setAlertNotifications,
  setDigestFrequency,
  setSidebarCollapsed,
  toggleShowBreadcrumbs,
  toggleShowWelcomeScreens,
  toggleDeveloperMode,
  setMaxFileSize,
  setAllowedFileTypes,
  setStorageLocation,
  setProfileSize,
  toggleRunQualityChecks,
  toggleEnableAutoDetection,
  toggleEnableAlerts,
  toggleEnableCloudStorage,
  toggleEnableDataIntegrationTools,
  toggleEnableExternalDatabases,
  toggleDataEncryption,
  toggleAuditLogging,
  setPasswordComplexity,
  setSessionTimeout,
  setUserPreferences,
  setSystemSettings,
  setSettingsLoading,
  setSettingsError,
  resetUserPreferences,
  resetSystemSettings,
  resetAllSettings,
} = settingsSlice.actions;

// Selectors
export const selectUserPreferences = (state) => state.settings.userPreferences;
export const selectSystemSettings = (state) => state.settings.systemSettings;
export const selectDashboardPreferences = (state) => state.settings.userPreferences.dashboard;
export const selectFileViewPreferences = (state) => state.settings.userPreferences.fileView;
export const selectNotificationPreferences = (state) => state.settings.userPreferences.notifications;
export const selectInterfacePreferences = (state) => state.settings.userPreferences.interface;
export const selectUploadSettings = (state) => state.settings.systemSettings.uploadSettings;
export const selectProcessingSettings = (state) => state.settings.systemSettings.processingSettings;
export const selectIntegrationSettings = (state) => state.settings.systemSettings.integrationSettings;
export const selectSecuritySettings = (state) => state.settings.systemSettings.securitySettings;
export const selectSettingsLoading = (state) => state.settings.loading;
export const selectSettingsError = (state) => state.settings.error;

export default settingsSlice.reducer;