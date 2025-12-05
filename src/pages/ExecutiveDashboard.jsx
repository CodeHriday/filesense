import React, { useState, useEffect, useRef } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
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
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { API_BASE_URL } from '../config';
import MetricTrendPopup from '../components/MetricTrendPopup';
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
  Filler,
  ChartDataLabels
);

const ExecutiveDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [timeRange, setTimeRange] = useState(30);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectHealthScores, setProjectHealthScores] = useState([]);
  const [fileTypeDistribution, setFileTypeDistribution] = useState([]);
  const [jobTrend, setJobTrend] = useState([]);
  const [schemaDriftTrend, setSchemaDriftTrend] = useState([]);
  const [qualityViolations, setQualityViolations] = useState([]);
  const [activeQualityTab, setActiveQualityTab] = useState('all');
  const [metricTrends, setMetricTrends] = useState({});
  const [activePopup, setActivePopup] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [popupAnchorEl, setPopupAnchorEl] = useState(null);
  const clickTimeoutRef = useRef(null);
  const kpiCardRefs = useRef({});

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const fetchProjectHealthScores = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/project-health-scores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjectHealthScores(response.data.projects || []);
    } catch (err) {
      console.error('Error fetching project health scores:', err);
    }
  };

  const fetchFileTypeDistribution = async () => {
    try {
      const token = localStorage.getItem('token');
      const projectParam = selectedProject ? `?project_id=${selectedProject}` : '';
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/file-type-distribution${projectParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFileTypeDistribution(response.data.fileTypes || []);
    } catch (err) {
      console.error('Error fetching file type distribution:', err);
    }
  };

  const fetchJobTrend = async () => {
    try {
      const token = localStorage.getItem('token');
      const projectParam = selectedProject ? `?project_id=${selectedProject}` : '';
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/job-trend${projectParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJobTrend(response.data.jobTrend || []);
    } catch (err) {
      console.error('Error fetching job trend:', err);
    }
  };

  const fetchSchemaDriftTrend = async () => {
    try {
      const token = localStorage.getItem('token');
      const projectParam = selectedProject ? `?project_id=${selectedProject}` : '';
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/schema-drift-trend${projectParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchemaDriftTrend(response.data.driftTrend || []);
    } catch (err) {
      console.error('Error fetching schema drift trend:', err);
    }
  };

  const fetchQualityViolations = async () => {
    try {
      const token = localStorage.getItem('token');
      const projectParam = selectedProject ? `?project_id=${selectedProject}` : '';
      const response = await axios.get(`${API_BASE_URL}/api/dashboard/quality-violations-trend${projectParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQualityViolations(response.data.violationsTrend || []);
    } catch (err) {
      console.error('Error fetching quality violations:', err);
    }
  };

  const fetchExecutiveMetrics = async (showLoading = true) => {
    try {
      setError(null);
      if (showLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const token = localStorage.getItem('token');
      const projectParam = selectedProject ? `&project_id=${selectedProject}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/executive-metrics?days=${timeRange}${projectParam}`,
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

  const fetchMetricTrends = async () => {
    try {
      const token = localStorage.getItem('token');
      const projectParam = selectedProject ? `&project_id=${selectedProject}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/metric-trends?granularity=daily${projectParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setMetricTrends(response.data.trends);
      }
    } catch (err) {
      console.error('Error fetching metric trends:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchProjectHealthScores();
  }, []);

  useEffect(() => {
    fetchExecutiveMetrics();
    fetchFileTypeDistribution();
    fetchJobTrend();
    fetchSchemaDriftTrend();
    fetchQualityViolations();
    fetchMetricTrends();
  }, [timeRange, selectedProject]);

  const handleRefresh = () => {
    fetchExecutiveMetrics(false);
  };

  const handleKpiCardClick = (metricType, metricLabel, event) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      setActivePopup(null);
      setActiveModal({ type: metricType, label: metricLabel });
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        setPopupAnchorEl(event.currentTarget);
        setActivePopup({ type: metricType, label: metricLabel });
        clickTimeoutRef.current = null;
      }, 200);
    }
  };

  const handlePopupClose = () => {
    setActivePopup(null);
    setPopupAnchorEl(null);
  };

  const handleModalClose = () => {
    setActiveModal(null);
  };

  const getMetricTrendDirection = (metricType) => {
    const trends = metricTrends[metricType];
    if (!trends || trends.length < 2) return 'neutral';
    const first = trends[0]?.value || 0;
    const last = trends[trends.length - 1]?.value || 0;
    if (last > first) return 'up';
    if (last < first) return 'down';
    return 'neutral';
  };

  const TrendIcon = ({ direction }) => {
    if (direction === 'up') return <span className="trend-icon up">↑</span>;
    if (direction === 'down') return <span className="trend-icon down">↓</span>;
    return <span className="trend-icon neutral">→</span>;
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
      },
      datalabels: {
        display: false
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time Period',
          color: '#6B7280',
          font: { size: 12, family: 'Inter' }
        },
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { color: '#6B7280', font: { size: 10 } }
      },
      y: {
        title: {
          display: true,
          text: 'Files Processed',
          color: '#6B7280',
          font: { size: 12, family: 'Inter' }
        },
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { color: '#6B7280', font: { size: 12 } }
      }
    }
  };

  const projectHealthChartData = {
    labels: projectHealthScores.slice(0, 10).map(p => p.projectName),
    datasets: [{
      label: 'Health Score',
      data: projectHealthScores.slice(0, 10).map(p => p.healthScore),
      backgroundColor: projectHealthScores.slice(0, 10).map(p => {
        if (p.healthScore >= 90) return '#025043';
        if (p.healthScore >= 75) return '#2ECC71';
        if (p.healthScore >= 60) return '#FF9F43';
        return '#EF4444';
      }),
      borderRadius: 6,
      maxBarThickness: 32
    }]
  };

  const projectHealthChartOptions = {
    indexAxis: 'y',
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
        callbacks: {
          title: function(context) {
            const fullLabel = projectHealthScores[context[0].dataIndex]?.projectName || '';
            return fullLabel;
          }
        }
      },
      datalabels: {
        display: false
      }
    },
    scales: {
      x: {
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { color: '#6B7280', font: { size: 11, family: "'Inter', sans-serif" } },
        max: 100
      },
      y: {
        grid: { display: false },
        ticks: { 
          color: '#374151', 
          font: { size: 10, family: "'Inter', sans-serif", weight: '500' },
          callback: function(value, index, ticks) {
            const label = this.getLabelForValue(value);
            return label.length > 15 ? label.substring(0, 15) + '...' : label;
          }
        }
      }
    }
  };

  const fileTypeChartData = {
    labels: fileTypeDistribution.map(ft => {
      const type = ft.fileType.toLowerCase();
      return type.charAt(0).toUpperCase() + type.slice(1);
    }),
    datasets: [{
      data: fileTypeDistribution.map(ft => ft.count),
      backgroundColor: [
        '#025043',
        '#2ECC71',
        '#4C6EF5',
        '#FF9F43',
        '#EF4444',
        '#8B5CF6',
        '#EC4899',
        '#06B6D4'
      ],
      borderWidth: 0
    }]
  };

  const fileTypeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 12,
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#374151',
          generateLabels: (chart) => {
            const data = chart.data;
            return data.labels.map((label, i) => ({
              text: `${label} (${data.datasets[0].data[i]})`,
              fillStyle: data.datasets[0].backgroundColor[i],
              strokeStyle: 'transparent',
              lineWidth: 0,
              hidden: false,
              index: i
            }));
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
            const fileType = fileTypeDistribution[context.dataIndex];
            return [
              `Count: ${fileType.count}`,
              `Percentage: ${fileType.percentage}%`,
              `Avg Quality: ${fileType.avgQuality}%`
            ];
          }
        }
      },
      datalabels: {
        display: false
      }
    }
  };

  // Job Trend Chart (Stacked Bar)
  const jobTrendChartData = {
    labels: jobTrend.map(item => new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Passed',
        data: jobTrend.map(item => item.passed),
        backgroundColor: '#2ECC71',
        borderRadius: 4,
        maxBarThickness: 20
      },
      {
        label: 'Failed',
        data: jobTrend.map(item => item.failed),
        backgroundColor: '#EF4444',
        borderRadius: 4,
        maxBarThickness: 20
      }
    ]
  };

  const jobTrendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 8,
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#374151'
        }
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#1F2937',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (tooltipItems) => {
            return tooltipItems[0].label;
          },
          afterTitle: (tooltipItems) => {
            const index = tooltipItems[0].dataIndex;
            const allDatasets = tooltipItems[0].chart.data.datasets;
            const completed = allDatasets[0].data[index] || 0;
            const failed = allDatasets[1].data[index] || 0;
            const total = completed + failed;
            return `Total Jobs: ${total}`;
          },
          label: (context) => {
            const value = context.parsed.y;
            const index = context.dataIndex;
            const allDatasets = context.chart.data.datasets;
            const completed = allDatasets[0].data[index] || 0;
            const failed = allDatasets[1].data[index] || 0;
            const total = completed + failed;
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${context.dataset.label}: ${value} (${percentage}%)`;
          }
        }
      },
      datalabels: {
        display: false
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { 
          color: '#6B7280', 
          font: { size: 10, family: "'Inter', sans-serif" },
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        stacked: true,
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { 
          color: '#6B7280', 
          font: { size: 10, family: "'Inter', sans-serif" },
          precision: 0
        }
      }
    }
  };

  // Schema Drift Trend Chart (Line)
  const schemaDriftChartData = {
    labels: schemaDriftTrend.map(item => new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Schema Drifts',
        data: schemaDriftTrend.map(item => item.count),
        borderColor: '#4C6EF5',
        backgroundColor: 'rgba(76, 110, 245, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: '#4C6EF5'
      }
    ]
  };

  const schemaDriftChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 8,
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#374151'
        }
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#1F2937',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 10
      },
      datalabels: {
        display: false
      }
    },
    scales: {
      x: {
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { 
          color: '#6B7280', 
          font: { size: 10, family: "'Inter', sans-serif" },
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { 
          color: '#6B7280', 
          font: { size: 10, family: "'Inter', sans-serif" },
          precision: 0
        }
      }
    }
  };

  // Quality Violations Chart (Stacked Bar with Tabs)
  const dimensionColors = {
    completeness: '#FF6B6B',
    uniqueness: '#4ECDC4',
    validity: '#FFE66D',
    consistency: '#95E1D3',
    accuracy: '#A8E6CF'
  };

  const dimensionLabels = {
    completeness: 'Completeness',
    uniqueness: 'Uniqueness',
    validity: 'Validity',
    consistency: 'Consistency',
    accuracy: 'Accuracy'
  };

  const processQualityViolations = () => {
    // Group data by date
    const dateMap = {};
    
    qualityViolations.forEach(item => {
      if (!dateMap[item.date]) {
        dateMap[item.date] = {
          completeness: 0,
          uniqueness: 0,
          validity: 0,
          consistency: 0,
          accuracy: 0
        };
      }
      dateMap[item.date][item.dimension] = item.count;
    });

    const dates = Object.keys(dateMap).sort();
    return dates.map(date => ({
      date,
      ...dateMap[date]
    }));
  };

  const processedViolations = processQualityViolations();

  const qualityViolationsChartData = {
    labels: processedViolations.map(item => new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: activeQualityTab === 'all' 
      ? [
          {
            label: dimensionLabels.completeness,
            data: processedViolations.map(item => item.completeness),
            backgroundColor: dimensionColors.completeness,
            borderRadius: 4,
            maxBarThickness: 20
          },
          {
            label: dimensionLabels.uniqueness,
            data: processedViolations.map(item => item.uniqueness),
            backgroundColor: dimensionColors.uniqueness,
            borderRadius: 4,
            maxBarThickness: 20
          },
          {
            label: dimensionLabels.validity,
            data: processedViolations.map(item => item.validity),
            backgroundColor: dimensionColors.validity,
            borderRadius: 4,
            maxBarThickness: 20
          },
          {
            label: dimensionLabels.consistency,
            data: processedViolations.map(item => item.consistency),
            backgroundColor: dimensionColors.consistency,
            borderRadius: 4,
            maxBarThickness: 20
          },
          {
            label: dimensionLabels.accuracy,
            data: processedViolations.map(item => item.accuracy),
            backgroundColor: dimensionColors.accuracy,
            borderRadius: 4,
            maxBarThickness: 20
          }
        ]
      : [
          {
            label: dimensionLabels[activeQualityTab],
            data: processedViolations.map(item => item[activeQualityTab]),
            backgroundColor: dimensionColors[activeQualityTab],
            borderRadius: 4,
            maxBarThickness: 20
          }
        ]
  };

  const qualityViolationsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 8,
          font: { size: 10, family: "'Inter', sans-serif" },
          color: '#374151'
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
          title: (tooltipItems) => {
            return tooltipItems[0].label;
          },
          afterTitle: (tooltipItems) => {
            const index = tooltipItems[0].dataIndex;
            const dayData = processedViolations[index];
            const total = dayData.completeness + dayData.uniqueness + dayData.validity + dayData.consistency + dayData.accuracy;
            return `Total Violations: ${total}`;
          },
          beforeBody: (tooltipItems) => {
            const index = tooltipItems[0].dataIndex;
            const dayData = processedViolations[index];
            const total = dayData.completeness + dayData.uniqueness + dayData.validity + dayData.consistency + dayData.accuracy;
            
            const lines = [];
            if (total > 0) {
              lines.push(`Completeness: ${dayData.completeness} (${((dayData.completeness / total) * 100).toFixed(1)}%)`);
              lines.push(`Uniqueness: ${dayData.uniqueness} (${((dayData.uniqueness / total) * 100).toFixed(1)}%)`);
              lines.push(`Validity: ${dayData.validity} (${((dayData.validity / total) * 100).toFixed(1)}%)`);
              lines.push(`Consistency: ${dayData.consistency} (${((dayData.consistency / total) * 100).toFixed(1)}%)`);
              lines.push(`Accuracy: ${dayData.accuracy} (${((dayData.accuracy / total) * 100).toFixed(1)}%)`);
            }
            return lines;
          },
          label: () => {
            return null;
          }
        }
      },
      datalabels: {
        display: false
      }
    },
    scales: {
      x: {
        stacked: activeQualityTab === 'all',
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { 
          color: '#6B7280', 
          font: { size: 10, family: "'Inter', sans-serif" },
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        stacked: activeQualityTab === 'all',
        grid: { color: '#E5E7EB', drawBorder: false },
        ticks: { 
          color: '#6B7280', 
          font: { size: 10, family: "'Inter', sans-serif" },
          precision: 0
        }
      }
    }
  };

  const calculateOverallHealth = () => {
    if (!metrics) return 0;
    const healthIndex = metrics.dataHealthIndex?.value || 0;
    const jobSuccess = metrics.jobSuccessRate?.rate || 0;
    const vendorCompliance = metrics.vendorCompliance?.rate || 0;
    const governanceCoverage = metrics.governanceCoverage?.rate || 0;
    
    return ((healthIndex + jobSuccess + vendorCompliance + governanceCoverage) / 4).toFixed(1);
  };

  const getHealthColor = (score) => {
    if (score >= 90) return '#025043';
    if (score >= 75) return '#2ECC71';
    if (score >= 60) return '#FF9F43';
    return '#EF4444';
  };

  const getHealthLabel = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Poor';
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

  const overallHealth = calculateOverallHealth();

  return (
    <div className="executive-dashboard">
      <div className="dashboard-header">
        <h1>Executive Dashboard</h1>
        <div className="dashboard-controls">
          <select 
            className="project-selector"
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value || null)}
          >
            <option value="">All Projects</option>
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
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>
      </div>

      <div className="health-score-hero">
        <div className="health-score-card">
          <div className="health-label">Overall Data Health Index</div>
          <div 
            className="health-value" 
            style={{ color: getHealthColor(overallHealth) }}
          >
            {overallHealth}%
          </div>
          <div className="health-status" style={{ color: getHealthColor(overallHealth) }}>
            {getHealthLabel(overallHealth)}
          </div>
          <div className="health-breakdown">
            <div 
              className="health-metric interactive"
              onClick={(e) => handleKpiCardClick('dataHealth', 'Data Health', e)}
            >
              <span>Data Health <TrendIcon direction={getMetricTrendDirection('dataHealth')} /></span>
              <span>{metrics?.dataHealthIndex?.value || 0}%</span>
            </div>
            <div 
              className="health-metric interactive"
              onClick={(e) => handleKpiCardClick('jobSuccess', 'Job Success', e)}
            >
              <span>Job Success <TrendIcon direction={getMetricTrendDirection('jobSuccess')} /></span>
              <span>{metrics?.jobSuccessRate?.rate || 0}%</span>
            </div>
            <div 
              className="health-metric interactive"
              onClick={(e) => handleKpiCardClick('vendorCompliance', 'Vendor Compliance', e)}
            >
              <span>Vendor Compliance <TrendIcon direction={getMetricTrendDirection('vendorCompliance')} /></span>
              <span>{metrics?.vendorCompliance?.rate || 0}%</span>
            </div>
            <div 
              className="health-metric interactive"
              onClick={(e) => handleKpiCardClick('governanceCoverage', 'Governance', e)}
            >
              <span>Governance <TrendIcon direction={getMetricTrendDirection('governanceCoverage')} /></span>
              <span>{metrics?.governanceCoverage?.rate || 0}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="kpi-cards">
        <div 
          className="kpi-card interactive"
          onClick={(e) => handleKpiCardClick('totalFiles', 'Total Files', e)}
          ref={el => kpiCardRefs.current.totalFiles = el}
        >
          <div className="kpi-label">
            Total Files <TrendIcon direction={getMetricTrendDirection('totalFiles')} />
          </div>
          <div className="kpi-value">{(metrics.totalFiles || 0).toLocaleString()}</div>
          <div className={`kpi-trend ${getTrendClass(metrics.throughputTrend?.sparkline)}`}>
            {getTrendIcon(metrics.throughputTrend?.sparkline)} 
            {metrics.throughputTrend?.currentPeriodCount || 0} this period
          </div>
        </div>

        <div 
          className="kpi-card interactive"
          onClick={(e) => handleKpiCardClick('dataHealth', 'Data Health Index', e)}
          ref={el => kpiCardRefs.current.dataHealth = el}
        >
          <div className="kpi-label">
            Data Health Index <TrendIcon direction={getMetricTrendDirection('dataHealth')} />
          </div>
          <div className="kpi-value">{metrics.dataHealthIndex?.value?.toFixed(1) || 0}%</div>
          <div className={`kpi-trend ${getStatusClass(metrics.dataHealthIndex?.status)}`}>
            {metrics.dataHealthIndex?.delta > 0 ? '+' : ''}{metrics.dataHealthIndex?.delta?.toFixed(1) || 0}% vs prev
          </div>
        </div>

        <div 
          className="kpi-card interactive"
          onClick={(e) => handleKpiCardClick('vendorCompliance', 'Vendor Compliance', e)}
          ref={el => kpiCardRefs.current.vendorCompliance = el}
        >
          <div className="kpi-label">
            Vendor Compliance <TrendIcon direction={getMetricTrendDirection('vendorCompliance')} />
          </div>
          <div className="kpi-value">{metrics.vendorCompliance?.rate || 0}%</div>
          <div className={`kpi-trend ${getStatusClass(metrics.vendorCompliance?.status)}`}>
            {metrics.vendorCompliance?.compliantVendors || 0}/{metrics.vendorCompliance?.totalVendors || 0} compliant
          </div>
        </div>

        <div 
          className="kpi-card interactive"
          onClick={(e) => handleKpiCardClick('governanceCoverage', 'Governance Coverage', e)}
          ref={el => kpiCardRefs.current.governanceCoverage = el}
        >
          <div className="kpi-label">
            Governance Coverage <TrendIcon direction={getMetricTrendDirection('governanceCoverage')} />
          </div>
          <div className="kpi-value">{metrics.governanceCoverage?.rate || 0}%</div>
          <div className={`kpi-trend ${getStatusClass(metrics.governanceCoverage?.status)}`}>
            {(metrics.governanceCoverage?.taggedFiles || 0).toLocaleString()} files tagged
          </div>
        </div>

        <div 
          className="kpi-card interactive"
          onClick={(e) => handleKpiCardClick('criticalAlerts', 'Critical Alerts', e)}
          ref={el => kpiCardRefs.current.criticalAlerts = el}
        >
          <div className="kpi-label">
            Critical Alerts <TrendIcon direction={getMetricTrendDirection('criticalAlerts')} />
          </div>
          <div className="kpi-value">{metrics.criticalAlerts?.count || 0}</div>
          <div className={`kpi-trend ${getStatusClass(metrics.criticalAlerts?.status)}`}>
            {metrics.highRiskPII?.count || 0} high-risk PII
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3>File Type Distribution</h3>
          </div>
          <div className="chart-container donut">
            {fileTypeDistribution.length > 0 ? (
              <Doughnut data={fileTypeChartData} options={fileTypeChartOptions} />
            ) : (
              <div className="no-data">No file type data available</div>
            )}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Data Quality Violations (Last 30 Days)</h3>
            <div className="quality-tabs">
              <button 
                className={`tab-button ${activeQualityTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveQualityTab('all')}
              >
                All
              </button>
              <button 
                className={`tab-button ${activeQualityTab === 'completeness' ? 'active' : ''}`}
                onClick={() => setActiveQualityTab('completeness')}
              >
                Completeness
              </button>
              <button 
                className={`tab-button ${activeQualityTab === 'uniqueness' ? 'active' : ''}`}
                onClick={() => setActiveQualityTab('uniqueness')}
              >
                Uniqueness
              </button>
              <button 
                className={`tab-button ${activeQualityTab === 'validity' ? 'active' : ''}`}
                onClick={() => setActiveQualityTab('validity')}
              >
                Validity
              </button>
              <button 
                className={`tab-button ${activeQualityTab === 'consistency' ? 'active' : ''}`}
                onClick={() => setActiveQualityTab('consistency')}
              >
                Consistency
              </button>
            </div>
          </div>
          <div className="chart-container">
            {processedViolations.length > 0 ? (
              <Bar data={qualityViolationsChartData} options={qualityViolationsChartOptions} />
            ) : (
              <div className="no-data">No quality violations data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3>File Processing Trend</h3>
          </div>
          <div className="chart-container">
            <Bar data={throughputChartData} options={throughputChartOptions} />
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Project Health Scores (Top 10)</h3>
          </div>
          <div className="chart-container">
            {projectHealthScores.length > 0 ? (
              <Bar data={projectHealthChartData} options={projectHealthChartOptions} />
            ) : (
              <div className="no-data">No project data available</div>
            )}
          </div>
        </div>
      </div>

      {metrics.platformOverview && (
        <>
          <div className="section-divider"></div>

          <div className="section-header platform-overview-header">
            <h2>Platform Overview</h2>
            <p className="section-description">System-wide metrics and platform statistics</p>
          </div>

          <div className="kpi-cards platform-overview-section">
            <div className="kpi-card">
              <div className="kpi-label">Projects</div>
              <div className="kpi-value">{(metrics.platformOverview?.projects || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Total active projects</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Schedules</div>
              <div className="kpi-value">{(metrics.platformOverview?.schedules || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Active automated jobs</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Mapping Jobs</div>
              <div className="kpi-value">{(metrics.platformOverview?.mappingJobs || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Unique transformations</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Governance Tags</div>
              <div className="kpi-value">{(metrics.platformOverview?.governanceTags || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Total tags defined</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Policies</div>
              <div className="kpi-value">{(metrics.platformOverview?.policies || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Active access policies</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Lineage Tracked</div>
              <div className="kpi-value">{(metrics.platformOverview?.lineageTrackedFiles || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Files with lineage</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Vendors</div>
              <div className="kpi-value">{(metrics.platformOverview?.vendors || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Total registered</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Vendor Agreements</div>
              <div className="kpi-value">{(metrics.platformOverview?.vendorAgreements || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Active contracts</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Internal Users</div>
              <div className="kpi-value">{(metrics.platformOverview?.internalUsers || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Company users</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">External Users</div>
              <div className="kpi-value">{(metrics.platformOverview?.externalUsers || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Vendor users</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Roles</div>
              <div className="kpi-value">{(metrics.platformOverview?.roles || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Total RBAC roles</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">External Connections</div>
              <div className="kpi-value">{(metrics.platformOverview?.externalConnections || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Cloud storage links</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">Internal Connections</div>
              <div className="kpi-value">{(metrics.platformOverview?.internalConnections || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">Local storage paths</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">SLA Breaches</div>
              <div className="kpi-value">{(metrics.platformOverview?.slaBreaches || 0).toLocaleString()}</div>
              <div className="kpi-trend neutral">
                {metrics.slaBreaches ? `${metrics.slaBreaches.missingFiles || 0} missing, ${metrics.slaBreaches.lateFiles || 0} late` : 'No breaches'}
              </div>
            </div>
          </div>
        </>
      )}

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

      <div className="trend-charts-row">
        <div className="chart-card">
          <div className="chart-header">
            <h3>Daily Job Trend (Last 30 Days)</h3>
          </div>
          <div className="chart-container">
            {jobTrend.length > 0 ? (
              <Bar data={jobTrendChartData} options={jobTrendChartOptions} />
            ) : (
              <div className="no-data">No job trend data available</div>
            )}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Schema Drift Trend (Last 30 Days)</h3>
          </div>
          <div className="chart-container">
            {schemaDriftTrend.length > 0 ? (
              <Line data={schemaDriftChartData} options={schemaDriftChartOptions} />
            ) : (
              <div className="no-data">No schema drift data available</div>
            )}
          </div>
        </div>
      </div>

      {activePopup && (
        <MetricTrendPopup
          metricType={activePopup.type}
          metricLabel={activePopup.label}
          isOpen={true}
          onClose={handlePopupClose}
          anchorEl={popupAnchorEl}
          projectId={selectedProject}
          isModal={false}
        />
      )}

      {activeModal && (
        <MetricTrendPopup
          metricType={activeModal.type}
          metricLabel={activeModal.label}
          isOpen={true}
          onClose={handleModalClose}
          projectId={selectedProject}
          isModal={true}
        />
      )}
    </div>
  );
};

export default ExecutiveDashboard;
