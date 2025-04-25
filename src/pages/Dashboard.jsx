/**
 * Dashboard Page
 * 
 * Main dashboard page displaying key metrics and information.
 */
import React from 'react';
import { Typography, TYPOGRAPHY_VARIANTS } from '../components/ui/atoms/typography/Typography';
import { Card } from '../components/ui/molecules/cards/Card';

const Dashboard = () => {
  return (
    <div>
      <Typography variant={TYPOGRAPHY_VARIANTS.H1} className="mb-6">
        Dashboard
      </Typography>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Files Overview Card */}
        <Card>
          <Card.Header
            title="Files Overview"
            subheader="Summary of file status"
          />
          <Card.Content>
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between">
                <span>Total Files</span>
                <span className="font-semibold">24</span>
              </div>
              <div className="flex justify-between">
                <span>Last Upload</span>
                <span className="font-semibold">2 hours ago</span>
              </div>
              <div className="flex justify-between">
                <span>File Types</span>
                <span className="font-semibold">CSV, JSON, Parquet</span>
              </div>
            </div>
          </Card.Content>
        </Card>
        
        {/* Quality Metrics Card */}
        <Card>
          <Card.Header
            title="Quality Metrics"
            subheader="Overall data quality"
          />
          <Card.Content>
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between">
                <span>Average Quality Score</span>
                <span className="font-semibold text-green-600">92%</span>
              </div>
              <div className="flex justify-between">
                <span>Completeness</span>
                <span className="font-semibold text-green-600">98%</span>
              </div>
              <div className="flex justify-between">
                <span>Issues Detected</span>
                <span className="font-semibold text-yellow-600">3</span>
              </div>
            </div>
          </Card.Content>
        </Card>
        
        {/* Processes Card */}
        <Card>
          <Card.Header
            title="Processes"
            subheader="Workflow status"
          />
          <Card.Content>
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between">
                <span>Active Processes</span>
                <span className="font-semibold">5</span>
              </div>
              <div className="flex justify-between">
                <span>Completed</span>
                <span className="font-semibold text-green-600">12</span>
              </div>
              <div className="flex justify-between">
                <span>Failed</span>
                <span className="font-semibold text-red-600">1</span>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
      
      {/* Recent Activity Section */}
      <div className="mb-8">
        <Typography variant={TYPOGRAPHY_VARIANTS.H2} className="mb-4">
          Recent Activity
        </Typography>
        <Card>
          <Card.Content>
            <ul className="divide-y divide-gray-200">
              <li className="py-3">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">sales_data.csv uploaded</p>
                    <p className="text-sm text-gray-500">12,345 rows processed</p>
                  </div>
                  <p className="text-sm text-gray-500">10 minutes ago</p>
                </div>
              </li>
              <li className="py-3">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">Data validation completed</p>
                    <p className="text-sm text-gray-500">inventory_q2.json</p>
                  </div>
                  <p className="text-sm text-gray-500">1 hour ago</p>
                </div>
              </li>
              <li className="py-3">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">Schema change detected</p>
                    <p className="text-sm text-gray-500">customer_feedback.csv</p>
                  </div>
                  <p className="text-sm text-gray-500">3 hours ago</p>
                </div>
              </li>
            </ul>
          </Card.Content>
        </Card>
      </div>
      
      {/* Alerts Section */}
      <div>
        <Typography variant={TYPOGRAPHY_VARIANTS.H2} className="mb-4">
          Alerts
        </Typography>
        <Card>
          <Card.Content>
            {/* No alerts placeholder */}
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <Typography variant={TYPOGRAPHY_VARIANTS.BODY1}>
                No active alerts at this time
              </Typography>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;