"""
Advanced Logging Utility

This module provides structured logging capabilities for the application
with support for different log levels, contextual logging, and various outputs.
"""

import os
import sys
import json
import logging
import logging.handlers
from datetime import datetime, timezone
import concurrent.futures
from functools import wraps
import time
import traceback

# Ensure logs directory exists
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)

# Configure logging format
LOGGING_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# Configure file handlers
file_handler = logging.handlers.RotatingFileHandler(
    os.path.join(log_dir, 'application.log'),
    maxBytes=10485760,  # 10MB
    backupCount=10
)
file_handler.setFormatter(logging.Formatter(LOGGING_FORMAT, DATE_FORMAT))

# Configure error file handler
error_file_handler = logging.handlers.RotatingFileHandler(
    os.path.join(log_dir, 'error.log'),
    maxBytes=10485760,  # 10MB
    backupCount=10
)
error_file_handler.setLevel(logging.ERROR)
error_file_handler.setFormatter(logging.Formatter(LOGGING_FORMAT, DATE_FORMAT))

# Configure console handler to stderr to avoid mixing with stdout JSON output
console_handler = logging.StreamHandler(sys.stderr)
console_handler.setFormatter(logging.Formatter(LOGGING_FORMAT, DATE_FORMAT))

# Configure the root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
root_logger.addHandler(file_handler)
root_logger.addHandler(error_file_handler)
root_logger.addHandler(console_handler)

# Create specialized loggers
file_logger = logging.getLogger('file_processing')
transformation_logger = logging.getLogger('transformations')
quality_logger = logging.getLogger('quality_checks')
data_logger = logging.getLogger('data_processing')


class AsyncLogHandler:
    """Handler for asynchronous logging to avoid I/O bottlenecks."""
    
    def __init__(self):
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        
    def log_async(self, logger, level, message, **kwargs):
        """Log asynchronously using a thread pool."""
        self.executor.submit(self._log, logger, level, message, kwargs)
        
    def _log(self, logger, level, message, kwargs):
        """Internal method to perform actual logging."""
        if level == 'debug':
            logger.debug(message, **kwargs)
        elif level == 'info':
            logger.info(message, **kwargs)
        elif level == 'warning':
            logger.warning(message, **kwargs)
        elif level == 'error':
            logger.error(message, **kwargs)
        elif level == 'critical':
            logger.critical(message, **kwargs)
            
    def shutdown(self):
        """Properly shutdown the thread pool."""
        self.executor.shutdown(wait=True)


# Create async handler instance
async_handler = AsyncLogHandler()


def log_execution_time(logger=None):
    """
    Decorator to log the execution time of a function.
    
    Args:
        logger: The logger to use. If None, uses the root logger.
    """
    if logger is None:
        logger = root_logger
        
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                end_time = time.time()
                execution_time = end_time - start_time
                logger.info(f"{func.__name__} executed in {execution_time:.2f} seconds")
                return result
            except Exception as e:
                end_time = time.time()
                execution_time = end_time - start_time
                logger.error(
                    f"{func.__name__} failed after {execution_time:.2f} seconds with error: {str(e)}\n"
                    f"Traceback: {traceback.format_exc()}"
                )
                raise
        return wrapper
    return decorator


def setup_structured_logging(log_to_file=True, log_level=logging.INFO):
    """Configure logging with JSON structured output for better parsing."""
    class JsonFormatter(logging.Formatter):
        def format(self, record):
            log_record = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module,
                "function": record.funcName,
                "line": record.lineno
            }
            
            # Add exception info if present
            if record.exc_info:
                log_record["exception"] = {
                    "type": record.exc_info[0].__name__,
                    "message": str(record.exc_info[1]),
                    "traceback": traceback.format_exception(*record.exc_info)
                }
                
            # Add extra attributes
            for key, value in record.__dict__.items():
                if key not in {
                    "args", "asctime", "created", "exc_info", "exc_text", "filename",
                    "funcName", "id", "levelname", "levelno", "lineno", "module",
                    "msecs", "message", "msg", "name", "pathname", "process",
                    "processName", "relativeCreated", "stack_info", "thread", "threadName"
                }:
                    log_record[key] = value
                    
            return json.dumps(log_record)
    
    # Create JSON file handler
    if log_to_file:
        json_handler = logging.handlers.RotatingFileHandler(
            os.path.join(log_dir, 'structured.json'),
            maxBytes=10485760,  # 10MB
            backupCount=5
        )
        json_handler.setFormatter(JsonFormatter())
        json_handler.setLevel(log_level)
        root_logger.addHandler(json_handler)


# Initialize structured logging
setup_structured_logging()
        

def get_logger(name=None):
    """Get a logger with the specified name."""
    if name is None:
        return root_logger
    return logging.getLogger(name)


# Export symbols
__all__ = [
    'root_logger', 'file_logger', 'transformation_logger', 
    'quality_logger', 'data_logger', 'log_execution_time',
    'async_handler', 'get_logger'
]