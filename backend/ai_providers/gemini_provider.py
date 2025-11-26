import os
import json
import logging
from typing import List, Dict, Any
from .base import AIProvider, AIProviderFactory

logger = logging.getLogger(__name__)

@AIProviderFactory.register
class GeminiProvider(AIProvider):
    """Google Gemini/Vertex AI provider."""
    
    PROVIDER_NAME = "gemini"
    REQUIRED_SECRETS = []
    
    def __init__(self):
        self._client = None
        self._model = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
        self._credentials_validated = False
        super().__init__()
    
    def validate_credentials(self) -> bool:
        if self._credentials_validated and self._client is not None:
            return True
        
        api_key = os.environ.get("GOOGLE_API_KEY")
        credentials_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        
        if not api_key and not credentials_path:
            return False
        
        try:
            import google.generativeai as genai
            
            if api_key:
                genai.configure(api_key=api_key)
            elif credentials_path:
                genai.configure()
            
            self._client = genai.GenerativeModel(self._model)
            self._credentials_validated = True
            return True
        except ImportError:
            logger.warning("google-generativeai package not installed")
            return False
        except Exception as e:
            logger.warning(f"Gemini client initialization failed: {e}")
            return False
    
    def is_available(self) -> bool:
        return self._client is not None
    
    def get_provider_info(self) -> Dict[str, Any]:
        return {
            "name": self.PROVIDER_NAME,
            "display_name": "Google Gemini",
            "available": self.is_available(),
            "requires_external_call": True,
            "privacy_level": "cloud-gcp",
            "description": f"Uses Google Gemini with model {self._model}",
            "model": self._model
        }
    
    def generate_dq_suggestions(
        self,
        columns: List[Dict[str, Any]],
        filename: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        if not self._client:
            raise RuntimeError("Gemini client not initialized")
        
        prompt = self._build_prompt(columns, filename)
        
        response = self._client.generate_content(
            prompt,
            generation_config={
                "temperature": 0.3,
                "max_output_tokens": 4000,
                "response_mime_type": "application/json"
            }
        )
        
        content = response.text
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
        
        return f"""You are a data quality expert. Analyze file profiling data and suggest data quality rules.

Return a JSON object with a "suggestions" array. Each suggestion must have:
- id: unique string (use format "dq_suggestion_N")
- rule_name: descriptive name for the rule
- rule_type: one of "completeness", "validity", "consistency", "uniqueness", "freshness"
- column_name: the column this rule applies to
- description: what the rule checks
- reason: why this rule is needed based on the profiling data
- rule_config: JSON object with rule parameters
- severity: one of "critical", "error", "warning", "info"

File: {filename}
Columns: {json.dumps(column_summary, indent=2)}

Generate appropriate data quality rules for columns that show potential issues.
Return your response as a JSON object with a "suggestions" array."""
