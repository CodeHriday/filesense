import React, { useState, useEffect, useRef } from 'react';
import { useAccessibility } from '../context/AccessibilityContext';
import { FiSettings, FiX } from 'react-icons/fi';
import { MdOutlineAccessibility } from 'react-icons/md';

const AccessibilityWidget = () => {
  const {
    highContrast,
    largeText,
    screenReaderOptimized,
    reducedMotion,
    toggleHighContrast,
    toggleLargeText,
    toggleScreenReaderOptimized,
    toggleReducedMotion,
    resetSettings
  } = useAccessibility();

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key to close menu
  useEffect(() => {
    const handleEscKey = (event) => {
      if (isOpen && event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen]);

  const toggleMenu = () => {
    if (isOpen) {
      closeMenu();
    } else {
      setIsOpen(true);
      setIsClosing(false);
    }
  };

  const closeMenu = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 300); // Match animation duration
  };

  const handleResetClick = () => {
    resetSettings();
  };

  // Focus trap for accessibility menu
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const focusableElements = menuRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    menuRef.current.addEventListener('keydown', handleTabKey);
    firstElement.focus();

    return () => {
      if (menuRef.current) {
        menuRef.current.removeEventListener('keydown', handleTabKey);
      }
    };
  }, [isOpen]);

  return (
    <div className="accessibility-controls" aria-live="polite">
      {/* Skip to content link */}
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      {/* Accessibility Widget Button */}
      <button
        ref={buttonRef}
        className="accessibility-widget"
        onClick={toggleMenu}
        aria-label="Accessibility Options"
        aria-expanded={isOpen}
        aria-controls="accessibility-menu"
      >
        <MdOutlineAccessibility className="accessibility-widget__icon" aria-hidden="true" />
      </button>

      {/* Accessibility Menu */}
      {isOpen && (
        <div
          id="accessibility-menu"
          ref={menuRef}
          className={`accessibility-menu ${isOpen ? 'open' : ''} ${isClosing ? 'closing' : ''}`}
          role="dialog"
          aria-labelledby="accessibility-menu-title"
        >
          <div className="accessibility-menu__header">
            <h2 id="accessibility-menu-title">Accessibility Options</h2>
            <button
              className="accessibility-menu__close"
              onClick={closeMenu}
              aria-label="Close accessibility menu"
            >
              <FiX aria-hidden="true" />
            </button>
          </div>

          {/* High Contrast Option */}
          <div className="accessibility-menu__option">
            <div>
              <div className="accessibility-menu__option-label">High Contrast</div>
              <div className="accessibility-menu__option-description">
                Enhances color contrast for better visibility
              </div>
            </div>
            <label className="accessibility-menu__toggle">
              <input
                type="checkbox"
                checked={highContrast}
                onChange={toggleHighContrast}
                aria-label="Toggle high contrast mode"
              />
              <span className="accessibility-menu__toggle-slider" aria-hidden="true"></span>
            </label>
          </div>

          {/* Large Text Option */}
          <div className="accessibility-menu__option">
            <div>
              <div className="accessibility-menu__option-label">Large Text</div>
              <div className="accessibility-menu__option-description">
                Increases text size for better readability
              </div>
            </div>
            <label className="accessibility-menu__toggle">
              <input
                type="checkbox"
                checked={largeText}
                onChange={toggleLargeText}
                aria-label="Toggle large text mode"
              />
              <span className="accessibility-menu__toggle-slider" aria-hidden="true"></span>
            </label>
          </div>

          {/* Screen Reader Optimization */}
          <div className="accessibility-menu__option">
            <div>
              <div className="accessibility-menu__option-label">Screen Reader Support</div>
              <div className="accessibility-menu__option-description">
                Optimizes content for screen readers
              </div>
            </div>
            <label className="accessibility-menu__toggle">
              <input
                type="checkbox"
                checked={screenReaderOptimized}
                onChange={toggleScreenReaderOptimized}
                aria-label="Toggle screen reader optimizations"
              />
              <span className="accessibility-menu__toggle-slider" aria-hidden="true"></span>
            </label>
          </div>

          {/* Reduced Motion */}
          <div className="accessibility-menu__option">
            <div>
              <div className="accessibility-menu__option-label">Reduced Motion</div>
              <div className="accessibility-menu__option-description">
                Minimizes animations and motion effects
              </div>
            </div>
            <label className="accessibility-menu__toggle">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={toggleReducedMotion}
                aria-label="Toggle reduced motion"
              />
              <span className="accessibility-menu__toggle-slider" aria-hidden="true"></span>
            </label>
          </div>

          {/* Reset Button */}
          <button
            className="accessibility-menu__reset"
            onClick={handleResetClick}
            aria-label="Reset all accessibility settings"
          >
            Reset Settings
          </button>
        </div>
      )}
    </div>
  );
};

export default AccessibilityWidget;