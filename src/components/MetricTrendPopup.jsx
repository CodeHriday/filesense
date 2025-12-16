import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import './MetricTrendPopup.css';
import PropTypes from 'prop-types';

const MetricTrendPopup = ({ 
  metricType, 
  metricLabel, 
  isOpen, 
  onClose, 
  anchorEl,
  projectId,
  isModal = false
}) => {
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState('daily');
  const popupRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchTrendData();
    }
  }, [isOpen, metricType, granularity, projectId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen && !isModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isModal, onClose]);

  const fetchTrendData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const projectParam = projectId ? `&project_id=${projectId}` : '';
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/metric-trends?metric=${metricType}&granularity=${granularity}${projectParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success && response.data.trends[metricType]) {
        setTrendData(response.data.trends[metricType]);
      }
    } catch (err) {
      console.error('Error fetching metric trends:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    if (granularity === 'monthly') {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else if (granularity === 'weekly') {
      return `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const chartData = {
    labels: trendData.map(item => formatDate(item.date)),
    datasets: [{
      label: metricLabel,
      data: trendData.map(item => item.value),
      borderColor: '#025043',
      backgroundColor: 'rgba(2, 80, 67, 0.1)',
      borderWidth: isModal ? 2 : 1.5,
      pointRadius: isModal ? 4 : 2,
      pointHoverRadius: isModal ? 6 : 4,
      tension: 0.3,
      fill: true
    }]
  };

  const chartOptions = {
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
        padding: isModal ? 12 : 8,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            const isPercentage = ['dataHealth', 'vendorCompliance', 'jobSuccess', 'governanceCoverage'].includes(metricType);
            return `${metricLabel}: ${value}${isPercentage ? '%' : ''}`;
          }
        }
      },
      datalabels: {
        display: false
      }
    },
    scales: {
      x: {
        display: isModal,
        grid: { display: false },
        ticks: { 
          font: { size: 10 },
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        display: isModal,
        grid: { color: '#E5E7EB' },
        ticks: { font: { size: 10 } }
      }
    }
  };

  const calculateTrend = () => {
    if (trendData.length < 2) return { direction: 'neutral', change: 0 };
    const first = trendData[0]?.value || 0;
    const last = trendData[trendData.length - 1]?.value || 0;
    const change = first !== 0 ? ((last - first) / first * 100).toFixed(1) : 0;
    return {
      direction: last > first ? 'up' : last < first ? 'down' : 'neutral',
      change: Math.abs(change)
    };
  };

  const trend = calculateTrend();

  if (!isOpen) return null;

  const getPopupPosition = () => {
    if (!anchorEl) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    
    const rect = anchorEl.getBoundingClientRect();
    const popupWidth = 280;
    const popupHeight = 160;
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let top, left;
    
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    if (spaceBelow >= popupHeight + margin) {
      top = rect.bottom + margin;
    } else if (spaceAbove >= popupHeight + margin) {
      top = rect.top - popupHeight - margin;
    } else {
      top = Math.max(margin, Math.min(viewportHeight - popupHeight - margin, rect.top + rect.height / 2 - popupHeight / 2));
    }
    
    const centerLeft = rect.left + rect.width / 2 - popupWidth / 2;
    left = Math.max(margin, Math.min(viewportWidth - popupWidth - margin, centerLeft));
    
    return { top: `${top}px`, left: `${left}px` };
  };

  const popupPosition = getPopupPosition();

  const getModalPosition = () => {
    if (!anchorEl) return {};
    
    const rect = anchorEl.getBoundingClientRect();
    const modalWidth = 800;
    const modalHeight = 500;
    const margin = 40;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let top = rect.bottom + margin;
    if (top + modalHeight > viewportHeight - margin) {
      top = Math.max(margin, rect.top - modalHeight - margin);
    }
    if (top + modalHeight > viewportHeight - margin) {
      top = Math.max(margin, (viewportHeight - modalHeight) / 2);
    }
    
    const centerLeft = rect.left + rect.width / 2 - modalWidth / 2;
    const left = Math.max(margin, Math.min(viewportWidth - modalWidth - margin, centerLeft));
    
    return { 
      top: `${top}px`, 
      left: `${left}px`,
      transform: 'none',
      alignItems: 'flex-start',
      justifyContent: 'flex-start'
    };
  };

  if (isModal) {
    const modalContainerStyle = anchorEl ? getModalPosition() : {};
    
    return (
      <div className={`metric-trend-modal-overlay ${anchorEl ? 'positioned' : ''}`} onClick={onClose} style={modalContainerStyle}>
        <div className="metric-trend-modal" onClick={(e) => e.stopPropagation()} ref={popupRef}>
          <div className="modal-header">
            <h3>{metricLabel} Trend</h3>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="modal-controls">
            <div className="granularity-tabs">
              <button 
                className={`granularity-tab ${granularity === 'daily' ? 'active' : ''}`}
                onClick={() => setGranularity('daily')}
              >
                Daily (15 days)
              </button>
              <button 
                className={`granularity-tab ${granularity === 'weekly' ? 'active' : ''}`}
                onClick={() => setGranularity('weekly')}
              >
                Weekly (16 weeks)
              </button>
              <button 
                className={`granularity-tab ${granularity === 'monthly' ? 'active' : ''}`}
                onClick={() => setGranularity('monthly')}
              >
                Monthly (16 months)
              </button>
            </div>
          </div>

          <div className="modal-summary">
            <div className="summary-stat">
              <span className="stat-label">Current</span>
              <span className="stat-value">
                {trendData[trendData.length - 1]?.value || 0}
                {['dataHealth', 'vendorCompliance', 'jobSuccess', 'governanceCoverage'].includes(metricType) ? '%' : ''}
              </span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Period Start</span>
              <span className="stat-value">
                {trendData[0]?.value || 0}
                {['dataHealth', 'vendorCompliance', 'jobSuccess', 'governanceCoverage'].includes(metricType) ? '%' : ''}
              </span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Change</span>
              <span className={`stat-value trend-${trend.direction}`}>
                {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}
                {trend.change}%
              </span>
            </div>
          </div>

          <div className="modal-chart-container">
            {loading ? (
              <div className="loading-spinner">Loading...</div>
            ) : trendData.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="no-data">No trend data available</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="metric-trend-popup"
      style={popupPosition}
      ref={popupRef}
    >
      <div className="popup-header">
        <span className="popup-title">{metricLabel}</span>
        <span className={`popup-trend trend-${trend.direction}`}>
          {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
          {trend.change}%
        </span>
      </div>
      <div className="popup-chart">
        {loading ? (
          <div className="loading-spinner small">Loading...</div>
        ) : trendData.length > 0 ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div className="no-data small">No data</div>
        )}
      </div>
      <div className="popup-footer">
        <span className="popup-hint">Double-click for details</span>
      </div>
    </div>
  );
};
MetricTrendPopup.propTypes = {
  metricType: PropTypes.string.isRequired,
  metricLabel: PropTypes.string.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  anchorEl: PropTypes.instanceOf(Element),
  projectId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  isModal: PropTypes.bool
};
export default MetricTrendPopup;
