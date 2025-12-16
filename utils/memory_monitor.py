"""
Memory Monitoring and Circuit Breaker System (Python)

Prevents system crashes from memory exhaustion during file processing by:
- Real-time memory tracking with psutil
- Circuit breaker pattern (reject processing when memory high)
- Automatic recovery when memory drops
- Configurable thresholds via environment variables

Cloud-ready: Works in any environment (Replit, AWS Lambda, GCP Cloud Functions)
"""

import os
import psutil
import time
from datetime import datetime
from typing import Dict, Any, Tuple
from utils.logger import file_logger


# Configuration from environment variables
MAX_MEMORY_PERCENT = int(os.getenv('MAX_MEMORY_PERCENT', '85'))
WARNING_MEMORY_PERCENT = int(os.getenv('WARNING_MEMORY_PERCENT', '75'))
CIRCUIT_BREAKER_RECOVERY_PERCENT = int(os.getenv('CIRCUIT_BREAKER_RECOVERY_PERCENT', '70'))

# Circuit breaker state
_circuit_breaker_open = False
_memory_stats = {
    'current': 0,
    'peak': 0,
    'checks': 0,
    'breaker_trips': 0
}


def get_memory_usage() -> Dict[str, Any]:
    """
    Get current system and process memory usage.
    
    Returns:
        Dict with memory statistics
    """
    # System memory
    virtual_mem = psutil.virtual_memory()
    
    # Process memory
    process = psutil.Process()
    process_mem = process.memory_info()
    
    return {
        'total_mb': round(virtual_mem.total / 1024 / 1024, 2),
        'available_mb': round(virtual_mem.available / 1024 / 1024, 2),
        'used_mb': round(virtual_mem.used / 1024 / 1024, 2),
        'usage_percent': round(virtual_mem.percent, 2),
        'process_rss_mb': round(process_mem.rss / 1024 / 1024, 2),
        'process_vms_mb': round(process_mem.vms / 1024 / 1024, 2),
        'timestamp': datetime.now().isoformat()
    }


def check_memory_status() -> Dict[str, Any]:
    """
    Check if memory usage is within safe limits.
    
    Returns:
        Dict with status, action, and usage details
    """
    global _circuit_breaker_open, _memory_stats
    
    usage = get_memory_usage()
    usage_percent = usage['usage_percent']
    
    _memory_stats['current'] = usage_percent
    _memory_stats['checks'] += 1
    
    # Update peak memory
    if usage_percent > _memory_stats['peak']:
        _memory_stats['peak'] = usage_percent
    
    # Determine status
    status = 'ok'
    action = 'none'
    
    if usage_percent >= MAX_MEMORY_PERCENT:
        status = 'critical'
        action = 'reject'
        
        if not _circuit_breaker_open:
            _circuit_breaker_open = True
            _memory_stats['breaker_trips'] += 1
            file_logger.error(
                f"🔴 CIRCUIT BREAKER OPENED: Memory at {usage_percent}%",
                extra={'memory_usage': usage, 'threshold': MAX_MEMORY_PERCENT}
            )
    elif usage_percent >= WARNING_MEMORY_PERCENT:
        status = 'warning'
        action = 'warn'
        file_logger.warning(
            f"⚠️  High memory usage: {usage_percent}%",
            extra={'memory_usage': usage, 'threshold': WARNING_MEMORY_PERCENT}
        )
    elif usage_percent <= CIRCUIT_BREAKER_RECOVERY_PERCENT and _circuit_breaker_open:
        _circuit_breaker_open = False
        file_logger.info(
            f"🟢 CIRCUIT BREAKER CLOSED: Memory recovered to {usage_percent}%",
            extra={'memory_usage': usage}
        )
    
    return {
        'status': status,
        'action': action,
        'usage': usage,
        'circuit_breaker_open': _circuit_breaker_open,
        'thresholds': {
            'warning': WARNING_MEMORY_PERCENT,
            'critical': MAX_MEMORY_PERCENT,
            'recovery': CIRCUIT_BREAKER_RECOVERY_PERCENT
        }
    }


def is_circuit_breaker_open() -> bool:
    """Check if circuit breaker is currently open."""
    return _circuit_breaker_open


def check_before_processing(file_size_mb: float = 0) -> Tuple[bool, str]:
    """
    Check if it's safe to process a file given its size.
    
    Args:
        file_size_mb: Estimated file size in MB
        
    Returns:
        Tuple of (can_process, reason)
    """
    status = check_memory_status()
    
    if status['circuit_breaker_open']:
        return False, f"Circuit breaker open - memory at {status['usage']['usage_percent']}%"
    
    # Estimate memory needed (file size * 2 for processing overhead)
    estimated_memory_needed = file_size_mb * 2
    available_memory = status['usage']['available_mb']
    
    if estimated_memory_needed > available_memory:
        return False, f"Insufficient memory: need ~{estimated_memory_needed}MB, have {available_memory}MB"
    
    # Check if processing would push us over threshold
    projected_usage = status['usage']['used_mb'] + estimated_memory_needed
    projected_percent = (projected_usage / status['usage']['total_mb']) * 100
    
    if projected_percent > MAX_MEMORY_PERCENT:
        return False, f"Would exceed threshold: projected {projected_percent:.1f}% > {MAX_MEMORY_PERCENT}%"
    
    return True, "OK"


