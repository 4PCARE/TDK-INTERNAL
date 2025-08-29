import os
import re
from typing import Dict, Any, List, Tuple
from datetime import datetime
import math
from collections import Counter

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Attempt to import OpenAI embeddings and LLM clients
try:
    from openai import OpenAI
    from langchain_openai import ChatOpenAI
    from langchain_openai.embeddings import OpenAIEmbeddings
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    ChatOpenAI = None
    OpenAIEmbeddings = None
    OpenAI = None

# --- Configuration Management ---
# Use the centralized config manager
from modules.config_manager import load_config as load_app_config

# Global variable to hold configuration
app_config = None

def load_config(path: str = None):
    """
    Loads configuration from the centralized config manager.
    """
    global app_config
    app_config = load_app_config()

    # Update based on environment variables
    if "OPENAI_API_KEY" in os.environ and not app_config.ai.offline_demo_mode:
        if not OPENAI_AVAILABLE:
            print("Warning: OPENAI_API_KEY is set, but OpenAI libraries are not installed.")
            app_config.ai.offline_demo_mode = True
    elif not os.getenv("OPENAI_API_KEY"):
        print("Warning: OPENAI_API_KEY not found. Running in offline demo mode.")
        app_config.ai.offline_demo_mode = True

def get_config():
    """Get the current configuration"""
    global app_config
    if app_config is None:
        load_config()
    return app_config


def _get_openai_client() -> OpenAI | None:
    """Initializes and returns the OpenAI client if available and API key is set."""
    if not OPENAI_AVAILABLE:
        return None
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        return OpenAI(api_key=api_key)
    except Exception as e:
        print(f"Error initializing OpenAI client: {e}")
        return None

def _get_embedding_model():
    """Returns the configured OpenAI embedding model."""
    cfg = get_config()
    if not OPENAI_AVAILABLE or cfg.ai.offline_demo_mode:
        return None
    try:
        return OpenAIEmbeddings(model="text-embedding-3-small")
    except Exception as e:
        print(f"Error initializing OpenAI Embeddings: {e}")
        return None


def _maybe_llm(model: str, temperature: float = 0.0):
    """Initializes and returns a ChatOpenAI LLM if available."""
    cfg = get_config()
    if not OPENAI_AVAILABLE or cfg.ai.offline_demo_mode:
        return None
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        return None
    try:
        return ChatOpenAI(model=model, temperature=temperature)
    except Exception as e:
        print(f"Error initializing ChatOpenAI: {e}")
        return None

def naive_similarity(a: str, b: str) -> float:
    """Calculates Jaccard similarity between two strings."""
    at = set(re.findall(r"[a-zA-Z0-9]+", a.lower()))
    bt = set(re.findall(r"[a-zA-Z0-9]+", b.lower()))
    if not at or not bt:
        return 0.0
    return len(at & bt) / len(at | bt)

