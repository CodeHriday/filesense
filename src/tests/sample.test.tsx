/**
 * Sample Frontend Test
 * 
 * This test verifies the Vitest configuration is working correctly.
 * Replace with actual tests for your React components.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Simple test component
const TestComponent: React.FC<{ message: string }> = ({ message }) => {
  return <div data-testid="test-message">{message}</div>;
};

describe('Sample Frontend Tests', () => {
  describe('Basic Assertions', () => {
    test('should pass a simple assertion', () => {
      expect(1 + 1).toBe(2);
    });

    test('should handle string comparisons', () => {
      expect('hello world').toContain('world');
    });

    test('should handle array operations', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(arr).toHaveLength(5);
      expect(arr).toContain(3);
    });
  });

  describe('React Component Tests', () => {
    test('should render a simple component', () => {
      render(<TestComponent message="Hello, World!" />);
      
      const element = screen.getByTestId('test-message');
      expect(element).toBeInTheDocument();
      expect(element).toHaveTextContent('Hello, World!');
    });

    test('should handle component props', () => {
      render(<TestComponent message="Custom message" />);
      
      expect(screen.getByText('Custom message')).toBeInTheDocument();
    });
  });

  describe('Mock Functions', () => {
    test('should create and use mock functions', () => {
      const mockFn = vi.fn();
      mockFn('arg1', 'arg2');
      
      expect(mockFn).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should mock return values', () => {
      const mockFn = vi.fn().mockReturnValue('mocked value');
      
      expect(mockFn()).toBe('mocked value');
    });

    test('should mock async functions', async () => {
      const mockAsyncFn = vi.fn().mockResolvedValue('async result');
      
      const result = await mockAsyncFn();
      expect(result).toBe('async result');
    });
  });

  describe('DOM Queries', () => {
    test('should query by role', () => {
      render(
        <button type="button" onClick={() => {}}>
          Click me
        </button>
      );
      
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button).toBeInTheDocument();
    });

    test('should query by text', () => {
      render(<p>Some paragraph text</p>);
      
      expect(screen.getByText(/paragraph text/i)).toBeInTheDocument();
    });
  });
});
