/**
 * Files Page
 * 
 * Displays a list of all files in the system with filtering and sorting options.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Typography, TYPOGRAPHY_VARIANTS } from '../components/ui/atoms/typography/Typography';
import { Card } from '../components/ui/molecules/cards/Card';
import { Button, BUTTON_VARIANTS } from '../components/ui/atoms/buttons/Button';

const Files = () => {
  // This would normally come from API via React Query
  const [files, setFiles] = useState([
    {
      id: '1',
      name: 'sales_data.csv',
      type: 'csv',
      size: '2.4 MB',
      uploadedAt: '2023-04-25T10:30:00Z',
      lastModified: '2023-04-25T10:30:00Z',
      status: 'active',
      qualityScore: 92,
    },
    {
      id: '2',
      name: 'inventory_q2.json',
      type: 'json',
      size: '4.1 MB',
      uploadedAt: '2023-04-24T15:45:00Z', 
      lastModified: '2023-04-24T15:45:00Z',
      status: 'active',
      qualityScore: 87,
    },
    {
      id: '3',
      name: 'customer_feedback.csv',
      type: 'csv',
      size: '1.7 MB',
      uploadedAt: '2023-04-23T09:15:00Z',
      lastModified: '2023-04-23T14:22:00Z',
      status: 'active',
      qualityScore: 78,
    },
  ]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <Typography variant={TYPOGRAPHY_VARIANTS.H1}>
          Files
        </Typography>
        
        <Button variant={BUTTON_VARIANTS.PRIMARY}>
          Upload New File
        </Button>
      </div>
      
      {/* Filter controls would go here */}
      <div className="mb-6">
        <Card>
          <Card.Content>
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <input
                  type="text"
                  id="search"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Search files..."
                />
              </div>
              
              <div className="w-32">
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                  File Type
                </label>
                <select
                  id="type"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">All</option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="parquet">Parquet</option>
                </select>
              </div>
              
              <div className="w-40">
                <label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">
                  Sort By
                </label>
                <select
                  id="sort"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="name">Name</option>
                  <option value="date">Upload Date</option>
                  <option value="size">Size</option>
                  <option value="type">Type</option>
                  <option value="quality">Quality Score</option>
                </select>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
      
      {/* Files list */}
      <div className="space-y-4">
        {files.map((file) => (
          <Card key={file.id}>
            <Card.Content>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* File icon based on type */}
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                    {file.type === 'csv' && 
                      <span className="text-green-600 font-medium">CSV</span>
                    }
                    {file.type === 'json' && 
                      <span className="text-blue-600 font-medium">JSON</span>
                    }
                    {file.type === 'parquet' && 
                      <span className="text-purple-600 font-medium">PARQ</span>
                    }
                  </div>
                  
                  <div>
                    <Link to={`/files/${file.id}`} className="text-lg font-medium text-blue-600 hover:text-blue-800">
                      {file.name}
                    </Link>
                    <div className="text-sm text-gray-500 flex space-x-4">
                      <span>{file.size}</span>
                      <span>Uploaded: {new Date(file.uploadedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <div className="text-right mr-4">
                    <div className="text-sm text-gray-500">Quality Score</div>
                    <div className={`font-medium ${
                      file.qualityScore >= 90 ? 'text-green-600' : 
                      file.qualityScore >= 80 ? 'text-yellow-600' : 
                      'text-red-600'
                    }`}>
                      {file.qualityScore}%
                    </div>
                  </div>
                  
                  <Button variant={BUTTON_VARIANTS.SECONDARY} size="sm">
                    View Details
                  </Button>
                </div>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>
      
      {/* Pagination controls would go here */}
      <div className="mt-6 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          Showing {files.length} of {files.length} files
        </div>
        
        <div className="flex space-x-2">
          <Button variant={BUTTON_VARIANTS.SECONDARY} disabled>
            Previous
          </Button>
          <Button variant={BUTTON_VARIANTS.SECONDARY}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Files;