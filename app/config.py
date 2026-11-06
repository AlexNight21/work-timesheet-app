"""Пути и общие настройки приложения."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = DATA_DIR / "storage"
REPORTS_DIR = DATA_DIR / "reports"

SRC_DIR = BASE_DIR / "src"
TEMPLATES_DIR = SRC_DIR / "templates"
STATIC_DIR = SRC_DIR / "static"

# Справочники хранятся в обычных текстовых файлах: одна запись — одна строка.
DICTIONARY_FILES: dict[str, Path] = {
    "companies": STORAGE_DIR / "companies.txt",
    "employees": STORAGE_DIR / "employees.txt",
    "departments": STORAGE_DIR / "departments.txt",
    "managers": STORAGE_DIR / "managers.txt",
    "projects": STORAGE_DIR / "projects.txt",
}

DICTIONARY_LABELS: dict[str, str] = {
    "companies": "компания",
    "employees": "сотрудник",
    "departments": "подразделение",
    "managers": "менеджер",
    "projects": "проект",
}
