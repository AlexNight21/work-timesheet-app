"""HTTP-маршруты приложения."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from app.config import DICTIONARY_LABELS, REPORTS_DIR
from app.models.schemas import (
    DictionaryCreateRequest,
    DictionaryCreateResponse,
    DictionariesResponse,
    ReportRequest,
)
from app.services.dictionaries import (
    DictionaryRepository,
    DictionaryValueExists,
    UnknownDictionary,
)
from app.services.report import TimesheetReportGenerator

router = APIRouter()

XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def get_repository(request: Request) -> DictionaryRepository:
    return request.app.state.dictionaries


@router.get("/api/dictionaries", response_model=DictionariesResponse)
def read_dictionaries(
    repository: DictionaryRepository = Depends(get_repository),
) -> DictionariesResponse:
    return DictionariesResponse(**repository.get_all())


@router.post(
    "/api/dictionaries/{kind}",
    response_model=DictionaryCreateResponse,
)
def add_dictionary_value(
    kind: str,
    payload: DictionaryCreateRequest,
    repository: DictionaryRepository = Depends(get_repository),
) -> DictionaryCreateResponse:
    if kind not in DICTIONARY_LABELS:
        raise HTTPException(status_code=404, detail="Неизвестный справочник")

    try:
        value = repository.add(kind, payload.value)
    except DictionaryValueExists as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except UnknownDictionary as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return DictionaryCreateResponse(kind=kind, value=value)


@router.post("/api/report")
def create_report(
    payload: ReportRequest,
    repository: DictionaryRepository = Depends(get_repository),
) -> dict[str, object]:
    generator = TimesheetReportGenerator(reports_dir=REPORTS_DIR)
    result = generator.generate(payload, repository.get("projects"))

    return {
        "filename": result.filename,
        "download_url": f"/api/report/{result.filename}",
        "total_minutes": result.total_minutes,
        "total_hours": round(result.total_minutes / 60, 2),
    }


@router.get("/api/report/{filename}")
def download_report(filename: str) -> FileResponse:
    if Path(filename).name != filename:
        raise HTTPException(status_code=404, detail="Файл не найден")

    path = (REPORTS_DIR / filename).resolve()
    if path.parent != REPORTS_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(
        path,
        media_type=XLSX_MEDIA_TYPE,
        filename=filename,
    )
