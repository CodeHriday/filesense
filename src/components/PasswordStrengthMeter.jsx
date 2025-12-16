import React, { useState, useEffect } from 'react';
import './PasswordStrengthMeter.css';
import PropTypes from 'prop-types';

const PasswordStrengthMeter = ({ password }) => {
  const [strength, setStrength] = useState({ score: 0, label: '', checks: [] });

  useEffect(() => {
    if (!password) {
      setStrength({ score: 0, label: '', checks: [] });
      return;
    }

    const checks = [
      {
        label: 'At least 12 characters',
        passed: password.length >= 12
      },
      {
        label: 'Contains uppercase letter',
        passed: /[A-Z]/.test(password)
      },
      {
        label: 'Contains lowercase letter',
        passed: /[a-z]/.test(password)
      },
      {
        label: 'Contains number',
        passed: /[0-9]/.test(password)
      },
      {
        label: 'Contains special character (!@#$%^&*)',
        passed: /[!@#$%^&*(),.?":{}|<>]/.test(password)
      }
    ];

    const passedCount = checks.filter(c => c.passed).length;
    let score = 0;
    let label = '';

    if (passedCount === 0) {
      score = 0;
      label = '';
    } else if (passedCount <= 2) {
      score = 1;
      label = 'Weak';
    } else if (passedCount <= 3) {
      score = 2;
      label = 'Fair';
    } else if (passedCount === 4) {
      score = 3;
      label = 'Good';
    } else {
      score = 4;
      label = 'Strong';
    }

    setStrength({ score, label, checks });
  }, [password]);

  if (!password) {
    return null;
  }

  const getStrengthColor = () => {
    switch (strength.score) {
      case 1: return 'strength-weak';
      case 2: return 'strength-fair';
      case 3: return 'strength-good';
      case 4: return 'strength-strong';
      default: return '';
    }
  };

  return (
    <div className="password-strength-meter">
      {strength.label && (
        <>
          <div className="strength-bar-container">
            <div 
              className={`strength-bar ${getStrengthColor()}`}
              style={{ width: `${(strength.score / 4) * 100}%` }}
            />
          </div>
          <div className="strength-label">
            Password strength: <span className={getStrengthColor()}>{strength.label}</span>
          </div>
        </>
      )}
      
      <div className="password-requirements">
        <div className="requirements-title">Password must have:</div>
        <ul className="requirements-list">
          {strength.checks.map((check, index) => (
            <li key={index} className={check.passed ? 'requirement-passed' : 'requirement-failed'}>
              <span className="requirement-icon">
                {check.passed ? '✓' : '○'}
              </span>
              {check.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
PasswordStrengthMeter.propTypes = {
  password: PropTypes.string
};

PasswordStrengthMeter.defaultProps = {
  password: ''
};
export default PasswordStrengthMeter;
