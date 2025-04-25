/**
 * Register Page
 * 
 * A page that allows users to create a new account.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToastContext } from '../../context/ToastContext';
import { Button } from '../../components/ui/atoms/buttons/Button';
import { Input } from '../../components/ui/atoms/inputs/Input';
import { Typography, TYPOGRAPHY_VARIANTS } from '../../components/ui/atoms/typography/Typography';
import { Form } from '../../components/ui/molecules/forms/Form';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  
  const { register, isLoading } = useAuth();
  const toast = useToastContext();
  const navigate = useNavigate();
  
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
    
    if (!formData.username) {
      newErrors.username = 'Username is required';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
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
      await register(formData);
      toast.showSuccess('Account created successfully');
      navigate('/login');
    } catch (error) {
      toast.showError(error.message || 'Registration failed');
    }
  };
  
  return (
    <div>
      <Typography variant={TYPOGRAPHY_VARIANTS.H2} className="text-center mb-6">
        Create Account
      </Typography>
      
      <Form onSubmit={handleSubmit}>
        <Input
          id="username"
          name="username"
          label="Username"
          value={formData.username}
          onChange={handleChange}
          error={errors.username}
          required
          fullWidth
          className="mb-4"
        />
        
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          required
          fullWidth
          className="mb-4"
        />
        
        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
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
          label="Confirm Password"
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
          Create Account
        </Button>
      </Form>
      
      <div className="mt-6 text-center">
        <Typography variant={TYPOGRAPHY_VARIANTS.BODY2}>
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-800">
            Log in
          </Link>
        </Typography>
      </div>
    </div>
  );
};

export default Register;