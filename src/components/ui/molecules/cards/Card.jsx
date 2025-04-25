/**
 * Card Component
 * 
 * A versatile card component that can be used to display various types of content
 * with a consistent style. Supports different variants and states.
 */
import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import { Typography, TYPOGRAPHY_VARIANTS } from '../../atoms/typography/Typography';

// Card variants
const VARIANTS = {
  DEFAULT: 'default',
  OUTLINED: 'outlined',
  ELEVATED: 'elevated',
  FLAT: 'flat',
};

// Card components for composition
const CardHeader = ({ 
  className, 
  title, 
  subheader, 
  action, 
  avatar, 
  titleTypographyProps, 
  subheaderTypographyProps,
  ...props
}) => {
  return (
    <div className={clsx('flex items-start p-4', className)} {...props}>
      {avatar && (
        <div className="mr-4 flex-shrink-0">
          {avatar}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <Typography
            variant={TYPOGRAPHY_VARIANTS.H5}
            className="mb-1"
            {...titleTypographyProps}
          >
            {title}
          </Typography>
        )}
        {subheader && (
          <Typography
            variant={TYPOGRAPHY_VARIANTS.BODY2}
            color="muted"
            {...subheaderTypographyProps}
          >
            {subheader}
          </Typography>
        )}
      </div>
      {action && (
        <div className="ml-4 flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};

CardHeader.propTypes = {
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Card title */
  title: PropTypes.node,
  /** Card subheader */
  subheader: PropTypes.node,
  /** Action component (e.g., IconButton) */
  action: PropTypes.node,
  /** Avatar component */
  avatar: PropTypes.node,
  /** Props applied to the title Typography element */
  titleTypographyProps: PropTypes.object,
  /** Props applied to the subheader Typography element */
  subheaderTypographyProps: PropTypes.object,
};

const CardContent = ({ className, children, ...props }) => {
  return (
    <div className={clsx('p-4', className)} {...props}>
      {children}
    </div>
  );
};

CardContent.propTypes = {
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Card content */
  children: PropTypes.node,
};

const CardMedia = ({ className, component = 'div', image, alt, children, ...props }) => {
  const Component = component;
  
  return (
    <Component
      className={clsx('block w-full', className)}
      style={image ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      {...props}
    >
      {image && component === 'img' ? null : children}
    </Component>
  );
};

CardMedia.propTypes = {
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Component to use for the root node */
  component: PropTypes.elementType,
  /** Image URL */
  image: PropTypes.string,
  /** Image alt text */
  alt: PropTypes.string,
  /** Card media content */
  children: PropTypes.node,
};

const CardActions = ({ className, children, ...props }) => {
  return (
    <div className={clsx('flex items-center p-2', className)} {...props}>
      {children}
    </div>
  );
};

CardActions.propTypes = {
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Card actions content */
  children: PropTypes.node,
};

// Main Card component
const Card = forwardRef(({
  children,
  className,
  variant = VARIANTS.DEFAULT,
  onClick,
  raised = false,
  interactive = false,
  ...props
}, ref) => {
  // Base classes
  const baseClasses = 'overflow-hidden rounded-lg';
  
  // Variant classes
  const variantClasses = {
    [VARIANTS.DEFAULT]: 'bg-white border border-gray-200',
    [VARIANTS.OUTLINED]: 'bg-white border border-gray-300',
    [VARIANTS.ELEVATED]: 'bg-white border border-gray-100 shadow-md',
    [VARIANTS.FLAT]: 'bg-gray-50',
  };
  
  // State classes
  const stateClasses = {
    raised: 'shadow-lg',
    interactive: 'cursor-pointer transition-shadow hover:shadow-md',
  };
  
  // Combine all classes
  const cardClasses = clsx(
    baseClasses,
    variantClasses[variant],
    {
      [stateClasses.raised]: raised,
      [stateClasses.interactive]: interactive,
    },
    className
  );
  
  return (
    <div
      ref={ref}
      className={cardClasses}
      onClick={interactive ? onClick : undefined}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

Card.propTypes = {
  /** Card content */
  children: PropTypes.node,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Card variant */
  variant: PropTypes.oneOf(Object.values(VARIANTS)),
  /** Click handler */
  onClick: PropTypes.func,
  /** Elevated appearance */
  raised: PropTypes.bool,
  /** Interactive card with hover effects */
  interactive: PropTypes.bool,
};

// Export all card components
Card.Header = CardHeader;
Card.Content = CardContent;
Card.Media = CardMedia;
Card.Actions = CardActions;

export { Card, VARIANTS as CARD_VARIANTS };
export default Card;