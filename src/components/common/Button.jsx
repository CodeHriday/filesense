import React from 'react';
import './Button.css';
import PropTypes from 'prop-types';

const Button = ({
  children,
  primary,
  secondary,
  small,
  large,
  icon,
  onClick,
  disabled,
  type = 'button',
  ...rest
}) => {
  const buttonClass = `
    btn 
    ${primary === true ? 'btn-primary' : ''} 
    ${secondary === true ? 'btn-secondary' : ''} 
    ${small === true ? 'btn-small' : ''} 
    ${large === true ? 'btn-large' : ''} 
    ${icon ? 'btn-with-icon' : ''}
  `.trim().replace(/\s+/g, ' ');

  const handleClick = (e) => {
    console.log("Button clicked!");
    if (onClick) {
      onClick(e);
    }
  };
  
  return (
    <button
      className={buttonClass}
      onClick={handleClick}
      disabled={disabled}
      type={type}
      {...rest}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      <span className="btn-text">{children}</span>
    </button>
  );
};
Button.propTypes = {
  children: PropTypes.node.isRequired,
  primary: PropTypes.bool,
  secondary: PropTypes.bool,
  small: PropTypes.bool,
  large: PropTypes.bool,
  icon: PropTypes.node,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset'])
};

Button.defaultProps = {
  primary: false,
  secondary: false,
  small: false,
  large: false,
  disabled: false,
  type: 'button'
};

export default Button;