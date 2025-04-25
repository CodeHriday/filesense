/**
 * Typography Component
 * 
 * A flexible typography component that supports different variants and styles.
 * This is used for consistent text rendering throughout the application.
 */
import React from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';

// Typography variants
const VARIANTS = {
  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  H4: 'h4',
  H5: 'h5',
  H6: 'h6',
  SUBTITLE1: 'subtitle1',
  SUBTITLE2: 'subtitle2',
  BODY1: 'body1',
  BODY2: 'body2',
  CAPTION: 'caption',
  OVERLINE: 'overline',
};

// Typography colors
const COLORS = {
  DEFAULT: 'default',
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
  MUTED: 'muted',
};

// Typography aligns
const ALIGNS = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
  JUSTIFY: 'justify',
};

const Typography = ({
  children,
  variant = VARIANTS.BODY1,
  color = COLORS.DEFAULT,
  align = ALIGNS.LEFT,
  className,
  component,
  noWrap = false,
  gutterBottom = false,
  ...props
}) => {
  // Map variant to HTML element
  const variantMapping = {
    [VARIANTS.H1]: 'h1',
    [VARIANTS.H2]: 'h2',
    [VARIANTS.H3]: 'h3',
    [VARIANTS.H4]: 'h4',
    [VARIANTS.H5]: 'h5',
    [VARIANTS.H6]: 'h6',
    [VARIANTS.SUBTITLE1]: 'h6',
    [VARIANTS.SUBTITLE2]: 'h6',
    [VARIANTS.BODY1]: 'p',
    [VARIANTS.BODY2]: 'p',
    [VARIANTS.CAPTION]: 'span',
    [VARIANTS.OVERLINE]: 'span',
  };
  
  // Use provided component or default from variant mapping
  const Component = component || variantMapping[variant];
  
  // Variant classes
  const variantClasses = {
    [VARIANTS.H1]: 'text-4xl font-bold',
    [VARIANTS.H2]: 'text-3xl font-bold',
    [VARIANTS.H3]: 'text-2xl font-bold',
    [VARIANTS.H4]: 'text-xl font-semibold',
    [VARIANTS.H5]: 'text-lg font-semibold',
    [VARIANTS.H6]: 'text-base font-semibold',
    [VARIANTS.SUBTITLE1]: 'text-lg font-medium',
    [VARIANTS.SUBTITLE2]: 'text-base font-medium',
    [VARIANTS.BODY1]: 'text-base',
    [VARIANTS.BODY2]: 'text-sm',
    [VARIANTS.CAPTION]: 'text-xs',
    [VARIANTS.OVERLINE]: 'text-xs uppercase tracking-wider',
  };
  
  // Color classes
  const colorClasses = {
    [COLORS.DEFAULT]: 'text-gray-900',
    [COLORS.PRIMARY]: 'text-blue-600',
    [COLORS.SECONDARY]: 'text-purple-600',
    [COLORS.SUCCESS]: 'text-green-600',
    [COLORS.WARNING]: 'text-yellow-600',
    [COLORS.ERROR]: 'text-red-600',
    [COLORS.INFO]: 'text-blue-400',
    [COLORS.MUTED]: 'text-gray-500',
  };
  
  // Align classes
  const alignClasses = {
    [ALIGNS.LEFT]: 'text-left',
    [ALIGNS.CENTER]: 'text-center',
    [ALIGNS.RIGHT]: 'text-right',
    [ALIGNS.JUSTIFY]: 'text-justify',
  };
  
  // Other classes
  const utilityClasses = {
    noWrap: 'truncate',
    gutterBottom: 'mb-2',
  };
  
  // Combine all classes
  const typographyClasses = clsx(
    variantClasses[variant],
    colorClasses[color],
    alignClasses[align],
    {
      [utilityClasses.noWrap]: noWrap,
      [utilityClasses.gutterBottom]: gutterBottom,
    },
    className
  );
  
  return (
    <Component className={typographyClasses} {...props}>
      {children}
    </Component>
  );
};

Typography.propTypes = {
  /** Content to display */
  children: PropTypes.node.isRequired,
  /** Typography variant */
  variant: PropTypes.oneOf(Object.values(VARIANTS)),
  /** Text color */
  color: PropTypes.oneOf(Object.values(COLORS)),
  /** Text alignment */
  align: PropTypes.oneOf(Object.values(ALIGNS)),
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Override the rendered element */
  component: PropTypes.elementType,
  /** Prevent text wrapping */
  noWrap: PropTypes.bool,
  /** Add bottom margin */
  gutterBottom: PropTypes.bool,
};

// Export the component and its constants
export { Typography, VARIANTS as TYPOGRAPHY_VARIANTS, COLORS as TYPOGRAPHY_COLORS, ALIGNS as TYPOGRAPHY_ALIGNS };
export default Typography;