def bm25_similarity(query: str, document: str, k1: float = 1.2, b: float = 0.75, corpus_stats: Dict = None) -> float:
    """
    BM25 similarity between query and document.
    corpus_stats should contain 'avg_doc_len' and 'doc_freq' for better accuracy.
    """
    query_terms = re.findall(r"[a-zA-Z0-9]+", query.lower())
    doc_terms = re.findall(r"[a-zA-Z0-9]+", document.lower())

    if not query_terms or not doc_terms:
        return 0.0

    doc_len = len(doc_terms)
    doc_term_freq = Counter(doc_terms)

    # Use provided corpus stats or defaults
    avg_doc_len = corpus_stats.get('avg_doc_len', 50) if corpus_stats else 50
    total_docs = corpus_stats.get('total_docs', 10) if corpus_stats else 10
    doc_freq = corpus_stats.get('doc_freq', {}) if corpus_stats else {}

    score = 0.0
    query_term_set = set(query_terms)

    # print(f"    Debug BM25: query_terms={query_terms[:5]}...")  # Debug
    # print(f"    Debug BM25: doc_terms={doc_terms[:10]}...")     # Debug
    # print(f"    Debug BM25: total_docs={total_docs}, avg_doc_len={avg_doc_len:.1f}")  # Debug

    for term in query_term_set:
        if term in doc_term_freq:
            tf = doc_term_freq[term]
            # Get document frequency for this term
            df = doc_freq.get(term, 1)

            # Calculate IDF - use standard BM25 formula
            # Add smoothing to prevent division by zero and negative scores
            idf = math.log((total_docs + 1) / (df + 1)) + 1.0

            # BM25 score calculation
            tf_component = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc_len / avg_doc_len)))
            term_score = idf * tf_component
            score += term_score

            # print(f"    Debug BM25: term='{term}', tf={tf}, df={df}, idf={idf:.3f}, term_score={term_score:.3f}")  # Debug

    # Simple normalization - just divide by number of query terms that matched
    matched_terms = sum(1 for term in query_term_set if term in doc_term_freq)
    if matched_terms > 0:
        score = score / len(query_term_set)  # Normalize by total query terms
        # Add coverage bonus
        coverage = matched_terms / len(query_term_set)
        score = score * (0.5 + 0.5 * coverage)  # Boost score based on coverage

    # print(f"    Debug BM25: final_score={score:.3f}, matched_terms={matched_terms}/{len(query_term_set)}")  # Debug

    return max(score, 0.0)  # Ensure non-negative

def calculate_embedding(text: str, embedding_model) -> List[float] | None:
    """Calculates embedding for a given text using the provided model."""
    if not embedding_model:
        return None
    try:
        # The OpenAIEmbeddings object from langchain might not directly expose an embed_query method
        # that returns a list of floats in a straightforward way for raw embedding calculation.
        # It's designed to be used within Langchain chains.
        # For direct embedding calculation, using the OpenAI client directly is often more suitable.
        # However, if we MUST use the langchain object, we might need to inspect its internal methods
        # or assume it has a compatible interface.
        # A common way is to use `embed_query` or similar.
        # Let's assume `embed_query` returns a list of floats.
        return embedding_model.embed_query(text)
    except Exception as e:
        print(f"Error calculating embedding for text: '{text[:50]}...': {e}")
        return None

def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculates cosine similarity between two vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot_product = sum(v1 * v2 for v1, v2 in zip(vec1, vec2))
    norm_vec1 = math.sqrt(sum(v**2 for v in vec1))
    norm_vec2 = math.sqrt(sum(v**2 for v in vec2))
    if norm_vec1 == 0 or norm_vec2 == 0:
        return 0.0
    return dot_product / (norm_vec1 * norm_vec2)

