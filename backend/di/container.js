/**
 * Dependency Injection Container
 * 
 * This module provides a simple dependency injection container to manage
 * service instantiation and dependencies throughout the application.
 */

class DIContainer {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
    this.singletons = new Map();
  }

  /**
   * Register a service factory function
   * 
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that creates the service
   * @param {boolean} singleton - Whether to cache the instance (true) or create new ones (false)
   */
  register(name, factory, singleton = true) {
    if (typeof factory !== 'function') {
      throw new Error(`Factory for service '${name}' must be a function`);
    }
    
    this.factories.set(name, factory);
    
    if (!singleton) {
      // For non-singletons, we'll create a new instance each time
      return;
    }
    
    // Define a getter on the services map that lazily initializes the service
    Object.defineProperty(this.services, name, {
      configurable: true,
      get: () => {
        // Check if we've already created this singleton
        if (this.singletons.has(name)) {
          return this.singletons.get(name);
        }
        
        // Create the service instance
        const instance = this.createInstance(name);
        
        // Cache it for future use
        this.singletons.set(name, instance);
        
        return instance;
      }
    });
  }
  
  /**
   * Create a new instance of a service
   * 
   * @param {string} name - Service name
   * @returns {Object} Service instance
   */
  createInstance(name) {
    const factory = this.factories.get(name);
    
    if (!factory) {
      throw new Error(`Service '${name}' is not registered`);
    }
    
    // Create the service instance by calling the factory with the container as 'this'
    return factory.call(this);
  }
  
  /**
   * Get a service instance
   * 
   * @param {string} name - Service name
   * @returns {Object} Service instance
   */
  get(name) {
    // For singletons, use the getter defined in register()
    if (this.services[name]) {
      return this.services[name];
    }
    
    // For non-singletons, create a new instance
    if (this.factories.has(name)) {
      return this.createInstance(name);
    }
    
    throw new Error(`Service '${name}' is not registered`);
  }
  
  /**
   * Check if a service is registered
   * 
   * @param {string} name - Service name
   * @returns {boolean} Whether the service is registered
   */
  has(name) {
    return this.factories.has(name);
  }
  
  /**
   * Remove a service registration
   * 
   * @param {string} name - Service name
   */
  remove(name) {
    this.factories.delete(name);
    this.singletons.delete(name);
    delete this.services[name];
  }
  
  /**
   * Clear all service registrations
   */
  clear() {
    this.factories.clear();
    this.singletons.clear();
    
    // Reset services object
    for (const key of Object.keys(this.services)) {
      delete this.services[key];
    }
  }
}

// Create and export a singleton container instance
const container = new DIContainer();

module.exports = container;