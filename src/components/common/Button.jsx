import React from 'react';
import './Button.css';

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
    ${primary ? 'btn-primary' : ''} 
    ${secondary ? 'btn-secondary' : ''} 
    ${small ? 'btn-small' : ''} 
    ${large ? 'btn-large' : ''} 
    ${icon ? 'btn-with-icon' : ''}
  `.trim();

  return (
    <button
      className={buttonClass}
      onClick={onClick}
      disabled={disabled}
      type={type}
      {...rest}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      <span className="btn-text">{children}</span>
    </button>
  );
};

export default Button;