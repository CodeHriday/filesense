import React, { useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import '../styles/PasswordInput.css';
import PropTypes from 'prop-types';

const PasswordInput = ({ 
  id, 
  name, 
  value, 
  onChange, 
  placeholder = "Enter password",
  disabled = false,
  required = false,
  autoFocus = false,
  className = ""
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className={`password-input-wrapper ${className}`}>
      <input
        type={showPassword ? 'text' : 'password'}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        className="password-input"
      />
      <button
        type="button"
        className="password-toggle-btn"
        onClick={togglePasswordVisibility}
        disabled={disabled}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
};
PasswordInput.propTypes = {
  /** HTML id for the input */
  id: PropTypes.string,

  /** Input name attribute */
  name: PropTypes.string,

  /** Controlled value of the password */
  value: PropTypes.string.isRequired,

  /** Change handler */
  onChange: PropTypes.func.isRequired,

  /** Placeholder text */
  placeholder: PropTypes.string,

  /** Disable input and toggle button */
  disabled: PropTypes.bool,

  /** Mark input as required */
  required: PropTypes.bool,

  /** Auto focus on mount */
  autoFocus: PropTypes.bool,

  /** Extra CSS class */
  className: PropTypes.string
};

PasswordInput.defaultProps = {
  placeholder: 'Enter password',
  disabled: false,
  required: false,
  autoFocus: false,
  className: ''
};
export default PasswordInput;
