import os
import json
import logging
from typing import List, Dict, Any
from .base import AIProvider, AIProviderFactory

logger = logging.getLogger(__name__)

@AIProviderFactory.register
class OpenAIProvider(AIProvider):
    """OpenAI provider using Replit AI Integration or direct API."""
    
    PROVIDER_NAME = "openai"
    REQUIRED_SECRETS = []
    
    def __init__(self):
        self._client = None
        self._credentials_validated = False
        super().__init__()
    
    def validate_credentials(self) -> bool:
        """OpenAI via Replit integration uses AI_INTEGRATIONS_OPENAI_* env vars."""
        if self._credentials_validated and self._client is not None:
            return True
        
        try:
            from openai import OpenAI
            api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
            base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
            
            if api_key:
                if base_url:
                    self._client = OpenAI(api_key=api_key, base_url=base_url)
                else:
                    self._client = OpenAI(api_key=api_key)
                self._credentials_validated = True
                return True
            
            self._client = OpenAI()
            self._credentials_validated = True
            return True
        except Exception as e:
            logger.warning(f"OpenAI client initialization failed: {e}")
            return False
    
    def is_available(self) -> bool:
        return self._client is not None
    
    def get_provider_info(self) -> Dict[str, Any]:
        return {
            "name": self.PROVIDER_NAME,
            "display_name": "OpenAI",
            "available": self.is_available(),
            "requires_external_call": True,
            "privacy_level": "cloud",
            "description": "Uses OpenAI GPT models"
        }
    
    def generate_dq_suggestions(
        self,
        columns: List[Dict[str, Any]],
        filename: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        if not self._client:
            raise RuntimeError("OpenAI client not initialized")
        
        prompt = self._build_prompt(columns, filename)
        
        response = self._client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": """You are a data quality expert. Analyze file profiling data and suggest data quality rules.
                    
Return a JSON array of suggestions. Each suggestion must have:
- id: unique string (use format "dq_suggestion_N")
- rule_name: descriptive name for the rule
- rule_type: one of "completeness", "validity", "consistency", "uniqueness", "freshness"
- column_name: the column this rule applies to
- description: what the rule checks
- reason: why this rule is needed based on the profiling data
- rule_config: JSON object with rule parameters (use type: "pattern" for regex validations)
- severity: one of "critical", "error", "warning", "info"

Validation types to consider:
- null_check: Detect null or empty values (rule_type: completeness)
- isna_check: Detect NA/N/A/NaN/NULL placeholder strings (rule_type: validity, use pattern type)
- duplicate_check: Detect duplicate values in key columns (rule_type: uniqueness)
- special_characters: Check for unexpected special characters (rule_type: validity, use pattern type)
- length_check: Validate string length for fields like ZIP, phone, SSN (rule_type: validity, use pattern type)
- email_validity: Validate email format (rule_type: validity, use pattern type)
- date_format: Validate date formats (rule_type: validity, use pattern type)
- range_check: Validate numeric ranges (rule_type: validity, use range type)

Focus on actionable rules based on the actual data quality issues detected in the profiling."""
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=4000
        )
        
        content = response.choices[0].message.content
        result = json.loads(content)
        suggestions = result.get('suggestions', result.get('rules', []))
        
        if isinstance(suggestions, dict):
            suggestions = [suggestions]
        
        for i, s in enumerate(suggestions):
            if 'id' not in s:
                s['id'] = f"dq_suggestion_{i+1}"
            s['fileId'] = file_id
            s['provider'] = self.PROVIDER_NAME
        
        return suggestions
    
    def _build_prompt(self, columns: List[Dict[str, Any]], filename: str) -> str:
        column_summary = []
        for col in columns:
            summary = {
                "name": col.get("name"),
                "type": col.get("type"),
                "completeness": col.get("completeness", 100 - col.get("nullPercentage", 0)),
                "uniqueCount": col.get("uniqueCount", col.get("distinct_count")),
                "hasNulls": col.get("hasNulls", col.get("nullPercentage", 0) > 0),
                "patterns": col.get("patterns", [])[:5],
                "semanticType": col.get("semanticType")
            }
            column_summary.append(summary)
        
        return f"""Analyze the following file profile and suggest data quality rules.

File: {filename}
Columns: {json.dumps(column_summary, indent=2)}

Generate appropriate data quality rules for columns that show potential issues:
- Columns with nulls may need completeness rules (null_check)
- Columns with NA/N/A/NaN values need isna_check rules
- Columns with low unique counts may need uniqueness or duplicate_check rules
- ID/key columns should be unique and checked for duplicates
- Columns with specific patterns (email, phone, date) need validity rules
- Code fields (SKU, product codes) need special_characters validation
- Fields with standard lengths (ZIP, phone, SSN) need length_check rules
- Numeric columns (amount, price, quantity) need range validation
- Date/timestamp columns should have freshness rules

Return your response as a JSON object with a "suggestions" array."""
