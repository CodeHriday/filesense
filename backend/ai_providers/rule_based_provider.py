import logging
import re
from typing import List, Dict, Any
from .base import AIProvider, AIProviderFactory

logger = logging.getLogger(__name__)

@AIProviderFactory.register
class RuleBasedProvider(AIProvider):
    """Rule-based provider that generates suggestions without any external API calls.
    
    This is the most private option - all processing happens locally using
    deterministic rules based on column profiling metrics.
    """
    
    PROVIDER_NAME = "rule-based"
    REQUIRED_SECRETS = []
    
    def __init__(self):
        super().__init__()
    
    def validate_credentials(self) -> bool:
        return True
    
    def is_available(self) -> bool:
        return True
    
    def get_provider_info(self) -> Dict[str, Any]:
        return {
            "name": self.PROVIDER_NAME,
            "display_name": "Rule-Based (Local)",
            "available": True,
            "requires_external_call": False,
            "privacy_level": "local",
            "description": "Uses deterministic rules - no external API calls, fully private"
        }
    
    def generate_dq_suggestions(
        self,
        columns: List[Dict[str, Any]],
        filename: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        suggestions = []
        suggestion_id = 1
        
        for col in columns:
            col_name = col.get("name", "unknown")
            col_type = col.get("type", "STRING")
            completeness = col.get("completeness", 100 - col.get("nullPercentage", 0))
            has_nulls = col.get("hasNulls", col.get("nullPercentage", 0) > 0)
            unique_count = col.get("uniqueCount", col.get("distinct_count", 0))
            patterns = col.get("patterns", [])
            semantic_type = col.get("semanticType", "").lower()
            
            col_suggestions = []
            col_suggestions.extend(self._check_completeness(col_name, completeness, has_nulls))
            col_suggestions.extend(self._check_uniqueness(col_name, unique_count, col_type))
            col_suggestions.extend(self._check_validity(col_name, semantic_type, patterns, col_type))
            col_suggestions.extend(self._check_freshness(col_name, col_type, semantic_type))
            
            for s in col_suggestions:
                s['id'] = f"dq_suggestion_{suggestion_id}"
                s['fileId'] = file_id
                s['provider'] = self.PROVIDER_NAME
                suggestion_id += 1
                suggestions.append(s)
        
        return suggestions
    
    def _check_completeness(self, col_name: str, completeness: float, has_nulls: bool) -> List[Dict]:
        suggestions = []
        
        if has_nulls or completeness < 100:
            severity = "critical" if completeness < 80 else ("error" if completeness < 95 else "warning")
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Completeness Check",
                "rule_type": "completeness",
                "column_name": col_name,
                "description": f"Ensures {col_name} has no null or missing values",
                "reason": f"Column has {100 - completeness:.1f}% missing values",
                "rule_config": {"not_null": True, "not_empty": True},
                "severity": severity
            })
        
        return suggestions
    
    def _check_uniqueness(self, col_name: str, unique_count: int, col_type: str) -> List[Dict]:
        suggestions = []
        name_lower = col_name.lower()
        
        is_id_column = any(pattern in name_lower for pattern in [
            '_id', 'id_', 'identifier', 'key', 'uuid', 'guid', 'code',
            'sku', 'order_id', 'customer_id', 'user_id', 'product_id'
        ]) or name_lower.endswith('id') or name_lower == 'id'
        
        if is_id_column:
            severity = "critical" if unique_count == 0 else "warning"
            suggestions.append({
                "rule_name": f"Unique {col_name.replace('_', ' ').title()} Check",
                "rule_type": "uniqueness",
                "column_name": col_name,
                "description": f"Ensures {col_name} is unique across all records",
                "reason": f"Column appears to be an identifier field" + 
                         (f" but has only {unique_count} unique values" if unique_count > 0 else ""),
                "rule_config": {"unique": True},
                "severity": severity
            })
        
        return suggestions
    
    def _check_validity(self, col_name: str, semantic_type: str, patterns: List, col_type: str) -> List[Dict]:
        suggestions = []
        name_lower = col_name.lower()
        
        if 'email' in name_lower or semantic_type == 'email':
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Email Format Validation",
                "rule_type": "validity",
                "column_name": col_name,
                "description": f"Validates that {col_name} contains properly formatted email addresses",
                "reason": "Column appears to contain email addresses based on name/type",
                "rule_config": {
                    "type": "regex",
                    "pattern": r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
                },
                "severity": "warning"
            })
        
        if any(p in name_lower for p in ['phone', 'tel', 'mobile', 'fax']) or semantic_type == 'phone':
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Phone Format Validation",
                "rule_type": "validity",
                "column_name": col_name,
                "description": f"Validates that {col_name} contains valid phone number formats",
                "reason": "Column appears to contain phone numbers based on name/type",
                "rule_config": {
                    "type": "regex",
                    "pattern": r"^[\d\s\-\+\(\)\.]{7,20}$"
                },
                "severity": "warning"
            })
        
        if any(p in name_lower for p in ['date', '_dt', '_ts']) or semantic_type in ['date', 'datetime']:
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Date Format Validation",
                "rule_type": "validity",
                "column_name": col_name,
                "description": f"Validates that {col_name} follows a valid date format",
                "reason": "Column appears to contain date values based on name/type",
                "rule_config": {
                    "type": "regex",
                    "pattern": r"^\d{4}-\d{2}-\d{2}"
                },
                "severity": "warning"
            })
        
        if any(p in name_lower for p in ['zip', 'postal', 'postcode']) or semantic_type == 'zipcode':
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Postal Code Validation",
                "rule_type": "validity",
                "column_name": col_name,
                "description": f"Validates that {col_name} contains valid postal/zip codes",
                "reason": "Column appears to contain postal codes based on name",
                "rule_config": {
                    "type": "regex",
                    "pattern": r"^\d{5}(-\d{4})?$"
                },
                "severity": "info"
            })
        
        if col_type in ['NUMERIC', 'INTEGER', 'FLOAT', 'DECIMAL']:
            if any(p in name_lower for p in ['amount', 'price', 'cost', 'total', 'qty', 'quantity']):
                suggestions.append({
                    "rule_name": f"{col_name.replace('_', ' ').title()} Range Validation",
                    "rule_type": "validity",
                    "column_name": col_name,
                    "description": f"Validates that {col_name} is within expected range",
                    "reason": "Numeric column that likely should have bounds",
                    "rule_config": {
                        "type": "range",
                        "min": 0
                    },
                    "severity": "info"
                })
        
        return suggestions
    
    def _check_freshness(self, col_name: str, col_type: str, semantic_type: str) -> List[Dict]:
        suggestions = []
        name_lower = col_name.lower()
        
        is_timestamp = any(p in name_lower for p in [
            'created', 'updated', 'modified', 'timestamp', '_at', '_ts',
            'last_', 'processed', 'ingested'
        ]) or semantic_type in ['datetime', 'timestamp']
        
        if is_timestamp:
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Freshness Check",
                "rule_type": "freshness",
                "column_name": col_name,
                "description": f"Ensures {col_name} values are within expected time window",
                "reason": "Column appears to be a timestamp that should be monitored for freshness",
                "rule_config": {
                    "max_age_days": 30
                },
                "severity": "info"
            })
        
        return suggestions
