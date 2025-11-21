import React, { useState, useEffect } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { API_BASE_URL } from '../config';
import './ExecutiveDashboard.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
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
    return (
      <div className="executive-dashboard">
        <div className="loading-state">Loading executive metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="executive-dashboard">
        <div className="error-state">Error: {error}</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="executive-dashboard">
        <div className="loading-state">No metrics available</div>
      </div>
    );
  }

  // Chart Data & Options
  const throughputChartData = {
    labels: metrics.throughputTrend?.sparkline?.map((_, i) => `Day ${i + 1}`) || [],
    datasets: [
      {
        label: 'Files Processed',
        data: metrics.throughputTrend?.sparkline || [],
        backgroundColor: '#2ECC71',
        borderRadius: 8,
        maxBarThickness: 16
      }
    ]
  };

  const throughputChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#1F2937',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        displayColors: false
      }
    },
    scales: {
      x: { display: false },
      y: {
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { color: '#6B7280', font: { size: 12 } }
      }
    }
  };

  const qualityChartData = {
    labels: ['Excellent (90-100%)', 'Good (75-89%)', 'Fair (50-74%)', 'Poor (<50%)'],
    datasets: [{
      data: [45, 30, 20, 5],
      backgroundColor: ['#2ECC71', '#4C6EF5', '#FF9F43', '#EF4444'],
      borderWidth: 0
    }]
  };

  const qualityChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
          font: { size: 14, family: "'Inter', sans-serif" },
          color: '#374151'
        }
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#1F2937',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12
      }
    }
  };

  const getTrendIcon = (sparkline) => {
    if (!sparkline || sparkline.length < 2) return null;
    return sparkline[sparkline.length - 1] > sparkline[0] ? '↑' : '↓';
  };

  const getTrendClass = (sparkline) => {
    if (!sparkline || sparkline.length < 2) return '';
    return sparkline[sparkline.length - 1] > sparkline[0] ? 'trend-up' : 'trend-down';
  };

  const getStatusClass = (status) => `status-${status}`;

  return (
    <div className="executive-dashboard">
      <div className="dashboard-header">
        <h1>Executive Dashboard</h1>
      </div>

      <div className="kpi-cards">
        <div className="kpi-card">
          <div className="kpi-label">Total Files</div>
          <div className="kpi-value">{(metrics.totalFiles || 0).toLocaleString()}</div>
          <div className={`kpi-trend ${getTrendClass(metrics.throughputTrend?.sparkline)}`}>
            {getTrendIcon(metrics.throughputTrend?.sparkline)} 
            {metrics.throughputTrend?.currentPeriodCount || 0} this month
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Avg Quality Score</div>
          <div className="kpi-value">{metrics.avgQualityScore?.toFixed(1) || 0}%</div>
          <div className={`kpi-trend ${getStatusClass(metrics.jobSuccessRate?.status)}`}>
            {metrics.jobSuccessRate?.rate || 0}% job success
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Vendor Compliance</div>
          <div className="kpi-value">{metrics.vendorCompliance?.rate || 0}%</div>
          <div className={`kpi-trend ${getStatusClass(metrics.vendorCompliance?.status)}`}>
            {metrics.vendorCompliance?.compliantVendors || 0}/{metrics.vendorCompliance?.totalVendors || 0} compliant
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Governance Coverage</div>
          <div className="kpi-value">{metrics.governanceCoverage?.rate || 0}%</div>
          <div className={`kpi-trend ${getStatusClass(metrics.governanceCoverage?.status)}`}>
            {(metrics.governanceCoverage?.taggedFiles || 0).toLocaleString()} files tagged
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Critical Alerts</div>
          <div className="kpi-value">{metrics.criticalAlerts?.count || 0}</div>
          <div className={`kpi-trend ${getStatusClass(metrics.criticalAlerts?.status)}`}>
            {metrics.highRiskPII?.count || 0} high-risk PII
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3>File Processing Trend (Last 30 Days)</h3>
          </div>
          <div className="chart-container">
            <Bar data={throughputChartData} options={throughputChartOptions} />
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Quality Score Distribution</h3>
          </div>
          <div className="chart-container donut">
            <Doughnut data={qualityChartData} options={qualityChartOptions} />
          </div>
        </div>
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-header">
            <h3>API Usage</h3>
          </div>
          <div className="stat-content">
            <div className="stat-row">
              <span className="stat-label">Active Tokens</span>
              <span className="stat-value">{metrics.apiUsage?.activeTokens || 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Total Requests</span>
              <span className="stat-value">{(metrics.apiUsage?.totalRequests || 0).toLocaleString()}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Requests/Token</span>
              <span className="stat-value">{metrics.apiUsage?.avgRequestsPerToken || 0}</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>System Health</h3>
          </div>
          <div className="stat-content">
            <div className="stat-row">
              <span className="stat-label">Job Success Rate</span>
              <span className={`stat-value ${getStatusClass(metrics.jobSuccessRate?.status)}`}>
                {metrics.jobSuccessRate?.rate || 0}%
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Completed Jobs</span>
              <span className="stat-value">{(metrics.jobSuccessRate?.completedJobs || 0).toLocaleString()}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Failed Jobs</span>
              <span className="stat-value status-critical">{metrics.jobSuccessRate?.failedJobs || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
