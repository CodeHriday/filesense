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
import { FiBriefcase, FiDatabase, FiCalendar, FiPlay, FiAlertTriangle } from 'react-icons/fi';
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
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('all');
  const [timeRange, setTimeRange] = useState(30);
  const [assetStats, setAssetStats] = useState(null);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data.projects || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const fetchAssetStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setAssetStats(response.data.metrics);
      }
    } catch (err) {
      console.error('Error fetching asset stats:', err);
    }
  };

  const fetchExecutiveMetrics = async () => {
    try {
      setError(null);
      setLoading(true);

      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/executive-metrics?days=${timeRange}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setMetrics(response.data.metrics);
      }
    } catch (err) {
      console.error('Error fetching executive metrics:', err);
      setError(err.response?.data?.error || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchAssetStats();
    fetchExecutiveMetrics();
  }, [timeRange]);

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

  // Filter project health scores if specific project selected
  const filteredProjectHealth = selectedProject === 'all' 
    ? metrics.projectHealthScores || []
    : (metrics.projectHealthScores || []).filter(p => p.projectId === parseInt(selectedProject));

  // Project Health Scores Chart
  const projectHealthData = {
    labels: filteredProjectHealth.map(p => p.projectName),
    datasets: [{
      label: 'Health Score',
      data: filteredProjectHealth.map(p => p.healthScore),
      backgroundColor: filteredProjectHealth.map(p => {
        if (p.healthScore >= 80) return '#025043';
        if (p.healthScore >= 60) return '#FFA500';
        return '#EF4444';
      }),
      borderRadius: 8,
      maxBarThickness: 60
    }]
  };

  const projectHealthOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#1F2937',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => `Health Score: ${context.parsed.x.toFixed(1)}%`
        }
      }
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        grid: { color: '#E5E7EB' },
        ticks: { color: '#6B7280', font: { size: 12, family: 'Inter' } }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#374151', font: { size: 12, family: 'Inter', weight: 500 } }
      }
    }
  };

  // File Type Distribution Chart
  const fileTypeData = {
    labels: (metrics.fileTypeDistribution || []).map(ft => ft.fileType.toUpperCase()),
    datasets: [{
      data: (metrics.fileTypeDistribution || []).map(ft => ft.count),
      backgroundColor: [
        '#025043', // teal
        '#4C6EF5', // blue
        '#FFA500', // orange
        '#2ECC71', // green
        '#9B59B6', // purple
        '#F39C12', // yellow
        '#E74C3C', // red
        '#1ABC9C'  // turquoise
      ],
      borderWidth: 0
    }]
  };

  const fileTypeOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
          font: { size: 12, family: 'Inter' },
          color: '#374151',
          generateLabels: (chart) => {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label, i) => {
                const value = data.datasets[0].data[i];
                const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(0) : 0;
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
          }
        }
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#1F2937',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${value} files (${percentage}%)`;
          }
        }
      }
    }
  };

  // Health Dimensions Data
  const healthDimensions = metrics.overallHealth?.dimensions || {};
  const overallScore = metrics.overallHealth?.score || 0;

  const getHealthColor = (score) => {
    if (score >= 80) return '#025043';
    if (score >= 60) return '#FFA500';
    return '#EF4444';
  };

  const getHealthStatus = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  return (
    <div className="executive-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Executive Dashboard</h1>
          <div className="header-controls">
            <select 
              className="project-selector"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="all">All Projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select 
              className="time-range-selector"
              value={timeRange}
              onChange={(e) => setTimeRange(parseInt(e.target.value))}
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Asset Stats KPI Cards */}
      <div className="asset-stats">
        <div className="stat-card-compact">
          <FiBriefcase className="stat-icon" />
          <div className="stat-info">
            <div className="stat-label">Projects</div>
            <div className="stat-value">{assetStats?.projects || 0}</div>
          </div>
        </div>
        <div className="stat-card-compact">
          <FiDatabase className="stat-icon" />
          <div className="stat-info">
            <div className="stat-label">Files</div>
            <div className="stat-value">{assetStats?.files || 0}</div>
          </div>
        </div>
        <div className="stat-card-compact">
          <FiCalendar className="stat-icon" />
          <div className="stat-info">
            <div className="stat-label">Schedules</div>
            <div className="stat-value">{assetStats?.schedules || 0}</div>
          </div>
        </div>
        <div className="stat-card-compact">
          <FiPlay className="stat-icon" />
          <div className="stat-info">
            <div className="stat-label">Jobs</div>
            <div className="stat-value">{assetStats?.jobs || 0}</div>
          </div>
        </div>
        <div className="stat-card-compact">
          <FiAlertTriangle className="stat-icon" />
          <div className="stat-info">
            <div className="stat-label">Anomalies</div>
            <div className="stat-value">{assetStats?.anomalies || 0}</div>
          </div>
        </div>
      </div>

      {/* Data Health Metrics */}
      <div className="health-metrics-section">
        <h2>Data Health Metrics</h2>
        <div className="health-gauges">
          <div className="health-gauge">
            <div className="gauge-label">Completeness</div>
            <div className="gauge-value" style={{ color: getHealthColor(healthDimensions.completeness) }}>
              {healthDimensions.completeness?.toFixed(0) || 100}%
            </div>
            <div className="gauge-bar">
              <div 
                className="gauge-fill" 
                style={{ 
                  width: `${healthDimensions.completeness || 100}%`,
                  backgroundColor: getHealthColor(healthDimensions.completeness)
                }}
              />
            </div>
          </div>
          <div className="health-gauge">
            <div className="gauge-label">Consistency</div>
            <div className="gauge-value" style={{ color: getHealthColor(healthDimensions.consistency) }}>
              {healthDimensions.consistency?.toFixed(0) || 100}%
            </div>
            <div className="gauge-bar">
              <div 
                className="gauge-fill" 
                style={{ 
                  width: `${healthDimensions.consistency || 100}%`,
                  backgroundColor: getHealthColor(healthDimensions.consistency)
                }}
              />
            </div>
          </div>
          <div className="health-gauge">
            <div className="gauge-label">Accuracy</div>
            <div className="gauge-value" style={{ color: getHealthColor(healthDimensions.accuracy) }}>
              {healthDimensions.accuracy?.toFixed(0) || 100}%
            </div>
            <div className="gauge-bar">
              <div 
                className="gauge-fill" 
                style={{ 
                  width: `${healthDimensions.accuracy || 100}%`,
                  backgroundColor: getHealthColor(healthDimensions.accuracy)
                }}
              />
            </div>
          </div>
          <div className="health-gauge">
            <div className="gauge-label">Validity</div>
            <div className="gauge-value" style={{ color: getHealthColor(healthDimensions.validity) }}>
              {healthDimensions.validity?.toFixed(0) || 95}%
            </div>
            <div className="gauge-bar">
              <div 
                className="gauge-fill" 
                style={{ 
                  width: `${healthDimensions.validity || 95}%`,
                  backgroundColor: getHealthColor(healthDimensions.validity)
                }}
              />
            </div>
          </div>
          <div className="health-gauge">
            <div className="gauge-label">Timeliness</div>
            <div className="gauge-value" style={{ color: getHealthColor(healthDimensions.timeliness) }}>
              {healthDimensions.timeliness?.toFixed(0) || 53}%
            </div>
            <div className="gauge-bar">
              <div 
                className="gauge-fill" 
                style={{ 
                  width: `${healthDimensions.timeliness || 53}%`,
                  backgroundColor: getHealthColor(healthDimensions.timeliness)
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overall Health Score */}
      <div className="overall-health-section">
        <div className="overall-health-card">
          <h2>Overall Health Score</h2>
          <div 
            className="overall-health-value" 
            style={{ color: getHealthColor(overallScore) }}
          >
            {overallScore}
          </div>
          <div className="overall-health-status" style={{ color: getHealthColor(overallScore) }}>
            {getHealthStatus(overallScore)}
          </div>
          <div className="health-breakdown">
            <div className="breakdown-item">
              <span>Completeness:</span>
              <strong>{healthDimensions.completeness?.toFixed(0)}%</strong>
            </div>
            <div className="breakdown-item">
              <span>Consistency:</span>
              <strong>{healthDimensions.consistency?.toFixed(0)}%</strong>
            </div>
            <div className="breakdown-item">
              <span>Accuracy:</span>
              <strong>{healthDimensions.accuracy?.toFixed(0)}%</strong>
            </div>
            <div className="breakdown-item">
              <span>Validity:</span>
              <strong>{healthDimensions.validity?.toFixed(0)}%</strong>
            </div>
            <div className="breakdown-item">
              <span>Timeliness:</span>
              <strong>{healthDimensions.timeliness?.toFixed(0)}%</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3>Project Health Scores</h3>
          </div>
          <div className="chart-container horizontal-bar">
            {filteredProjectHealth.length > 0 ? (
              <Bar data={projectHealthData} options={projectHealthOptions} />
            ) : (
              <div className="no-data">No project data available</div>
            )}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>File Type Distribution</h3>
          </div>
          <div className="chart-container donut">
            {metrics.fileTypeDistribution && metrics.fileTypeDistribution.length > 0 ? (
              <Doughnut data={fileTypeData} options={fileTypeOptions} />
            ) : (
              <div className="no-data">No file type data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Governance & Compliance */}
      <div className="governance-section">
        <h2>Governance & Compliance</h2>
        <div className="governance-cards">
          <div className="governance-card">
            <div className="governance-label">High-Risk PII Exposure</div>
            <div className="governance-value">{metrics.highRiskPII?.count || 0}</div>
            <div className={`governance-status status-${metrics.highRiskPII?.status}`}>
              {metrics.highRiskPII?.status}
            </div>
          </div>
          <div className="governance-card">
            <div className="governance-label">Vendor SLA Compliance</div>
            <div className="governance-value">{metrics.vendorCompliance?.rate?.toFixed(1) || 0}%</div>
            <div className={`governance-status status-${metrics.vendorCompliance?.status}`}>
              {metrics.vendorCompliance?.compliantVendors}/{metrics.vendorCompliance?.totalVendors} compliant
            </div>
          </div>
          <div className="governance-card">
            <div className="governance-label">Governance Coverage</div>
            <div className="governance-value">{metrics.governanceCoverage?.rate?.toFixed(1) || 0}%</div>
            <div className={`governance-status status-${metrics.governanceCoverage?.status}`}>
              {metrics.governanceCoverage?.taggedFiles?.toLocaleString()} files tagged
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
