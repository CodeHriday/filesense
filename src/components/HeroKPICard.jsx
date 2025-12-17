import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import { FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { COLORS, getStatusColor } from '../config/colors';
import PropTypes from 'prop-types';

const HeroKPICard = ({ 
  title, 
  value, 
  unit = '', 
  delta, 
  trend, 
  status, 
  sparklineData = [],
  pillarGradient,
  isPercentage = false,
  delay = 0
}) => {
  const statusColor = getStatusColor(status);
  
  const sparklineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    },
    scales: {
      x: { display: false },
      y: { display: false }
    },
    elements: {
      point: { radius: 0 },
      line: { tension: 0.4 }
    }
  };

  const sparklineChartData = {
    labels: sparklineData.map((_, i) => i),
    datasets: [{
      data: sparklineData,
      borderColor: statusColor,
      borderWidth: 2,
      fill: false
    }]
  };

  const renderValue = () => {
    if (isPercentage) {
      return (
        <div className="relative inline-block">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke={COLORS.neutralBg}
              strokeWidth="8"
              fill="none"
            />
            <motion.circle
              cx="64"
              cy="64"
              r="56"
              stroke={statusColor}
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 56}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - value / 100) }}
              transition={{ duration: 1, delay: delay + 0.2 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span 
              className="text-3xl font-bold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.3 }}
            >
              {value}{unit}
            </motion.span>
          </div>
        </div>
      );
    }

    return (
      <motion.div
        className="text-4xl font-bold"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: delay + 0.2, type: 'spring' }}
      >
        {value}{unit}
      </motion.div>
    );
  };

  return (
    <motion.div
      className="bg-white rounded-lg shadow-md p-6 relative overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.1)' }}
    >
      <div 
        className="absolute top-0 left-0 w-full h-1"
        style={{ background: pillarGradient }}
      />
      
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">
          {title}
        </h3>
        {delta !== undefined && delta !== null && (
          <div className={`flex items-center gap-1 text-sm font-semibold ${
            trend === 'up' ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend === 'up' ? <FaArrowUp size={12} /> : <FaArrowDown size={12} />}
            <span>{Math.abs(delta)}%</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center mb-4">
        {renderValue()}
      </div>

      {sparklineData.length > 0 && (
        <div className="h-16 mt-4">
          <Line data={sparklineChartData} options={sparklineOptions} />
        </div>
      )}

      <div className="flex justify-center mt-3">
        <span 
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
          style={{ 
            backgroundColor: `${statusColor}20`,
            color: statusColor 
          }}
        >
          {status === 'excellent' ? '✓ Excellent' : 
           status === 'good' ? '✓ Good' :
           status === 'warning' ? '⚠ Warning' :
           status === 'critical' ? '⚠ Critical' : '- Unknown'}
        </span>
      </div>
    </motion.div>
  );
};
HeroKPICard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  unit: PropTypes.string,
  delta: PropTypes.number,
  trend: PropTypes.oneOf(['up', 'down']),
  status: PropTypes.oneOf(['excellent', 'good', 'warning', 'critical']),
  sparklineData: PropTypes.arrayOf(PropTypes.number),
  pillarGradient: PropTypes.string,
  isPercentage: PropTypes.bool,
  delay: PropTypes.number
};

HeroKPICard.defaultProps = {
  unit: '',
  sparklineData: [],
  isPercentage: false,
  delay: 0
};
export default HeroKPICard;