def get_stats() -> Dict[str, Any]:
    """
    Get memory statistics and circuit breaker status.
    
    Returns:
        Dict with statistics
    """
    return {
        **_memory_stats,
        'circuit_breaker_open': _circuit_breaker_open,
        'last_check': get_memory_usage(),
        'thresholds': {
            'warning': WARNING_MEMORY_PERCENT,
            'critical': MAX_MEMORY_PERCENT,
            'recovery': CIRCUIT_BREAKER_RECOVERY_PERCENT
        }
    }


def log_memory_status():
    """Log current memory status with emoji indicator."""
    status = check_memory_status()
    usage = status['usage']
    
    if status['status'] == 'critical':
        emoji = '🔴'
    elif status['status'] == 'warning':
        emoji = '🟡'
    else:
        emoji = '🟢'
    breaker_status = 'OPEN' if status['circuit_breaker_open'] else 'CLOSED'
    
    file_logger.info(
        f"{emoji} Memory: {usage['usage_percent']}% | "
        f"Used: {usage['used_mb']}MB / {usage['total_mb']}MB | "
        f"Process: {usage['process_rss_mb']}MB | "
        f"Breaker: {breaker_status}",
        extra={'memory_stats': usage}
    )


class MemoryGuard:
    """
    Context manager for memory-sensitive operations.
    
    Usage:
        with MemoryGuard(file_size_mb=100) as guard:
            # Process file
            if guard.should_stop():
                break
    """
    
    def __init__(self, file_size_mb: float = 0, check_interval: int = 10):
        """
        Initialize memory guard.
        
        Args:
            file_size_mb: Expected file size
            check_interval: Check memory every N operations
        """
        self.file_size_mb = file_size_mb
        self.check_interval = check_interval
        self.operation_count = 0
        self.start_memory = None
        self.should_abort = False
        
    def __enter__(self):
        """Enter context - check if we can proceed."""
        can_proceed, reason = check_before_processing(self.file_size_mb)
        
        if not can_proceed:
            file_logger.error(f"Memory guard blocked operation: {reason}")
            raise MemoryError(f"Cannot proceed with operation: {reason}")
        
        self.start_memory = get_memory_usage()
        file_logger.info(
            f"Memory guard started: {self.start_memory['usage_percent']}% usage",
            extra={'file_size_mb': self.file_size_mb}
        )
        
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context - log memory change."""
        if self.start_memory is None:
            return  # __enter__ raised an exception before setting start_memory
            
        end_memory = get_memory_usage()
        memory_delta = end_memory['usage_percent'] - self.start_memory['usage_percent']
        
        file_logger.info(
            f"Memory guard completed: {end_memory['usage_percent']}% usage "
            f"(delta: {memory_delta:+.1f}%)",
            extra={
                'start_usage': self.start_memory['usage_percent'],
                'end_usage': end_memory['usage_percent'],
                'delta': memory_delta
            }
        )
    
    def check(self):
        """Periodically check if we should stop due to memory pressure."""
        self.operation_count += 1
        
        if self.operation_count % self.check_interval == 0:
            status = check_memory_status()
            
            if status['circuit_breaker_open']:
                self.should_abort = True
                file_logger.warning(
                    "Memory guard: Circuit breaker opened during operation",
                    extra={'usage': status['usage']}
                )
    
    def should_stop(self) -> bool:
        """Check if operation should stop."""
        return self.should_abort


def reduce_chunk_size(current_chunk_size: int, usage_percent: float) -> int:
    """
    Reduce chunk size based on current memory usage.
    
    Args:
        current_chunk_size: Current chunk size
        usage_percent: Current memory usage percentage
        
    Returns:
        Reduced chunk size
    """
    if usage_percent >= MAX_MEMORY_PERCENT - 5:
        # Critical - reduce to 20%
        return max(1000, current_chunk_size // 5)
    elif usage_percent >= WARNING_MEMORY_PERCENT:
        # Warning - reduce to 50%
        return max(5000, current_chunk_size // 2)
    else:
        return current_chunk_size


# Export main functions
__all__ = [
    'get_memory_usage',
    'check_memory_status',
    'is_circuit_breaker_open',
    'check_before_processing',
    'get_stats',
    'log_memory_status',
    'MemoryGuard',
    'reduce_chunk_size'
]
