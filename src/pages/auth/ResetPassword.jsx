/**
 * Reset Password Page
 * 
 * A page that allows users to reset their password with a token.
 */
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToastContext } from '../../context/ToastContext';
import { Button } from '../../components/ui/atoms/buttons/Button';
import { Input } from '../../components/ui/atoms/inputs/Input';
import { Typography, TYPOGRAPHY_VARIANTS } from '../../components/ui/atoms/typography/Typography';
import { Form } from '../../components/ui/molecules/forms/Form';

const ResetPassword = () => {
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [searchParams] = useSearchParams();
  
  const { resetPassword, isLoading } = useAuth();
  const toast = useToastContext();
  const navigate = useNavigate();
  
  // Get token from URL
  const token = searchParams.get('token');
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };
  
  const validate = () => {
    const newErrors = {};
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    try {
      // Note: for demo purposes, just show success message
      //await resetPassword(token, formData.password);
      toast.showSuccess('Password has been reset successfully');
      navigate('/login');
    } catch (error) {
      toast.showError(error.message || 'Failed to reset password');
    }
  };
  
  if (!token) {
    return (
      <div className="text-center">
        <Typography variant={TYPOGRAPHY_VARIANTS.H3} className="mb-4">
          Invalid or Expired Token
        </Typography>
        
        <Typography variant={TYPOGRAPHY_VARIANTS.BODY1} className="mb-6">
          Your password reset link is invalid or has expired.
        </Typography>
        
        <Link to="/forgot-password" className="text-blue-600 hover:text-blue-800">
          Request a new reset link
        </Link>
      </div>
    );
  }
  
  return (
    <div>
      <Typography variant={TYPOGRAPHY_VARIANTS.H2} className="text-center mb-6">
        Set New Password
      </Typography>
      
      <Typography variant={TYPOGRAPHY_VARIANTS.BODY1} className="mb-6">
        Please enter your new password below.
      </Typography>
      
      <Form onSubmit={handleSubmit}>
        <Input
          id="password"
          name="password"
          type="password"
          label="New Password"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          required
          fullWidth
          className="mb-4"
          helperText="Password must be at least 8 characters"
        />
        
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          label="Confirm New Password"
          value={formData.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          required
          fullWidth
          className="mb-6"
        />
        
        <Button
          type="submit"
          isLoading={isLoading}
          fullWidth
          className="mb-4"
        >
          Reset Password
        </Button>
      </Form>
    </div>
  );
};

export default ResetPassword;