def pick_most_related(user_query: str, snippets: List[Dict[str, str]], use_bm25: bool = True) -> List[Dict[str, str]]:
    """
    Picks the top 3 most related SQL snippets based on similarity.
    Supports BM25, Jaccard, or Embedding similarity based on config.
    Returns list of top snippets with their scores.
    """
    if not snippets:
        return ""

    cfg = get_config()
    embedding_model = _get_embedding_model()
    # Check both possible config fields for backward compatibility
    use_embedding_retrieval = (getattr(cfg.ai, 'use_embedding_similarity', False) or 
                               getattr(cfg.ai, 'use_embedding', False)) and embedding_model

    if use_embedding_retrieval:
        # Calculate embedding for the user query
        query_embedding = calculate_embedding(user_query, embedding_model)
        if not query_embedding:
            print("❌ Warning: Failed to get query embedding. Falling back to BM25/Jaccard.")
            use_embedding_retrieval = False # Fallback

    snippet_scores = []
    if use_embedding_retrieval:
        print(f"\n🧠 Performing embedding-based search for: '{user_query}'")
        print(f"📊 Total snippets to check: {len(snippets)}")

        embeddings_found = 0
        for i, snippet in enumerate(snippets):
            # Access embedding field properly - could be in different formats
            snippet_embedding = None
            if hasattr(snippet, 'embedding'):
                snippet_embedding = snippet.embedding
            elif isinstance(snippet, dict) and 'embedding' in snippet:
                snippet_embedding = snippet['embedding']

            if not snippet_embedding:
                print(f"⚠️  Snippet #{i+1} '{snippet.get('name', 'Unnamed')[:30]}...' missing embedding")
                continue

            embeddings_found += 1
            score = cosine_similarity(query_embedding, snippet_embedding)
            snippet_scores.append((snippet, score))
            print(f"  ✅ Snippet #{i+1}: '{snippet.get('name', 'Unnamed')[:40]}' - Score: {score:.4f}")

        print(f"📈 Found {embeddings_found}/{len(snippets)} snippets with embeddings")

        if snippet_scores:
            snippet_scores.sort(key=lambda x: x[1], reverse=True)
            best = snippet_scores[0][0]
            print(f"🎯 Top embedding match: '{best.get('name', 'Unnamed')}' with score {snippet_scores[0][1]:.4f}")
        else:
            print("❌ No valid snippet embeddings found. Falling back to BM25/Jaccard.")
            # Fallback if no embeddings were usable
            use_bm25 = True # Ensure fallback occurs
            snippet_scores = [] # Reset scores for fallback

    if not use_embedding_retrieval or not snippet_scores: # Fallback or if embedding not used
        if use_bm25:
            # Prepare corpus statistics for BM25
            all_docs = [s.get("name", "") + " " + s.get("description", "") + " " + s.get("sql", "") for s in snippets]
            doc_lens = [len(re.findall(r"[a-zA-Z0-9]+", doc.lower())) for doc in all_docs]
            avg_doc_len = sum(doc_lens) / len(doc_lens) if doc_lens else 50

            # Build document frequency map
            doc_freq = {}
            for doc in all_docs:
                terms = set(re.findall(r"[a-zA-Z0-9]+", doc.lower()))
                for term in terms:
                    doc_freq[term] = doc_freq.get(term, 0) + 1

            corpus_stats = {
                'avg_doc_len': avg_doc_len,
                'total_docs': len(snippets),
                'doc_freq': doc_freq
            }

            # Calculate scores for all snippets
            for snippet in snippets:
                name = snippet.get("name", "")
                description = snippet.get("description", "")
                sql = snippet.get("sql", "")

                # Combine name and description for better matching
                combined_text = f"{name} {description}".strip()

                name_score = bm25_similarity(user_query, combined_text, corpus_stats=corpus_stats)
                sql_score = bm25_similarity(user_query, sql, corpus_stats=corpus_stats)
                # Weight name/description higher since it's more likely to match user intent
                total_score = name_score * 1.5 + sql_score
                snippet_scores.append((snippet, total_score))

            # Sort by score and get the best one
            snippet_scores.sort(key=lambda x: x[1], reverse=True)
            best = snippet_scores[0][0] if snippet_scores else snippets[0]

            # Debug: Print detailed scores for troubleshooting
            print(f"\n🔍 Fresh BM25 search for: '{user_query}'")
            print(f"📊 Total snippets: {len(snippets)}")
            print(f"📈 Corpus stats: avg_doc_len={corpus_stats['avg_doc_len']:.1f}, total_docs={corpus_stats['total_docs']}")
            # print(f"📝 Doc frequency sample: {dict(list(corpus_stats['doc_freq'].items())[:5])}")

            for i, (snippet, score) in enumerate(snippet_scores):
                name = snippet.get('name', 'Unnamed')
                sql_preview = snippet.get('sql', '')[:50] + '...' if len(snippet.get('sql', '')) > 50 else snippet.get('sql', '')

                # Calculate individual scores for debugging with detailed output
                # print(f"  --- Snippet #{i+1} Analysis ---")
                # print(f"  Name: {name[:60]}")
                # print(f"  SQL Preview: {sql_preview}")

                # Calculate individual scores for debugging with detailed output
                # print(f"  🔤 Calculating name+description score...")
                combined_text_score = bm25_similarity(user_query, snippet.get("name", "") + " " + snippet.get("description", ""), corpus_stats=corpus_stats)
                # print(f"  💾 Calculating SQL score...")
                sql_score_bm25 = bm25_similarity(user_query, snippet.get("sql", ""), corpus_stats=corpus_stats)

                # print(f"  📊 Final: Total={score:.4f} | Name+Desc={combined_text_score:.4f}*1.5 | SQL={sql_score_bm25:.4f}")

                if i >= 2:  # Show top 3 with full detail
                    break

        else:
            # Calculate scores for all snippets using Jaccard similarity
            for snippet in snippets:
                name = snippet.get("name", "")
                description = snippet.get("description", "")
                # Combine name and description for better matching
                combined_text = f"{name} {description}".strip()
                
                name_sim = naive_similarity(user_query, combined_text)
                sql_sim = naive_similarity(user_query, snippet.get("sql", ""))
                # Weight name/description higher since it's more likely to match user intent
                total_score = max(name_sim * 1.5, sql_sim)
                snippet_scores.append((snippet, total_score))

            # Sort by score and get the best one
            snippet_scores.sort(key=lambda x: x[1], reverse=True)
            best = snippet_scores[0][0] if snippet_scores else snippets[0]

            # Debug: Print detailed scores for troubleshooting
            print(f"\n🔍 Fresh Jaccard search for: '{user_query}'")
            print(f"📊 Total snippets: {len(snippets)}")

            for i, (snippet, score) in enumerate(snippet_scores):
                name = snippet.get('name', 'Unnamed')
                sql_preview = snippet.get('sql', '')[:50] + '...' if len(snippet.get('sql', '')) > 50 else snippet.get('sql', '')

                # Calculate individual scores for debugging
                combined_text_score = naive_similarity(user_query, snippet.get("name", "") + " " + snippet.get("description", ""))
                sql_sim_score = naive_similarity(user_query, snippet.get("sql", ""))

                # print(f"  #{i+1} Total Score: {score:.4f} | Name+Desc: {combined_text_score:.4f} | SQL: {sql_sim_score:.4f}")
                # print(f"      Name+Desc: {name[:40]}...")
                # print(f"      SQL: {sql_preview}")
                if i >= 4:  # Show top 5
                    break

    # Return top 3 snippets with scores
    top_snippets = []
    for i, (snippet, score) in enumerate(snippet_scores[:3]):
        top_snippets.append({
            "snippet": snippet,
            "score": score,
            "rank": i + 1
        })
    
    return top_snippets

