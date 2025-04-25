/**
 * Service Registration
 * 
 * This module registers all application services with the DI container.
 */

const container = require('./container');
const { systemLogger } = require('../utils/logger');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Import service class definitions
const ServiceBase = require('../services/ServiceBase');
const FileService = require('../services/FileService');
const TransformationService = require('../services/TransformationService');
const UserService = require('../services/UserService');

// Register database connection
container.register('dbPool', () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
  });
});

// Register logger
container.register('logger', () => systemLogger);

// Register ServiceBase
container.register('serviceBase', function() {
  const ServiceBaseClass = ServiceBase;
  return new ServiceBaseClass(
    this.get('dbPool'),
    this.get('logger')
  );
});

// Register FileService
container.register('fileService', function() {
  const FileServiceClass = FileService;
  return new FileServiceClass(
    this.get('dbPool'),
    this.get('logger')
  );
});

// Register TransformationService
container.register('transformationService', function() {
  const TransformationServiceClass = TransformationService;
  return new TransformationServiceClass(
    this.get('dbPool'),
    this.get('logger')
  );
});

// Register UserService
container.register('userService', function() {
  const UserServiceClass = UserService;
  return new UserServiceClass(
    this.get('dbPool'),
    this.get('logger')
  );
});

// Register utility helpers
container.register('uuid', () => uuidv4);

module.exports = container;