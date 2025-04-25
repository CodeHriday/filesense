/**
 * Login Page
 * 
 * A page that allows users to log in to the application.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToastContext } from '../../context/ToastContext';
import { Button } from '../../components/ui/atoms/buttons/Button';
import { Input } from '../../components/ui/atoms/inputs/Input';
import { Typography, TYPOGRAPHY_VARIANTS } from '../../components/ui/atoms/typography/Typography';
import { Form } from '../../components/ui/molecules/forms/Form';

const Login = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  
  const { login, isLoading } = useAuth();
  const toast = useToastContext();
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
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
    
    if (!credentials.username) {
      newErrors.username = 'Username is required';
    }
    
    if (!credentials.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    try {
      await login(credentials);
      toast.showSuccess('Logged in successfully');
      navigate('/dashboard');
    } catch (error) {
      toast.showError(error.message || 'Login failed');
    }
  };
  
  return (
    <div>
      <Typography variant={TYPOGRAPHY_VARIANTS.H2} className="text-center mb-6">
        Log In
      </Typography>
      
      <Form onSubmit={handleSubmit}>
        <Input
          id="username"
          name="username"
          label="Username"
          value={credentials.username}
          onChange={handleChange}
          error={errors.username}
          required
          fullWidth
          className="mb-4"
        />
        
        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          value={credentials.password}
          onChange={handleChange}
          error={errors.password}
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
          Log In
        </Button>
      </Form>
      
      <div className="mt-6 text-center">
        <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-800">
          Forgot password?
        </Link>
        <div className="mt-4">
          <Typography variant={TYPOGRAPHY_VARIANTS.BODY2}>
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:text-blue-800">
              Sign up
            </Link>
          </Typography>
        </div>
      </div>
    </div>
  );
};

export default Login;