def synthesize_sql(cfg: Dict[str, Any], user_query: str, schema: str, details: str, candidate_snippets: List[Dict[str, str]], table_name: str, max_rows: int = None) -> str:
    """Return a SQL string. Uses LLM if configured; else offline rules."""
    if cfg["ai"]["offline_demo_mode"]:
        return offline_sql(user_query, table_name, max_rows, candidate_snippets)
    llm = _maybe_llm(cfg["ai"]["model"], cfg["ai"]["temperature"])
    if llm is None:
        # fallback silently
        return offline_sql(user_query, table_name, max_rows, candidate_snippets)

    prompt = ChatPromptTemplate.from_messages([
        ("system", cfg["ai"]["sql_synth_prompt"]),
        ("human",
         "User question:\n{user_query}\n\n"
         "DB schema:\n{schema}\n\n"
         "Additional details:\n{details}\n\n"
         "Top related example patterns (use as reference):\n{candidate_examples}\n\n"
         "Return ONLY a valid SQLite SQL query using the table named {table_name}. "
         "IMPORTANT GUIDELINES:\n"
         "- Always quote column names with double quotes, especially those containing special characters like parentheses, spaces, or hyphens\n"
         "- For current date/time comparisons, use NOW() or CURRENT_DATE functions instead of hardcoded dates\n"
         "- Prefer inclusive operators (>= or <=) over exclusive ones (> or <) unless specifically required\n"
         "- Example: SELECT \"column_name_(extra)\" FROM {table_name} WHERE date_column >= NOW();\n"
         "- For 'this month' queries, use: WHERE strftime('%Y-%m', date_column) = strftime('%Y-%m', NOW())")
    ])
    # Format candidate snippets for the prompt
    examples_text = ""
    if candidate_snippets:
        for item in candidate_snippets:
            snippet = item["snippet"]
            score = item["score"]
            rank = item["rank"]
            
            examples_text += f"-- Example #{rank} (Similarity: {score:.3f})\n"
            examples_text += f"-- Name: {snippet.get('name', 'Unnamed')}\n"
            if snippet.get('description'):
                examples_text += f"-- Description: {snippet.get('description')}\n"
            examples_text += f"-- SQL Pattern:\n{snippet.get('sql', '')}\n\n"
    else:
        examples_text = "-- No similar examples found"

    chain = prompt | llm | StrOutputParser()
    sql = chain.invoke({
        "user_query": user_query,
        "schema": schema,
        "details": details,
        "candidate_examples": examples_text,
        "table_name": table_name,
    })
    # Enhanced sanitization
    sql = sql.strip().strip("`")

    # Remove code fences more robustly
    if "```sql" in sql:
        parts = sql.split("```sql")
        if len(parts) > 1:
            sql = parts[1].split("```")[0].strip()
    elif "```" in sql:
        parts = sql.split("```")
        if len(parts) >= 3:
            sql = parts[1].strip()
        elif len(parts) == 2:
            # Assume SQL is after the first ```
            sql = parts[1].strip()

    # Remove common prefixes that LLMs sometimes add (case-insensitive)
    prefixes_to_remove = [
        "SQL:", "sql:", "Sql:", 
        "Query:", "query:", "Query",
        "SELECT:", "select:", "Select:",
        "SQL Query:", "sql query:", "Sql Query:",
        "SQL Code:", "sql code:", "Sql Code:",
        "Here is the SQL:", "here is the sql:",
        "The SQL is:", "the sql is:",
    ]
    
    # Check for prefixes case-insensitively
    sql_lower = sql.lower()
    for prefix in prefixes_to_remove:
        prefix_lower = prefix.lower()
        if sql_lower.startswith(prefix_lower):
            sql = sql[len(prefix):].strip()
            break
    
    # Also remove standalone "sql" word at the beginning
    if sql_lower.startswith("sql ") and not sql_lower.startswith("select"):
        sql = sql[4:].strip()

    # Remove any leading/trailing whitespace and ensure single statement
    sql = sql.strip()
    if ";" in sql:
        sql = sql.split(";")[0].strip()

    # Ensure it ends with semicolon
    if not sql.endswith(";"):
        sql += ";"

    return sql

