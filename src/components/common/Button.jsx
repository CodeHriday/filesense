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

export default Button;