.PHONY: install-backend install-frontend dev-backend dev-frontend

install-backend:
	cd backend && uv sync --extra dev

install-frontend:
	cd tool-frontend && npm install

# Run each in a separate terminal — make can't background both cleanly.
dev-backend:
	cd backend && uv run uvicorn src.api.main:app --reload --port 8000

dev-frontend:
	cd tool-frontend && npm run dev

test-backend:
	cd backend && uv run pytest
