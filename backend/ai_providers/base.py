import os
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class AIProvider(ABC):
    """Abstract base class for AI providers."""
    
    PROVIDER_NAME = "base"
    REQUIRED_SECRETS = []
    
    def __init__(self):
        self.validate_credentials()
    
    def validate_credentials(self) -> bool:
        """Check if required credentials are available."""
        missing = []
        for secret in self.REQUIRED_SECRETS:
            if not os.environ.get(secret):
                missing.append(secret)
        
        if missing:
            logger.warning(f"{self.PROVIDER_NAME} missing credentials: {missing}")
            return False
        return True
    
    def is_available(self) -> bool:
        """Check if this provider is configured and available."""
        return self.validate_credentials()
    
    @abstractmethod
    def generate_dq_suggestions(
        self,
        columns: List[Dict[str, Any]],
        filename: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        """
        Generate data quality rule suggestions based on column profiling data.
        
        Args:
            columns: List of column profiles with name, type, completeness, patterns, etc.
            filename: Name of the file being analyzed
            file_id: Unique identifier for the file
            
        Returns:
            List of suggestion dictionaries with:
                - id: Unique suggestion ID
                - rule_name: Suggested rule name
                - rule_type: completeness|validity|consistency|uniqueness|freshness
                - column_name: Target column
                - description: Human-readable description
                - reason: Why this rule is suggested
                - rule_config: Configuration for the rule
                - severity: critical|error|warning|info
        """
        pass
    
    def get_provider_info(self) -> Dict[str, Any]:
        """Return information about this provider."""
        return {
            "name": self.PROVIDER_NAME,
            "available": self.is_available(),
            "requires_external_call": True,
            "privacy_level": "cloud"
        }


class AIProviderFactory:
    """Factory for creating AI provider instances based on configuration."""
    
    PROVIDERS = {}
    
    @classmethod
    def register(cls, provider_class):
        """Register a provider class."""
        cls.PROVIDERS[provider_class.PROVIDER_NAME] = provider_class
        return provider_class
    
    @classmethod
    def get_provider(cls, provider_name: Optional[str] = None) -> AIProvider:
        """
        Get an AI provider instance.
        
        Args:
            provider_name: Name of provider to use. If None, uses AI_PROVIDER env var
                          or auto-detects based on available credentials.
        
        Returns:
            AIProvider instance
        """
        if provider_name is None:
            provider_name = os.environ.get('AI_PROVIDER', 'auto')
        
        provider_name = provider_name.lower()
        
        if provider_name == 'auto':
            return cls._auto_detect_provider()
        
        if provider_name not in cls.PROVIDERS:
            logger.warning(f"Unknown provider '{provider_name}', falling back to rule-based")
            provider_name = 'rule-based'
        
        provider_class = cls.PROVIDERS[provider_name]
        return provider_class()
    
    @classmethod
    def _auto_detect_provider(cls) -> AIProvider:
        """Auto-detect the best available provider based on credentials."""
        priority_order = ['openai', 'bedrock', 'azure', 'gemini', 'rule-based']
        
        for provider_name in priority_order:
            if provider_name in cls.PROVIDERS:
                provider_class = cls.PROVIDERS[provider_name]
                try:
                    provider = provider_class()
                    if provider.is_available():
                        logger.info(f"Auto-detected AI provider: {provider_name}")
                        return provider
                except Exception as e:
                    logger.debug(f"Provider {provider_name} not available: {e}")
                    continue
        
        logger.info("No cloud AI provider available, using rule-based fallback")
        return cls.PROVIDERS.get('rule-based', cls.PROVIDERS['rule-based'])()
    
    @classmethod
    def list_providers(cls) -> List[Dict[str, Any]]:
        """List all registered providers with their availability status."""
        result = []
        for name, provider_class in cls.PROVIDERS.items():
            try:
                provider = provider_class()
                info = provider.get_provider_info()
                result.append(info)
            except Exception as e:
                result.append({
                    "name": name,
                    "available": False,
                    "error": str(e)
                })
        return result
