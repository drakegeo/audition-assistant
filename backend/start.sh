#!/bin/bash
set -euo pipefail
exec uv run uvicorn src.api.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers 1
