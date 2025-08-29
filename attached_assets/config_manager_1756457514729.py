import os
import yaml
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import json
import datetime

CONFIG_PATH = os.path.join("config", "config.yaml")
EMBEDDING_CACHE_PATH = os.path.join("cache", "embedding_cache.json")

@dataclass
class Snippet:
    name: str
    sql: str
    description: str = ""  # Added description field
    embedding: Optional[List[float]] = field(default=None, repr=False)

    def get_embedding_key(self) -> str:
        """Generate a unique key for the embedding cache based on snippet name, SQL content, and description."""
        return f"{self.name}::{self.sql}::{self.description}"

@dataclass
class AIConfig:
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    temperature: float = 0.0
    agent_temperature: float = 0.3
    offline_demo_mode: bool = True
    use_bm25_similarity: bool = True
    use_embedding_similarity: bool = False  # New field
    use_embedding: bool = False  # Core embedding flag
    embedding_model: str = "text-embedding-3-small"
    max_rows_for_ai: int = 50  # Maximum rows to send to AI for processing
    system_prompt: str = "You are a precise data assistant."
    sql_synth_prompt: str = "You are an expert SQL generator."

@dataclass
class DataConfig:
    file_path: str = "data/sample_sales.csv"
    table_name: str = "sales"
    additional_details: str = ""

@dataclass
class AppConfig:
    ai: AIConfig = field(default_factory=AIConfig)
    data: DataConfig = field(default_factory=DataConfig)
    snippets: List[Snippet] = field(default_factory=list)

def load_embedding_cache() -> Dict[str, Any]:
    """Load cached embeddings from JSON file"""
    if not os.path.exists(EMBEDDING_CACHE_PATH):
        return {}

    try:
        with open(EMBEDDING_CACHE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_embedding_cache(cache: Dict[str, Any]):
    """Save embeddings cache to JSON file"""
    os.makedirs(os.path.dirname(EMBEDDING_CACHE_PATH), exist_ok=True)
    with open(EMBEDDING_CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def generate_snippet_embedding(snippet: Snippet) -> Optional[List[float]]:
    """Generate OpenAI embedding for a snippet"""
    try:
        from openai import OpenAI
        import os

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("Warning: No OpenAI API key found. Skipping embedding generation.")
            return None

        client = OpenAI(api_key=api_key)

        # Combine name and SQL for embedding
        text = f"{snippet.name}\n{snippet.sql}"
        if snippet.description:
            text += f"\n{snippet.description}"

        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
            encoding_format="float"
        )

        return response.data[0].embedding

    except Exception as e:
        print(f"Error generating embedding for snippet '{snippet.name}': {e}")
        return None

def ensure_snippets_have_embeddings(snippets: List[Snippet]) -> List[Snippet]:
    """Ensure all snippets have embeddings, generating them if needed"""
    cache = load_embedding_cache()
    cache_updated = False

    for snippet in snippets:
        if snippet.embedding is None:
            embedding_key = snippet.get_embedding_key()

            # Check cache first
            if embedding_key in cache:
                snippet.embedding = cache[embedding_key].get("embedding")
            else:
                # Generate new embedding
                embedding = generate_snippet_embedding(snippet)
                if embedding:
                    snippet.embedding = embedding
                    # Cache the embedding
                    cache[embedding_key] = {
                        "name": snippet.name,
                        "embedding": embedding,
                        "created_at": datetime.datetime.now().isoformat()
                    }
                    cache_updated = True

    if cache_updated:
        save_embedding_cache(cache)

    return snippets

def load_config() -> AppConfig:
    """Load the config from YAML file"""
    if not os.path.exists(CONFIG_PATH):
        return AppConfig()

    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            raw_cfg = yaml.safe_load(f) # Renamed from data to raw_cfg

        if not raw_cfg:
            return AppConfig()

        ai_config_data = raw_cfg.get("ai", {})
        ai_config = AIConfig(
            provider=ai_config_data.get("provider", "openai"),
            model=ai_config_data.get("model", "gpt-4o-mini"),
            temperature=ai_config_data.get("temperature", 0.0),
            agent_temperature=ai_config_data.get("agent_temperature", 0.3),
            offline_demo_mode=ai_config_data.get("offline_demo_mode", True),
            use_bm25_similarity=ai_config_data.get("use_bm25_similarity", True),
            use_embedding_similarity=ai_config_data.get("use_embedding_similarity", False),
            use_embedding=ai_config_data.get("use_embedding", False),
            embedding_model=ai_config_data.get("embedding_model", "text-embedding-3-small"),
            max_rows_for_ai=ai_config_data.get("max_rows_for_ai", 50),  # Load max_rows_for_ai
            system_prompt=ai_config_data.get("system_prompt", "You are a precise data assistant."),
            sql_synth_prompt=ai_config_data.get("sql_synth_prompt", "You are an expert SQL generator.")
        )

        data_config = DataConfig(**raw_cfg.get("data", {}))
        
        snippets = []
        for s in raw_cfg.get("snippets", []):
            snippet = Snippet(
                name=s["name"], 
                sql=s["sql"],
                description=s.get("description", "")
            )
            snippets.append(snippet)

        # Load embeddings from cache
        cache = load_embedding_cache()
        for snippet in snippets:
            if snippet.embedding is None:
                embedding_key = snippet.get_embedding_key()
                if embedding_key in cache:
                    snippet.embedding = cache[embedding_key].get("embedding")

        config = AppConfig(ai=ai_config, data=data_config, snippets=snippets)

        # Ensure all snippets have embeddings (generates if not in cache)
        config.snippets = ensure_snippets_have_embeddings(config.snippets)

        return config

    except Exception as e:
        print(f"Error loading config: {e}")
        return AppConfig()

def save_config(config: AppConfig):
    """Save the config to YAML file"""
    # Ensure snippets have embeddings before saving
    config.snippets = ensure_snippets_have_embeddings(config.snippets)

    data = {
        "ai": {
            "provider": config.ai.provider,
            "model": config.ai.model,
            "temperature": config.ai.temperature,
            "agent_temperature": config.ai.agent_temperature,
            "offline_demo_mode": config.ai.offline_demo_mode,
            "use_bm25_similarity": config.ai.use_bm25_similarity,
            "use_embedding_similarity": config.ai.use_embedding_similarity, # Updated field
            "use_embedding": config.ai.use_embedding,
            "embedding_model": config.ai.embedding_model,
            "max_rows_for_ai": config.ai.max_rows_for_ai, # Save max_rows_for_ai
            "system_prompt": config.ai.system_prompt,
            "sql_synth_prompt": config.ai.sql_synth_prompt,
        },
        "data": {
            "file_path": config.data.file_path,
            "table_name": config.data.table_name,
            "additional_details": config.data.additional_details,
        },
        "snippets": [{"name": s.name, "sql": s.sql, "description": s.description} for s in config.snippets]
    }

    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, sort_keys=False, allow_unicode=True)