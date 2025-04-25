/**
 * Forgot Password Page
 * 
 * A page that allows users to request a password reset.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToastContext } from '../../context/ToastContext';
import { Button } from '../../components/ui/atoms/buttons/Button';
import { Input } from '../../components/ui/atoms/inputs/Input';
import { Typography, TYPOGRAPHY_VARIANTS } from '../../components/ui/atoms/typography/Typography';
import { Form } from '../../components/ui/molecules/forms/Form';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  const { requestPasswordReset, isLoading } = useAuth();
  const toast = useToastContext();
  
  const handleChange = (e) => {
    setEmail(e.target.value);
    setError('');
  };
  
  const validate = () => {
    if (!email) {
      setError('Email is required');
      return false;
    }
    
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Email is invalid');
      return false;
    }
    
    return true;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    try {
      // Note: for demo purposes, just show success message
      //await requestPasswordReset(email);
      setSubmitted(true);
      toast.showSuccess('Password reset instructions sent');
    } catch (error) {
      toast.showError(error.message || 'Failed to send reset instructions');
    }
  };
  
  if (submitted) {
    return (
      <div className="text-center">
        <Typography variant={TYPOGRAPHY_VARIANTS.H3} className="mb-4">
          Check Your Email
        </Typography>
        
        <Typography variant={TYPOGRAPHY_VARIANTS.BODY1} className="mb-6">
          We've sent password reset instructions to {email}. Please check your email.
        </Typography>
        
        <Link to="/login" className="text-blue-600 hover:text-blue-800">
          Return to login
        </Link>
      </div>
    );
  }
  
  return (
    <div>
      <Typography variant={TYPOGRAPHY_VARIANTS.H2} className="text-center mb-6">
        Reset Password
      </Typography>
      
      <Typography variant={TYPOGRAPHY_VARIANTS.BODY1} className="mb-6">
        Enter your email address and we'll send you instructions to reset your password.
      </Typography>
      
      <Form onSubmit={handleSubmit}>
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          value={email}
          onChange={handleChange}
          error={error}
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
          Send Reset Instructions
        </Button>
      </Form>
      
      <div className="mt-6 text-center">
        <Typography variant={TYPOGRAPHY_VARIANTS.BODY2}>
          <Link to="/login" className="text-blue-600 hover:text-blue-800">
            Back to login
          </Link>
        </Typography>
      </div>
    </div>
  );
};

export default ForgotPassword;