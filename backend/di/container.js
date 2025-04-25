/**
 * Simple Dependency Injection Container
 * 
 * This module provides a lightweight dependency injection container
 * implementation for managing service instances and their dependencies.
 */

/**
 * Creates a new DI container
 * @returns {Object} DI container instance
 */
function createContainer() {
  // Store service registrations
  const registrations = new Map();
  // Track dependency resolution chains to prevent circular dependencies
  const resolutionStack = [];
  
  /**
   * Register a service factory
   * 
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that returns the service instance
   * @param {boolean} singleton - Whether to cache the instance (default: true)
   */
  function register(name, factory, singleton = true) {
    registrations.set(name, { factory, singleton, instance: null });
  }
  
  /**
   * Get a service instance
   * 
   * @param {string} name - Service name
   * @returns {any} Service instance
   * @throws {Error} If service is not registered or circular dependency detected
   */
  function get(name) {
    const registration = registrations.get(name);
    
    if (!registration) {
      throw new Error(`Service '${name}' is not registered`);
    }
    
    // Check for circular dependencies
    if (resolutionStack.includes(name)) {
      throw new Error(`Circular dependency detected: ${resolutionStack.join(' -> ')} -> ${name}`);
    }
    
    // Return cached instance for singletons
    if (registration.singleton && registration.instance) {
      return registration.instance;
    }
    
    // Create new instance with the container as 'this' context
    // This allows factory functions to resolve other dependencies
    try {
      resolutionStack.push(name);
      const instance = registration.factory.call(this);
      resolutionStack.pop();
      
      // Cache instance for singletons
      if (registration.singleton) {
        registration.instance = instance;
      }
      
      return instance;
    } catch (error) {
      resolutionStack.pop();
      throw new Error(`Error creating instance of '${name}': ${error.message}`);
    }
  }
  
  /**
   * Check if a service is registered
   * 
   * @param {string} name - Service name
   * @returns {boolean} Whether the service is registered
   */
  function has(name) {
    return registrations.has(name);
  }
  
  /**
   * Get all registered service names
   * 
   * @returns {Array<string>} Service names
   */
  function getRegistrationNames() {
    return Array.from(registrations.keys());
  }
  
  return {
    register,
    get,
    has,
    getRegistrationNames,
    isConfigured: false
  };
}

// Export a singleton container instance
module.exports = createContainer();