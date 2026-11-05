"""Точка входа FastAPI-приложения."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

# Позволяет запускать файл напрямую: `uv run app/main.py`.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.routes import router
from app.config import (
    DICTIONARY_FILES,
    REPORTS_DIR,
    STATIC_DIR,
    STORAGE_DIR,
    TEMPLATES_DIR,
)
from app.services.dictionaries import DictionaryRepository

templates = Jinja2Templates(directory=TEMPLATES_DIR)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    app.state.dictionaries = DictionaryRepository(DICTIONARY_FILES)
    yield


app = FastAPI(
    title="Work Timesheet App",
    description="Заполнение табеля учёта рабочего времени и выгрузка в Excel.",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(router)


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
