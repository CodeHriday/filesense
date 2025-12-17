import React, { useState } from 'react';
import axios from 'axios';
import PasswordInput from './PasswordInput';
import '../styles/ForcePasswordChange.css';
import PropTypes from 'prop-types';

const ForcePasswordChange = ({ onPasswordChanged }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newPassword || !confirmPassword) {
      setError('Please enter and confirm your new password');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      await axios.post('/api/auth/force-change-password', {
        newPassword
      });
      
      // Password changed successfully
      onPasswordChanged();
    } catch (err) {
      console.error('Password change error:', err);
      setError(err.response?.data?.error || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="force-password-modal-overlay">
      <div className="force-password-modal">
        <div className="force-password-header">
          <h2>Password Change Required</h2>
          <p className="warning-text">
            Your password has been reset by an administrator. For security reasons, you must change your password before continuing.
          </p>
        </div>
        
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="force-password-form">
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <PasswordInput
              id="newPassword"
              name="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              placeholder="Enter new password"
              autoFocus
              required
            />
            <small className="password-hint">
              Password must be at least 8 characters long
            </small>
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              placeholder="Confirm new password"
              required
            />
          </div>
          
          <button
            type="submit"
            className="btn-primary btn-full-width"
            disabled={loading}
          >
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
        
        <div className="force-password-footer">
          <small>
            You cannot proceed without changing your password
          </small>
        </div>
      </div>
    </div>
  );
};
ForcePasswordChange.propTypes = {
  onPasswordChanged: PropTypes.func.isRequired
};

export default ForcePasswordChange;
