import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { API_BASE_URL } from '../config';
import HeroKPICard from '../components/HeroKPICard';
import { COLORS, PILLAR_GRADIENTS } from '../config/colors';
import LoadingSpinner from '../components/LoadingSpinner';
import PageLayout from '../components/PageLayout';
import { FiRefreshCw } from 'react-icons/fi';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ExecutiveDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [timeRange, setTimeRange] = useState(30);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchExecutiveMetrics = async (showLoading = true) => {
    try {
      setError(null);
      if (showLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/executive-metrics?days=${timeRange}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setMetrics(response.data.metrics);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Error fetching executive metrics:', err);
      setError(err.response?.data?.error || 'Failed to load metrics. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExecutiveMetrics();
  }, [timeRange]);

  const handleRefresh = () => {
    fetchExecutiveMetrics(false);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <PageLayout
        title="Executive Dashboard"
        subtitle="Strategic KPIs across 4 pillars: Data Health, Pipeline Reliability, Governance, and Automation"
      >
        <div className="flex items-center justify-center py-12">
          <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
            <div className="text-red-600 text-5xl mb-4">⚠</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Dashboard</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => fetchExecutiveMetrics()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!metrics) {
    return (
      <PageLayout
        title="Executive Dashboard"
        subtitle="Strategic KPIs across 4 pillars: Data Health, Pipeline Reliability, Governance, and Automation"
      >
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-gray-600 mb-4">No metrics available</p>
            <button
              onClick={() => fetchExecutiveMetrics()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Executive Dashboard"
      subtitle="Strategic KPIs across 4 pillars: Data Health, Pipeline Reliability, Governance, and Automation"
      headerActions={
        <div className="flex items-center gap-4">
          <div className="flex bg-white rounded-lg shadow-sm">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  timeRange === days
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                } ${days === 7 ? 'rounded-l-lg' : days === 90 ? 'rounded-r-lg' : ''}`}
              >
                {days}d
              </button>
            ))}
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <HeroKPICard
            title="Data Health Index"
            value={metrics?.dataHealth?.index || 0}
            unit="%"
            delta={metrics?.dataHealth?.delta || 0}
            trend={metrics?.dataHealth?.trend || 'neutral'}
            status={metrics?.dataHealth?.status || 'unknown'}
            sparklineData={metrics?.dataHealth?.sparkline || []}
            pillarGradient={PILLAR_GRADIENTS.dataHealth}
            isPercentage={true}
            delay={0}
          />

          <HeroKPICard
            title="File Throughput"
            value={metrics?.fileThroughput?.count || 0}
            unit=" files"
            delta={metrics?.fileThroughput?.delta || 0}
            trend={metrics?.fileThroughput?.trend || 'neutral'}
            status="good"
            sparklineData={metrics?.fileThroughput?.sparkline || []}
            pillarGradient={PILLAR_GRADIENTS.pipelineReliability}
            isPercentage={false}
            delay={0.1}
          />

          <HeroKPICard
            title="ETL Job Success Rate"
            value={metrics?.jobSuccessRate?.rate || 0}
            unit="%"
            delta={metrics?.jobSuccessRate?.completedJobs > 0 ? parseFloat((metrics.jobSuccessRate.completedJobs / metrics.jobSuccessRate.totalJobs * 100 - 100).toFixed(1)) : 0}
            trend={metrics?.jobSuccessRate?.failedJobs === 0 ? 'up' : metrics?.jobSuccessRate?.completedJobs > metrics?.jobSuccessRate?.failedJobs ? 'up' : 'down'}
            status={metrics?.jobSuccessRate?.status || 'unknown'}
            sparklineData={[]}
            pillarGradient={PILLAR_GRADIENTS.pipelineReliability}
            isPercentage={true}
            delay={0.2}
          />

          <HeroKPICard
            title="Critical Alerts"
            value={metrics?.criticalAlerts?.count || 0}
            unit=""
            delta={null}
            trend="down"
            status={metrics?.criticalAlerts?.status || 'unknown'}
            sparklineData={[]}
            pillarGradient={PILLAR_GRADIENTS.governance}
            isPercentage={false}
            delay={0.3}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            className="bg-white rounded-lg shadow-md p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Governance & Compliance
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">High-Risk PII Exposure</p>
                <p className="text-3xl font-bold" style={{ 
                  color: metrics?.highRiskPII?.status === 'excellent' ? COLORS.success : 
                         metrics?.highRiskPII?.status === 'warning' ? COLORS.warning : COLORS.danger 
                }}>
                  {metrics?.highRiskPII?.count || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">files</p>
              </div>

              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Governance Coverage</p>
                <p className="text-3xl font-bold" style={{ 
                  color: metrics?.governanceCoverage?.status === 'excellent' ? COLORS.success : 
                         metrics?.governanceCoverage?.status === 'good' ? COLORS.primary :
                         metrics?.governanceCoverage?.status === 'warning' ? COLORS.warning : COLORS.danger 
                }}>
                  {metrics?.governanceCoverage?.rate || 0}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics?.governanceCoverage?.taggedFiles || 0} / {metrics?.governanceCoverage?.totalFiles || 0} files
                </p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Vendor SLA Compliance</p>
                <p className="text-3xl font-bold" style={{ 
                  color: metrics?.vendorCompliance?.status === 'excellent' ? COLORS.success : 
                         metrics?.vendorCompliance?.status === 'good' ? COLORS.primary :
                         metrics?.vendorCompliance?.status === 'warning' ? COLORS.warning : COLORS.danger 
                }}>
                  {metrics?.vendorCompliance?.rate || 0}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics?.vendorCompliance?.compliantVendors || 0} / {metrics?.vendorCompliance?.totalVendors || 0} vendors
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="bg-white rounded-lg shadow-md p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Adoption & Automation
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Active API Tokens</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.primary }}>
                  {metrics?.apiUsage?.activeTokens || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">tokens</p>
              </div>

              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">API Requests</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.primary }}>
                  {(metrics?.apiUsage?.totalRequests || 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics?.apiUsage?.avgRequestsPerToken || 0} avg/token
                </p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Pipeline Performance</p>
                <p className="text-3xl font-bold" style={{ 
                  color: metrics?.jobSuccessRate?.status === 'excellent' ? COLORS.success : 
                         metrics?.jobSuccessRate?.status === 'good' ? COLORS.primary :
                         metrics?.jobSuccessRate?.status === 'warning' ? COLORS.warning : COLORS.danger 
                }}>
                  {metrics?.jobSuccessRate?.completedJobs || 0} / {metrics?.jobSuccessRate?.totalJobs || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">jobs completed</p>
              </div>
            </div>
          </motion.div>
        </div>

      <footer className="text-center text-sm text-gray-500 mt-8">
        <p>
          Last updated: {lastUpdate.toLocaleString()} • 
          Time Range: Last {timeRange} days • 
          <a href="/dashboard" className="text-blue-600 hover:underline ml-2">
            View Detailed Reports
          </a>
        </p>
      </footer>
    </PageLayout>
  );
};

export default ExecutiveDashboard;
