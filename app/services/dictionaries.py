"""Хранение справочников в текстовых файлах."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Mapping


class DictionaryError(Exception):
    """Базовая ошибка справочника."""


class DictionaryValueExists(DictionaryError):
    """Такое значение уже есть в справочнике."""


class UnknownDictionary(DictionaryError):
    """Запрошен неизвестный справочник."""


class TextDictionary:
    """Один справочник: одна запись на строку в UTF-8."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        return self._path

    def read(self) -> list[str]:
        if not self._path.exists():
            return []
        with self._lock:
            return self._read_unlocked()

    def add(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise DictionaryError("Значение не может быть пустым")

        with self._lock:
            values = self._read_unlocked()
            folded = {item.casefold() for item in values}
            if value.casefold() in folded:
                raise DictionaryValueExists("Такое значение уже добавлено")

            values.append(value)
            self._path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = self._path.with_suffix(self._path.suffix + ".tmp")
            temp_path.write_text("\n".join(values) + "\n", encoding="utf-8")
            temp_path.replace(self._path)
        return value

    def _read_unlocked(self) -> list[str]:
        if not self._path.exists():
            return []
        content = self._path.read_text(encoding="utf-8")
        values: list[str] = []
        seen: set[str] = set()
        for line in content.splitlines():
            value = line.strip()
            if not value:
                continue
            folded = value.casefold()
            if folded in seen:
                continue
            seen.add(folded)
            values.append(value)
        return values


class DictionaryRepository:
    """Набор справочников приложения."""

    def __init__(self, files: Mapping[str, Path]) -> None:
        self._dictionaries = {
            kind: TextDictionary(path) for kind, path in files.items()
        }

    @property
    def kinds(self) -> tuple[str, ...]:
        return tuple(self._dictionaries)

    def get(self, kind: str) -> list[str]:
        return self._get(kind).read()

    def get_all(self) -> dict[str, list[str]]:
        return {kind: store.read() for kind, store in self._dictionaries.items()}

    def add(self, kind: str, value: str) -> str:
        return self._get(kind).add(value)

    def _get(self, kind: str) -> TextDictionary:
        try:
            return self._dictionaries[kind]
        except KeyError as exc:
            raise UnknownDictionary(f"Неизвестный справочник: {kind}") from exc
