"""
Anomaly Service - Database integration for ML anomaly detection
Handles storing and retrieving anomalies from the database
"""

import psycopg2
import psycopg2.extras
from typing import Dict, List, Any, Optional
import uuid
from datetime import datetime
import logging

from .anomaly_detector import AnomalyAnalyzer, AnomalyDetector

logger = logging.getLogger(__name__)


class AnomalyService:
    """
    Service layer for anomaly detection and database operations
    """
    
    def __init__(self, db_connection):
        """
        Initialize anomaly service
        
        Args:
            db_connection: PostgreSQL database connection
        """
        self.db = db_connection
        self.analyzer = None
    
    def initialize_analyzer(self, sensitivity: str = 'medium'):
        """
        Initialize the anomaly analyzer
        
        Args:
            sensitivity: Detection sensitivity level
        """
        self.analyzer = AnomalyAnalyzer(self.db, sensitivity)
        logger.info(f"Anomaly analyzer initialized with {sensitivity} sensitivity")
    
    def detect_and_store_anomalies(
        self,
        file_id: str,
        file_name: str,
        current_metrics: Dict[str, Any],
        job_id: Optional[str] = None,
        mapping_id: Optional[str] = None,
        sensitivity: str = 'medium'
    ) -> List[str]:
        """
        Detect anomalies and store them in the database
        
        Args:
            file_id: File identifier
            file_name: File name
            current_metrics: Current profiling metrics
            job_id: Optional job ID
            mapping_id: Optional mapping ID
            sensitivity: Detection sensitivity
            
        Returns:
            List of created anomaly IDs
        """
        if not self.analyzer:
            self.initialize_analyzer(sensitivity)
        
        # Detect anomalies (analyzer is guaranteed to be initialized above)
        if self.analyzer:
            anomalies = self.analyzer.analyze_file_profile(file_id, current_metrics)
        else:
            logger.error("Failed to initialize analyzer")
            return []
        
        if not anomalies:
            logger.info(f"No anomalies detected for file {file_id}")
            return []
        
        # Store anomalies
        anomaly_ids = []
        
        try:
            cursor = self.db.cursor()
            
            for anomaly in anomalies:
                anomaly_id = str(uuid.uuid4())
                
                insert_query = """
                    INSERT INTO anomalies (
                        anomaly_id,
                        file_id,
                        file_name,
                        mapping_id,
                        job_id,
                        anomaly_type,
                        severity,
                        title,
                        description,
                        anomaly_details,
                        expected_value,
                        actual_value,
                        deviation_percentage,
                        status,
                        detected_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                """
                
                cursor.execute(insert_query, (
                    anomaly_id,
                    file_id,
                    file_name,
                    mapping_id,
                    job_id,
                    anomaly.get('anomaly_type'),
                    anomaly.get('severity'),
                    anomaly.get('title'),
                    anomaly.get('description'),
                    psycopg2.extras.Json(anomaly.get('anomaly_details', {})),
                    anomaly.get('expected_value'),
                    anomaly.get('actual_value'),
                    anomaly.get('deviation_percentage'),
                    'open',
                    datetime.now()
                ))
                
                anomaly_ids.append(anomaly_id)
            
            self.db.commit()
            cursor.close()
            
            logger.info(f"Stored {len(anomaly_ids)} anomalies for file {file_id}")
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error storing anomalies: {str(e)}", exc_info=True)
            raise
        
        return anomaly_ids
    
    def get_file_anomalies(
        self,
        file_id: str,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get anomalies for a specific file
        
        Args:
            file_id: File identifier
            status: Optional status filter
            
        Returns:
            List of anomalies
        """
        try:
            query = """
                SELECT 
                    id,
                    anomaly_id,
                    file_id,
                    file_name,
                    mapping_id,
                    job_id,
                    anomaly_type,
                    severity,
                    title,
                    description,
                    anomaly_details,
                    expected_value,
                    actual_value,
                    deviation_percentage,
                    status,
                    resolved_at,
                    resolved_by,
                    resolution_notes,
                    detected_at,
                    created_at
                FROM anomalies
                WHERE file_id = %s
            """
            
            params = [file_id]
            
            if status:
                query += " AND status = %s"
                params.append(status)
            
            query += " ORDER BY detected_at DESC"
            
            cursor = self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute(query, params)
            
            results = cursor.fetchall()
            cursor.close()
            
            return [dict(row) for row in results]
            
        except Exception as e:
            logger.error(f"Error fetching anomalies: {str(e)}", exc_info=True)
            return []
    
    def get_recent_anomalies(
        self,
        limit: int = 100,
        severity: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get recent anomalies across all files
        
        Args:
            limit: Maximum number of results
            severity: Optional severity filter
            status: Optional status filter
            
        Returns:
            List of anomalies
        """
        try:
            query = """
                SELECT 
                    id,
                    anomaly_id,
                    file_id,
                    file_name,
                    mapping_id,
                    job_id,
                    anomaly_type,
                    severity,
                    title,
                    description,
                    anomaly_details,
                    expected_value,
                    actual_value,
                    deviation_percentage,
                    status,
                    resolved_at,
                    resolved_by,
                    resolution_notes,
                    detected_at,
                    created_at
                FROM anomalies
                WHERE 1=1
            """
            
            params = []
            
            if severity:
                query += " AND severity = %s"
                params.append(severity)
            
            if status:
                query += " AND status = %s"
                params.append(status)
            
            query += " ORDER BY detected_at DESC LIMIT %s"
            params.append(limit)
            
            cursor = self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute(query, params)
            
            results = cursor.fetchall()
            cursor.close()
            
            return [dict(row) for row in results]
            
        except Exception as e:
            logger.error(f"Error fetching recent anomalies: {str(e)}", exc_info=True)
            return []
    
    def resolve_anomaly(
        self,
        anomaly_id: str,
        resolved_by: str,
        resolution_notes: str
    ) -> bool:
        """
        Mark an anomaly as resolved
        
        Args:
            anomaly_id: Anomaly identifier
            resolved_by: User resolving the anomaly
            resolution_notes: Resolution notes
            
        Returns:
            True if successful, False otherwise
        """
        try:
            cursor = self.db.cursor()
            
            update_query = """
                UPDATE anomalies
                SET status = 'resolved',
                    resolved_at = %s,
                    resolved_by = %s,
                    resolution_notes = %s
                WHERE anomaly_id = %s
            """
            
            cursor.execute(update_query, (
                datetime.now(),
                resolved_by,
                resolution_notes,
                anomaly_id
            ))
            
            self.db.commit()
            cursor.close()
            
            logger.info(f"Resolved anomaly {anomaly_id}")
            return True
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error resolving anomaly: {str(e)}", exc_info=True)
            return False
    
    def get_anomaly_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about anomalies
        
        Returns:
            Dictionary with anomaly statistics
        """
        try:
            cursor = self.db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            # Total counts by status
            cursor.execute("""
                SELECT status, COUNT(*) as count
                FROM anomalies
                GROUP BY status
            """)
            status_counts = {row['status']: row['count'] for row in cursor.fetchall()}
            
            # Counts by severity
            cursor.execute("""
                SELECT severity, COUNT(*) as count
                FROM anomalies
                WHERE status = 'open'
                GROUP BY severity
            """)
            severity_counts = {row['severity']: row['count'] for row in cursor.fetchall()}
            
            # Counts by type
            cursor.execute("""
                SELECT anomaly_type, COUNT(*) as count
                FROM anomalies
                WHERE status = 'open'
                GROUP BY anomaly_type
                ORDER BY count DESC
                LIMIT 10
            """)
            type_counts = {row['anomaly_type']: row['count'] for row in cursor.fetchall()}
            
            cursor.close()
            
            return {
                'by_status': status_counts,
                'by_severity': severity_counts,
                'by_type': type_counts,
                'total_open': status_counts.get('open', 0),
                'total_resolved': status_counts.get('resolved', 0)
            }
            
        except Exception as e:
            logger.error(f"Error fetching anomaly statistics: {str(e)}", exc_info=True)
            return {}
