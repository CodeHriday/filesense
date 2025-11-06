import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import queryClient from './lib/react-query';
import App from './App';
import './index.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
    {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
);