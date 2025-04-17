import React from 'react';
import './Header.css';

export const Header = () => {
  return (
    <header className="app-header">
      <div className="container">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">📊</span>
            <h1 className="logo-text">Data File Observatory</h1>
          </div>
          
          <div className="header-actions">
            <button className="btn-icon" title="Settings">
              ⚙️
            </button>
            <button className="btn-icon" title="Help">
              ❓
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};