from __future__ import annotations

import re
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="NovaForge Python Analysis Service", version="0.1.0")


class AnalyzeRequest(BaseModel):
    files: dict[str, str] = Field(default_factory=dict)


class AnalyzeResponse(BaseModel):
    ok: bool
    warnings: List[str]
    score: int


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "service": "novaforge-python-api"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    warnings: list[str] = []
    joined = "\n".join(payload.files.values())

    if "eval(" in joined:
        warnings.append("Avoid eval; it is unsafe in shared coding environments.")
    if re.search(r"process\.env\.[A-Z0-9_]*KEY", joined):
        warnings.append("Do not expose API keys to frontend code.")
    if len(joined) > 250_000:
        warnings.append("Workspace is large for free-tier analysis; analyze changed files only.")

    score = max(40, 100 - len(warnings) * 20)
    return AnalyzeResponse(ok=True, warnings=warnings, score=score)


@app.post("/smoke")
def smoke() -> dict[str, object]:
    return {
        "ok": True,
        "checks": [
            "FastAPI route reachable",
            "Static analyzer ready",
            "Free-tier CPU-friendly mode enabled",
        ],
    }