def offline_sql(user_query: str, table_name: str, max_rows: int = None, candidate_snippets: List[Dict[str, str]] = None) -> str:
    """Simple rule-based SQL generation for demo purposes."""
    q = user_query.lower().strip()

    # Add LIMIT clause if max_rows is specified
    limit_clause = f" LIMIT {max_rows}" if max_rows else ""

    # Basic patterns
    if any(word in q for word in ["count", "how many", "total number"]):
        return f'SELECT COUNT(*) as count FROM "{table_name}"{limit_clause};'
    elif any(word in q for word in ["sum", "total revenue", "total sales"]):
        # Try to find a likely numeric column
        if "revenue" in q or "sales" in q:
            return f'SELECT SUM("revenue") as total FROM "{table_name}"{limit_clause};'
        return f'SELECT * FROM "{table_name}"{limit_clause};'
    elif any(word in q for word in ["top", "best", "highest", "maximum"]):
        return f'SELECT * FROM "{table_name}" ORDER BY "revenue" DESC{limit_clause};'
    elif any(word in q for word in ["recent", "latest", "newest"]):
        return f'SELECT * FROM "{table_name}" ORDER BY rowid DESC{limit_clause};'
    else:
        # Default fallback - always return valid SQL
        return f'SELECT * FROM "{table_name}"{limit_clause};'

