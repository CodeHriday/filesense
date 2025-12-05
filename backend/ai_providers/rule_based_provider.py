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
    
    Supports the following validation rule types:
    - completeness: null_check, isna_check
    - validity: email_validity, phone_validity, date_format, range_check, length_check, special_characters
    - uniqueness: uniqueness, duplicate_check
    - freshness: freshness_check
    - consistency: format_consistency
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
            col_type = col.get("type", "STRING").upper()
            completeness = col.get("completeness", 100 - col.get("nullPercentage", 0))
            has_nulls = col.get("hasNulls", col.get("nullPercentage", 0) > 0)
            unique_count = col.get("uniqueCount", col.get("distinct_count", 0))
            total_count = col.get("totalCount", col.get("total_count", 0))
            patterns = col.get("patterns", [])
            semantic_type = col.get("semanticType", "").lower()
            sample_values = col.get("sampleValues", col.get("sample_values", []))
            min_length = col.get("minLength", col.get("min_length"))
            max_length = col.get("maxLength", col.get("max_length"))
            
            col_suggestions = []
            col_suggestions.extend(self._check_completeness(col_name, completeness, has_nulls, sample_values))
            col_suggestions.extend(self._check_uniqueness(col_name, unique_count, total_count, col_type))
            col_suggestions.extend(self._check_duplicate(col_name, unique_count, total_count, col_type))
            col_suggestions.extend(self._check_validity(col_name, semantic_type, patterns, col_type))
            col_suggestions.extend(self._check_special_characters(col_name, col_type, sample_values, semantic_type))
            col_suggestions.extend(self._check_length(col_name, col_type, min_length, max_length, semantic_type))
            col_suggestions.extend(self._check_freshness(col_name, col_type, semantic_type))
            
            for s in col_suggestions:
                s['id'] = f"dq_suggestion_{suggestion_id}"
                s['fileId'] = file_id
                s['provider'] = self.PROVIDER_NAME
                suggestion_id += 1
                suggestions.append(s)
        
        return suggestions
    
    def _check_completeness(self, col_name: str, completeness: float, has_nulls: bool, sample_values: List = None) -> List[Dict]:
        suggestions = []
        sample_values = sample_values or []
        
        if has_nulls or completeness < 100:
            severity = "critical" if completeness < 80 else ("error" if completeness < 95 else "warning")
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Null Check",
                "rule_type": "completeness",
                "column_name": col_name,
                "description": f"Ensures {col_name} has no null or missing values",
                "reason": f"Column has {100 - completeness:.1f}% missing values",
                "rule_config": {"not_null": True, "not_empty": True, "threshold": 1.0},
                "severity": severity
            })
        
        na_patterns = ['NA', 'N/A', 'NaN', 'nan', 'NULL', 'null', 'None', 'none', '#N/A', '#NA']
        has_na_values = any(str(val).strip() in na_patterns for val in sample_values if val is not None)
        
        if has_na_values:
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} NA Value Check",
                "rule_type": "validity",
                "column_name": col_name,
                "description": f"Detects NA, N/A, NaN, NULL, or other placeholder values in {col_name}",
                "reason": "Column contains values that represent missing data (NA, N/A, NaN, etc.)",
                "rule_config": {
                    "type": "pattern",
                    "pattern": r"^(?!(NA|N/A|NaN|NULL|None|#N/A|#NA)$).+$"
                },
                "severity": "warning"
            })
        
        return suggestions
    
    def _check_uniqueness(self, col_name: str, unique_count: int, total_count: int, col_type: str) -> List[Dict]:
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
                "rule_config": {"columns": [col_name]},
                "severity": severity
            })
        
        return suggestions
    
    def _check_duplicate(self, col_name: str, unique_count: int, total_count: int, col_type: str) -> List[Dict]:
        """Check for duplicate values in columns that should be unique or semi-unique"""
        suggestions = []
        name_lower = col_name.lower()
        
        is_key_column = any(pattern in name_lower for pattern in [
            '_id', 'id_', 'identifier', 'key', 'uuid', 'guid', 'code', 'number',
            'sku', 'order', 'invoice', 'transaction', 'reference', 'ref'
        ]) or name_lower.endswith('id') or name_lower == 'id'
        
        if is_key_column and total_count > 0 and unique_count > 0:
            duplicate_count = total_count - unique_count
            duplicate_percentage = (duplicate_count / total_count) * 100 if total_count > 0 else 0
            
            if duplicate_percentage > 0:
                severity = "critical" if duplicate_percentage > 10 else ("error" if duplicate_percentage > 5 else "warning")
                suggestions.append({
                    "rule_name": f"{col_name.replace('_', ' ').title()} Duplicate Check",
                    "rule_type": "uniqueness",
                    "column_name": col_name,
                    "description": f"Detects duplicate values in {col_name}",
                    "reason": f"Column has {duplicate_percentage:.1f}% duplicate values ({duplicate_count} duplicates)",
                    "rule_config": {"columns": [col_name]},
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
                    "type": "pattern",
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
                    "type": "pattern",
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
                    "type": "pattern",
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
                    "type": "pattern",
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
    
    def _check_special_characters(self, col_name: str, col_type: str, sample_values: List = None, semantic_type: str = "") -> List[Dict]:
        """Check for unexpected special characters in text columns"""
        suggestions = []
        sample_values = sample_values or []
        name_lower = col_name.lower()
        
        if col_type not in ['STRING', 'TEXT', 'VARCHAR', 'CHAR']:
            return suggestions
        
        is_code_field = any(pattern in name_lower for pattern in [
            'code', 'sku', 'upc', 'ean', 'isbn', 'part_number', 'product_id',
            'serial', 'batch', 'lot', 'reference'
        ])
        
        is_name_field = any(pattern in name_lower for pattern in [
            'name', 'title', 'description', 'first_name', 'last_name',
            'company', 'organization', 'address'
        ])
        
        special_char_pattern = re.compile(r'[^\w\s\-\.\,\@\#\(\)\&\/]', re.UNICODE)
        has_special_chars = any(
            special_char_pattern.search(str(val)) 
            for val in sample_values 
            if val is not None
        )
        
        if is_code_field:
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Special Characters Check",
                "rule_type": "validity",
                "column_name": col_name,
                "description": f"Validates that {col_name} contains only alphanumeric characters and standard separators",
                "reason": "Code fields should typically contain only alphanumeric characters",
                "rule_config": {
                    "type": "pattern",
                    "pattern": r"^[A-Za-z0-9\-\_\.]+$"
                },
                "severity": "warning"
            })
        elif has_special_chars and is_name_field:
            suggestions.append({
                "rule_name": f"{col_name.replace('_', ' ').title()} Special Characters Check",
                "rule_type": "validity",
                "column_name": col_name,
                "description": f"Detects unusual special characters in {col_name}",
                "reason": "Column contains values with special characters that may need review",
                "rule_config": {
                    "type": "pattern",
                    "pattern": r"^[A-Za-z0-9\s\-\.\,\'\&\(\)\/]+$"
                },
                "severity": "info"
            })
        
        return suggestions
    
    def _check_length(self, col_name: str, col_type: str, min_length: int = None, max_length: int = None, semantic_type: str = "") -> List[Dict]:
        """Check for string length constraints"""
        suggestions = []
        name_lower = col_name.lower()
        
        if col_type not in ['STRING', 'TEXT', 'VARCHAR', 'CHAR']:
            return suggestions
        
        length_sensitive_fields = {
            'zip': (5, 10),
            'postal': (5, 10),
            'phone': (7, 20),
            'mobile': (10, 15),
            'ssn': (9, 11),
            'ein': (9, 10),
            'credit_card': (13, 19),
            'account_number': (5, 20),
            'routing_number': (9, 9),
            'state': (2, 2),
            'country_code': (2, 3),
            'currency_code': (3, 3),
            'sku': (3, 20),
            'upc': (12, 14),
            'ean': (8, 13),
            'isbn': (10, 13)
        }
        
        for field_pattern, (expected_min, expected_max) in length_sensitive_fields.items():
            if field_pattern in name_lower:
                length_pattern = f"^.{{{expected_min},{expected_max}}}$"
                suggestions.append({
                    "rule_name": f"{col_name.replace('_', ' ').title()} Length Validation",
                    "rule_type": "validity",
                    "column_name": col_name,
                    "description": f"Validates that {col_name} has expected length ({expected_min}-{expected_max} characters)",
                    "reason": f"Column appears to be a {field_pattern.replace('_', ' ')} field with standard length requirements",
                    "rule_config": {
                        "type": "pattern",
                        "pattern": length_pattern
                    },
                    "severity": "warning"
                })
                break
        
        if min_length is not None and max_length is not None and min_length != max_length:
            if max_length > 100:
                suggestions.append({
                    "rule_name": f"{col_name.replace('_', ' ').title()} Maximum Length Check",
                    "rule_type": "validity",
                    "column_name": col_name,
                    "description": f"Ensures {col_name} does not exceed maximum length",
                    "reason": f"Column has values up to {max_length} characters - may need length limit",
                    "rule_config": {
                        "type": "pattern",
                        "pattern": f"^.{{0,{max_length}}}$"
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
