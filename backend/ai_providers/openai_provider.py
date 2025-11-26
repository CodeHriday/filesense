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
        super().__init__()
    
    def validate_credentials(self) -> bool:
        """OpenAI via Replit integration doesn't need explicit API key."""
        try:
            from openai import OpenAI
            self._client = OpenAI()
            return True
        except Exception as e:
            logger.warning(f"OpenAI client initialization failed: {e}")
            return False
    
    def is_available(self) -> bool:
        return self._client is not None
    
    def get_provider_info(self) -> Dict[str, Any]:
        return {
            "name": self.PROVIDER_NAME,
            "display_name": "OpenAI (Replit AI)",
            "available": self.is_available(),
            "requires_external_call": True,
            "privacy_level": "cloud",
            "description": "Uses OpenAI GPT models via Replit AI Integration"
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
- rule_config: JSON object with rule parameters
- severity: one of "critical", "error", "warning", "info"

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
- Columns with nulls may need completeness rules
- Columns with low unique counts may need uniqueness checks
- Columns with specific patterns (email, phone, date) need validity rules
- ID columns should be unique
- Date columns should have freshness rules if they represent timestamps

Return your response as a JSON object with a "suggestions" array."""