def answer_with_data(cfg: Dict[str, Any], user_query: str, sql: str, columns: List[str], rows: List[dict], error_message: str = None) -> str:
    """Use LLM to craft a concise answer from rows; fallback to a textual summary."""
    if cfg["ai"]["offline_demo_mode"]:
        return offline_answer(user_query, sql, columns, rows, error_message)
    agent_temp = cfg["ai"].get("agent_temperature", cfg["ai"]["temperature"])
    llm = _maybe_llm(cfg["ai"]["model"], agent_temp)
    if llm is None:
        return offline_answer(user_query, sql, columns, rows, error_message)

    # Get current date and time
    current_datetime = datetime.now()
    current_date_str = current_datetime.strftime("%Y-%m-%d")
    current_month_year = current_datetime.strftime("%B %Y")

    system = cfg["ai"]["system_prompt"]
    prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        ("human",
         "CURRENT DATE AND TIME: Today is {current_date} ({current_month_year})\n\n"
         "User question: {user_query}\n\n"
         "SQL used: {sql}\n\n"
         "Columns: {columns}\n\n"
         "Rows (JSON-like):\n{rows}\n\n"
         "Answer succinctly and include a 1-line takeaway. "
         "When referring to time periods like 'this month', 'today', etc., use the current date provided above.")
    ])
    chain = prompt | llm | StrOutputParser()
    # Limit rows rendered into prompt to avoid context blow-up
    cfg = get_config()
    max_rows = getattr(cfg.ai, 'max_rows_for_ai', 50)  # Default to 50 if not set
    head = rows[:max_rows]
    return chain.invoke({
        "user_query": user_query,
        "sql": sql,
        "columns": columns,
        "rows": head,
        "current_date": current_date_str,
        "current_month_year": current_month_year,
    })

def offline_answer(user_query: str, sql: str, columns: List[str], rows: List[dict], error_message: str = None) -> str:
    if error_message:
        # Handle SQL error case
        if "Only SELECT/WITH" in error_message or "read-only queries are allowed" in error_message:
            return "❌ **Error**: Only SELECT, WITH, and other read-only queries are allowed in demo mode. Please ask questions that retrieve or analyze data rather than modify it."
        elif "no such column" in error_message.lower():
            return f"❌ **Column Error**: {error_message}. Please check the available columns in the schema above or try using different column names."
        elif "syntax error" in error_message.lower():
            return f"❌ **SQL Syntax Error**: {error_message}. The generated SQL had syntax issues. Try rephrasing your question with simpler terms."
        elif "no such table" in error_message.lower():
            return f"❌ **Table Error**: {error_message}. The query referenced a table that doesn't exist. Please refer to the schema shown above."
        elif "Got:" in error_message:
            # Extract the problematic SQL snippet from our enhanced error message
            return f"❌ **Query Type Error**: {error_message}. Please ask questions that can be answered with SELECT queries."
        else:
            return f"❌ **Query Error**: {error_message}. Try rephrasing your question or check if the requested data exists in the available columns."

    n = len(rows)
    if n == 0:
        return "I ran your query but found no matching rows. Try broadening your search criteria or check if the data you're looking for exists."

    preview = rows[:5]
    # Enhanced summary heuristics
    if any("revenue" in c.lower() or "total" in c.lower() for c in columns) and n <= 10:
        # Report top results
        parts = []
        for r in preview[:3]:
            if "item" in r and any(k in r for k in ["revenue", "total"]):
                value_key = next(k for k in r.keys() if "revenue" in k.lower() or "total" in k.lower())
                parts.append(f'{r["item"]}: {r[value_key]}')
        if parts:
            return "**Top results:** " + "; ".join(parts)

    if "count" in sql.lower() and len(columns) == 1:
        return f"**Count result:** {rows[0][columns[0]]} items found."

    if "distinct" in sql.lower():
        return f"Found {n} unique values. Preview shown above."

    return f"**Query successful:** Returned {n} rows. Showing first {min(5,n)} above."

# Initialize configuration
load_config()