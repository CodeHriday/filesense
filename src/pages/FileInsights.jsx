import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { FiAlertTriangle, FiTrendingUp, FiFileText, FiCalendar, FiRefreshCw } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import { getFilePatterns, getPatternMetrics, getPatternAlerts, aggregateMetrics } from '../api/insightsService';
import { useAuth } from '../context/AuthContext';
import '../styles/FileInsights.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const FileInsights = () => {
  const [patterns, setPatterns] = useState([]);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState('');
  const [granularity, setGranularity] = useState('daily');
  const [dateRange, setDateRange] = useState('30');
  const [aggregating, setAggregating] = useState(false);
  
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');

  useEffect(() => {
    loadPatterns();
  }, []);

  useEffect(() => {
    if (selectedPattern) {
      loadPatternData();
    }
  }, [selectedPattern, granularity, dateRange]);

  const loadPatterns = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getFilePatterns(100, 0);
      setPatterns(response.patterns);
      
      // Auto-select first pattern if available
      if (response.patterns.length > 0 && !selectedPattern) {
        setSelectedPattern(response.patterns[0].file_pattern);
      }
    } catch (err) {
      console.error('Error loading patterns:', err);
      setError('Failed to load file patterns');
    } finally {
      setLoading(false);
    }
  };

  const loadPatternData = async () => {
    try {
      setMetricsLoading(true);
      const [metricsResponse, alertsResponse] = await Promise.all([
        getPatternMetrics(selectedPattern, granularity, dateRange),
        getPatternAlerts(selectedPattern, 50)
      ]);
      
      setMetrics(metricsResponse.metrics);
      setAlerts(alertsResponse.alerts);
    } catch (err) {
      console.error('Error loading pattern data:', err);
      setError('Failed to load pattern metrics');
    } finally {
      setMetricsLoading(false);
    }
  };

  const handleAggregate = async () => {
    try {
      setAggregating(true);
      await aggregateMetrics();
      await loadPatterns();
      if (selectedPattern) {
        await loadPatternData();
      }
      alert('Metrics aggregation completed successfully');
    } catch (err) {
      console.error('Error aggregating metrics:', err);
      alert('Failed to aggregate metrics: ' + err.message);
    } finally {
      setAggregating(false);
    }
  };

  const getSelectedPatternInfo = () => {
    return patterns.find(p => p.file_pattern === selectedPattern);
  };

  // Prepare chart data for NULL trends
  const getNullTrendsChartData = () => {
    if (!metrics || metrics.length === 0) return null;
    
    const dateField = granularity === 'daily' ? 'metric_date' : 
                      granularity === 'weekly' ? 'week_start' : 'month_start';
    
    const dates = metrics.map(m => m[dateField]).reverse();
    const nullPercentages = metrics[0]?.null_percentages || {};
    const columns = Object.keys(nullPercentages);
    
    if (columns.length === 0) return null;
    
    // Generate different colors for each column
    const colors = [
      'rgb(255, 99, 132)',
      'rgb(54, 162, 235)',
      'rgb(255, 206, 86)',
      'rgb(75, 192, 192)',
      'rgb(153, 102, 255)',
      'rgb(255, 159, 64)'
    ];
    
    const datasets = columns.slice(0, 6).map((col, idx) => ({
      label: col,
      data: metrics.map(m => parseFloat(m.null_percentages?.[col] || 0)).reverse(),
      borderColor: colors[idx % colors.length],
      backgroundColor: colors[idx % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
      tension: 0.3,
      fill: true
    }));
    
    return {
      labels: dates,
      datasets
    };
  };

  // Prepare chart data for duplicate trends
  const getDuplicateTrendsChartData = () => {
    if (!metrics || metrics.length === 0) return null;
    
    const dateField = granularity === 'daily' ? 'metric_date' : 
                      granularity === 'weekly' ? 'week_start' : 'month_start';
    
    const dates = metrics.map(m => m[dateField]).reverse();
    const duplicates = metrics.map(m => parseFloat(m.duplicate_percentage || 0)).reverse();
    
    return {
      labels: dates,
      datasets: [{
        label: 'Duplicate %',
        data: duplicates,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
        tension: 0.3,
        fill: true
      }]
    };
  };

  // Prepare chart data for record count trends
  const getRecordCountChartData = () => {
    if (!metrics || metrics.length === 0) return null;
    
    const dateField = granularity === 'daily' ? 'metric_date' : 
                      granularity === 'weekly' ? 'week_start' : 'month_start';
    
    const dates = metrics.map(m => m[dateField]).reverse();
    const counts = metrics.map(m => parseInt(m.record_count || 0)).reverse();
    
    return {
      labels: dates,
      datasets: [{
        label: 'Record Count',
        data: counts,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.3,
        fill: true
      }]
    };
  };

  // Prepare chart data for numeric field averages
  const getNumericAvgChartData = () => {
    if (!metrics || metrics.length === 0) return null;
    
    const dateField = granularity === 'daily' ? 'metric_date' : 
                      granularity === 'weekly' ? 'week_start' : 'month_start';
    
    const dates = metrics.map(m => m[dateField]).reverse();
    const numericStats = metrics[0]?.numeric_stats || {};
    const numericColumns = Object.keys(numericStats);
    
    if (numericColumns.length === 0) return null;
    
    const colors = [
      'rgb(75, 192, 192)',
      'rgb(153, 102, 255)',
      'rgb(255, 159, 64)',
      'rgb(255, 99, 132)'
    ];
    
    const datasets = numericColumns.slice(0, 4).map((col, idx) => ({
      label: `${col} (avg)`,
      data: metrics.map(m => parseFloat(m.numeric_stats?.[col]?.avg || 0)).reverse(),
      borderColor: colors[idx % colors.length],
      backgroundColor: colors[idx % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
      tension: 0.3,
      fill: false
    }));
    
    return {
      labels: dates,
      datasets
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 10,
          font: { size: 11 }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          font: { size: 10 }
        }
      },
      y: {
        beginAtZero: true
      }
    }
  };

  if (loading) {
    return (
      <div className="file-insights-page">
        <LoadingSpinner message="Loading file patterns..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-insights-page">
        <div className="error-message">
          <FiAlertTriangle /> {error}
        </div>
      </div>
    );
  }

  const patternInfo = getSelectedPatternInfo();
  const nullTrendsData = getNullTrendsChartData();
  const duplicateTrendsData = getDuplicateTrendsChartData();
  const recordCountData = getRecordCountChartData();
  const numericAvgData = getNumericAvgChartData();

  return (
    <div className="file-insights-page">
      <div className="file-insights-header">
        <div>
          <h1>File Insights Dashboard</h1>
          <p className="subtitle">Track quality metrics and trends over time for file patterns</p>
        </div>
        {isAdmin && (
          <button 
            className="btn-primary" 
            onClick={handleAggregate}
            disabled={aggregating}
          >
            <FiRefreshCw className={aggregating ? 'spinning' : ''} />
            {aggregating ? 'Aggregating...' : 'Aggregate Metrics'}
          </button>
        )}
      </div>

      <div className="file-insights-container">
        {/* Left sidebar - File pattern selector */}
        <div className="pattern-selector">
          <h3>File Patterns ({patterns.length})</h3>
          <div className="pattern-list">
            {patterns.map(pattern => (
              <div
                key={pattern.file_pattern}
                className={`pattern-item ${selectedPattern === pattern.file_pattern ? 'selected' : ''} ${pattern.has_alerts ? 'has-alerts' : ''}`}
                onClick={() => setSelectedPattern(pattern.file_pattern)}
              >
                <div className="pattern-name">
                  <FiFileText />
                  <span>{pattern.file_pattern}</span>
                </div>
                <div className="pattern-stats">
                  <span className="stat-item">
                    {pattern.total_files} files
                  </span>
                  {pattern.has_alerts && (
                    <span className="alert-badge">
                      <FiAlertTriangle /> {pattern.total_alerts}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right side - Metrics dashboard */}
        <div className="metrics-dashboard">
          {selectedPattern && (
            <>
              <div className="dashboard-controls">
                <div className="pattern-info">
                  <h2>{selectedPattern}</h2>
                  {patternInfo && (
                    <div className="info-stats">
                      <span><FiTrendingUp /> {patternInfo.days_tracked} days tracked</span>
                      <span><FiCalendar /> Last: {new Date(patternInfo.last_metric_date).toLocaleDateString()}</span>
                      <span>Quality: {parseFloat(patternInfo.avg_quality_score || 0).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                
                <div className="time-controls">
                  <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  
                  <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="12w">Last 12 weeks</option>
                    <option value="6m">Last 6 months</option>
                    <option value="18m">Last 18 months</option>
                  </select>
                </div>
              </div>

              {metricsLoading ? (
                <LoadingSpinner message="Loading metrics..." />
              ) : metrics && metrics.length > 0 ? (
                <div className="charts-grid">
                  {/* Record Count Trend */}
                  {recordCountData && (
                    <div className="chart-card">
                      <h3>Record Count Trend</h3>
                      <div className="chart-container">
                        <Line data={recordCountData} options={chartOptions} />
                      </div>
                    </div>
                  )}

                  {/* NULL Values Trend */}
                  {nullTrendsData && (
                    <div className="chart-card">
                      <h3>NULL Values Trend (%)</h3>
                      <div className="chart-container">
                        <Line data={nullTrendsData} options={chartOptions} />
                      </div>
                    </div>
                  )}

                  {/* Duplicate Trend */}
                  {duplicateTrendsData && (
                    <div className="chart-card">
                      <h3>Duplicate Records Trend</h3>
                      <div className="chart-container">
                        <Line data={duplicateTrendsData} options={chartOptions} />
                      </div>
                    </div>
                  )}

                  {/* Numeric Field Averages */}
                  {numericAvgData && (
                    <div className="chart-card">
                      <h3>Numeric Field Averages</h3>
                      <div className="chart-container">
                        <Line data={numericAvgData} options={chartOptions} />
                      </div>
                    </div>
                  )}

                  {/* Alerts Section */}
                  {alerts && alerts.length > 0 && (
                    <div className="chart-card full-width alerts-section">
                      <h3>
                        <FiAlertTriangle /> Active Alerts ({alerts.length})
                      </h3>
                      <div className="alerts-list">
                        {alerts.map(alert => (
                          <div key={alert.anomaly_id} className={`alert-item severity-${alert.severity}`}>
                            <div className="alert-header">
                              <span className="alert-type">{alert.anomaly_type}</span>
                              <span className="alert-date">
                                {new Date(alert.detected_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="alert-title">{alert.title}</div>
                            {alert.description && (
                              <div className="alert-description">{alert.description}</div>
                            )}
                            {alert.expected_value && alert.actual_value && (
                              <div className="alert-values">
                                <span>Expected: {alert.expected_value}</span>
                                <span>Actual: {alert.actual_value}</span>
                                {alert.deviation_percentage && (
                                  <span className="deviation">
                                    Deviation: {parseFloat(alert.deviation_percentage).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-data-message">
                  <FiFileText size={48} />
                  <p>No metrics available for this pattern</p>
                  <p className="hint">Metrics are aggregated daily. Try aggregating now or check back later.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileInsights;
