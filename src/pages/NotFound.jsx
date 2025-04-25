/**
 * Not Found Page
 * 
 * 404 page for routes that don't exist.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Typography, TYPOGRAPHY_VARIANTS } from '../components/ui/atoms/typography/Typography';
import { Button, BUTTON_VARIANTS } from '../components/ui/atoms/buttons/Button';

const NotFound = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md text-center">
        <svg className="w-24 h-24 mx-auto text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        
        <Typography variant={TYPOGRAPHY_VARIANTS.H1} className="mb-4">
          404
        </Typography>
        
        <Typography variant={TYPOGRAPHY_VARIANTS.H2} className="mb-6">
          Page Not Found
        </Typography>
        
        <Typography variant={TYPOGRAPHY_VARIANTS.BODY1} className="mb-8">
          The page you're looking for doesn't exist or has been moved.
        </Typography>
        
        <Link to="/">
          <Button variant={BUTTON_VARIANTS.PRIMARY}>
            Go to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;