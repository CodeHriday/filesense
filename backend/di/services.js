/**
 * Service Registration
 * 
 * This module registers all application services with the DI container.
 */

const fs = require('fs');
const path = require('path');

/**
 * Register all domain services with the DI container
 * 
 * @param {Object} container - DI container
 * @returns {Object} Updated container
 */
function registerServices(container) {
  // Auto-discover service classes from the services directory
  const servicesDir = path.join(__dirname, '..', 'services');
  
  if (fs.existsSync(servicesDir)) {
    const serviceFiles = fs.readdirSync(servicesDir)
      .filter(file => 
        (file.endsWith('Service.js') || file.endsWith('Repository.js')) && 
        file !== 'ServiceBase.js'
      );
      
    // For each service file, import the service and register it
    for (const file of serviceFiles) {
      try {
        // Skip ServiceBase.js which is handled separately
        if (file === 'ServiceBase.js') continue;
        
        const ServiceClass = require(path.join(servicesDir, file));
        const serviceName = file.replace('.js', '').charAt(0).toLowerCase() + file.replace('.js', '').slice(1);
        
        // Only register if it's a class/constructor function
        if (typeof ServiceClass === 'function') {
          // Special handling for AIService which needs fileService as a dependency
          if (file === 'AIService.js') {
            container.register(serviceName, function() {
              return new ServiceClass(
                this.get('fileService'),
                this.get('dbPool')
              );
            });
          } else {
            container.register(serviceName, function() {
              // Create instance with dependencies
              return new ServiceClass(
                this.get('dbPool'),
                this.get('logger')
              );
            });
          }
          
          console.log(`Registered service: ${serviceName}`);
        }
      } catch (error) {
        console.error(`Error registering service from file ${file}:`, error);
      }
    }
  }
  
  return container;
}

module.exports = {
  registerServices
};