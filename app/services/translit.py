"""Транслитерация ФИО для имени файла отчёта."""

from __future__ import annotations

import re
from datetime import date

_TRANSLIT: dict[str, str] = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}

for _cyrillic, _latin in list(_TRANSLIT.items()):
    _TRANSLIT[_cyrillic.upper()] = _latin.upper()


def transliterate(text: str) -> str:
    return "".join(_TRANSLIT.get(char, char) for char in text)


def _sanitize(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", value)


def _capitalize(value: str) -> str:
    if not value:
        return value
    return value[0].upper() + value[1:]


def employee_filename_part(full_name: str) -> str:
    """Иванов Иван Иванович -> IvanovII."""
    parts = [part for part in full_name.split() if part]
    if not parts:
        return "Employee"

    surname = _sanitize(transliterate(parts[0]))
    initials = "".join(
        _sanitize(transliterate(part))[:1].upper()
        for part in parts[1:]
        if part
    )
    result = _capitalize(surname) + initials
    return result or "Employee"


def build_report_filename(employee: str, start: date, end: date) -> str:
    """TimeSheet_IvanovII_111026-271026.xlsx."""
    part = employee_filename_part(employee)
    return f"TimeSheet_{part}_{start:%d%m%y}-{end:%d%m%y}.xlsx"
