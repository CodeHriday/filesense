import React from 'react';
import { Card } from '../components/Card';
import './AlertsConfig.css';

export const AlertsConfig = () => {
  return (
    <div className="alerts-config-container">
      <h1 className="page-title">Alerts Configuration</h1>
      
      <Card title="Coming Soon">
        <div className="coming-soon">
          <div className="coming-soon-icon">🔔</div>
          <h2>Alerts Configuration</h2>
          <p>This feature is under development and will be available soon.</p>
          <p>You'll be able to configure alerts for:</p>
          <ul>
            <li>Data quality thresholds</li>
            <li>Schema changes</li>
            <li>Freshness monitoring</li>
            <li>Custom rule violations</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};