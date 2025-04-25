/**
 * Error module exports
 * 
 * This file exports all error classes for easy importing throughout the application.
 */

const AppError = require('./AppError');
const ValidationError = require('./ValidationError');
const NotFoundError = require('./NotFoundError');
const AuthenticationError = require('./AuthenticationError');
const AuthorizationError = require('./AuthorizationError');
const DatabaseError = require('./DatabaseError');
const FileOperationError = require('./FileOperationError');
const BusinessLogicError = require('./BusinessLogicError');

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  FileOperationError,
  BusinessLogicError
};