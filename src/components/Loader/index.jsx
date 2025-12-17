import React from 'react';
import PropTypes from 'prop-types';
import './Loader.css';

const Loader = ({ size, message }) => {
  return (
    <div className="loader-container">
      <div className={`loader-spinner loader-${size}`}></div>
      {message && <p className="loader-message">{message}</p>}
    </div>
  );
};

Loader.propTypes = {
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  message: PropTypes.string
};

Loader.defaultProps = {
  size: 'medium',
  message: 'Loading...'
};

export default Loader;