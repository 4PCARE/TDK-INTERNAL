"""
NLP Service - FastAPI placeholder
Health checks only; LangChain NLP tasks to be added in Phase 2+
"""
from fastapi import FastAPI

app = FastAPI(title="NLP Service", version="1.0.0")

@app.get("/healthz")
def healthz():
    """Health check endpoint"""
    return {"status": "ok", "service": "nlp-svc"}

@app.get("/readyz")
def readyz():
    """Readiness check endpoint"""
    return {"status": "ready", "service": "nlp-svc"}