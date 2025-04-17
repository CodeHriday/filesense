import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="logo">
        <Link to="/">
          <h1>Data File Observatory</h1>
        </Link>
      </div>
      <div className="header-actions">
        <Link to="/upload" className="btn btn-primary">
          Upload File
        </Link>
      </div>
    </header>
  );
}

export default Header;