import os
import json
import logging
from typing import List, Dict, Any
from .base import AIProvider, AIProviderFactory

logger = logging.getLogger(__name__)

@AIProviderFactory.register
class BedrockProvider(AIProvider):
    """AWS Bedrock provider for Claude/Titan models."""
    
    PROVIDER_NAME = "bedrock"
    REQUIRED_SECRETS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
    
    def __init__(self):
        self._client = None
        self._model_id = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
        self._region = os.environ.get("AWS_REGION", "us-east-1")
        super().__init__()
    
    def validate_credentials(self) -> bool:
        if not super().validate_credentials():
            return False
        
        try:
            import boto3
            self._client = boto3.client(
                'bedrock-runtime',
                region_name=self._region,
                aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY")
            )
            return True
        except Exception as e:
            logger.warning(f"Bedrock client initialization failed: {e}")
            return False
    
    def is_available(self) -> bool:
        return self._client is not None
    
    def get_provider_info(self) -> Dict[str, Any]:
        return {
            "name": self.PROVIDER_NAME,
            "display_name": "AWS Bedrock",
            "available": self.is_available(),
            "requires_external_call": True,
            "privacy_level": "cloud-aws",
            "description": f"Uses AWS Bedrock with {self._model_id}",
            "model": self._model_id,
            "region": self._region
        }
    
    def generate_dq_suggestions(
        self,
        columns: List[Dict[str, Any]],
        filename: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        if not self._client:
            raise RuntimeError("Bedrock client not initialized")
        
        prompt = self._build_prompt(columns, filename)
        
        if "anthropic" in self._model_id:
            response = self._invoke_claude(prompt)
        else:
            response = self._invoke_titan(prompt)
        
        suggestions = self._parse_response(response, file_id)
        return suggestions
    
    def _invoke_claude(self, prompt: str) -> str:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4000,
            "temperature": 0.3,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "system": """You are a data quality expert. Analyze file profiling data and suggest data quality rules.
Return a JSON object with a "suggestions" array. Each suggestion must have:
- id, rule_name, rule_type (completeness/validity/consistency/uniqueness/freshness)
- column_name, description, reason, rule_config, severity (critical/error/warning/info)"""
        })
        
        response = self._client.invoke_model(
            modelId=self._model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )
        
        result = json.loads(response['body'].read())
        return result['content'][0]['text']
    
    def _invoke_titan(self, prompt: str) -> str:
        body = json.dumps({
            "inputText": prompt,
            "textGenerationConfig": {
                "maxTokenCount": 4000,
                "temperature": 0.3
            }
        })
        
        response = self._client.invoke_model(
            modelId=self._model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )
        
        result = json.loads(response['body'].read())
        return result['results'][0]['outputText']
    
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

Generate appropriate data quality rules for columns that show potential issues.
Return your response as a JSON object with a "suggestions" array."""
    
    def _parse_response(self, response: str, file_id: str) -> List[Dict[str, Any]]:
        try:
            start = response.find('{')
            end = response.rfind('}') + 1
            if start >= 0 and end > start:
                json_str = response[start:end]
                result = json.loads(json_str)
                suggestions = result.get('suggestions', [])
            else:
                suggestions = []
        except json.JSONDecodeError:
            logger.error(f"Failed to parse Bedrock response: {response[:200]}")
            suggestions = []
        
        for i, s in enumerate(suggestions):
            if 'id' not in s:
                s['id'] = f"dq_suggestion_{i+1}"
            s['fileId'] = file_id
            s['provider'] = self.PROVIDER_NAME
        
        return suggestions
