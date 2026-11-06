"""Модели запросов и ответов API."""

from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.period import iter_days, iter_workdays


class DictionariesResponse(BaseModel):
    companies: list[str] = Field(default_factory=list)
    employees: list[str] = Field(default_factory=list)
    departments: list[str] = Field(default_factory=list)
    managers: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)


class DictionaryCreateRequest(BaseModel):
    value: str = Field(min_length=1, max_length=300)

    @field_validator("value")
    @classmethod
    def normalize_value(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Значение не может быть пустым")
        return value


class DictionaryCreateResponse(BaseModel):
    kind: str
    value: str


class DayProject(BaseModel):
    project: str = Field(min_length=1, max_length=300)
    details: str | None = Field(default=None, max_length=2000)

    @field_validator("project")
    @classmethod
    def normalize_project(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Проект не может быть пустым")
        return value

    @field_validator("details")
    @classmethod
    def normalize_details(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class DayEntry(BaseModel):
    date: date
    start_time: time | None = None
    end_time: time | None = None
    lunch_time: time | None = None
    projects: list[DayProject] = Field(default_factory=list)
    absence_reason: str | None = Field(default=None, max_length=300)

    @field_validator("absence_reason")
    @classmethod
    def normalize_absence_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def validate_day(self) -> "DayEntry":
        if self.absence_reason:
            if self.projects:
                raise ValueError(
                    "Для дня отсутствия проекты не указываются"
                )
            return self

        if not self.projects:
            raise ValueError(
                "Укажите хотя бы один проект или причину отсутствия"
            )
        if (
            self.start_time is None
            or self.end_time is None
            or self.lunch_time is None
        ):
            raise ValueError(
                "Для рабочего дня укажите время начала, окончания и обеда"
            )

        start = self.start_time.hour * 60 + self.start_time.minute
        end = self.end_time.hour * 60 + self.end_time.minute
        lunch = self.lunch_time.hour * 60 + self.lunch_time.minute

        if end <= start:
            raise ValueError("Время окончания должно быть позже времени начала")
        if lunch >= end - start:
            raise ValueError("Время обеда должно быть меньше рабочего интервала")
        return self

    @property
    def worked_minutes(self) -> int:
        if (
            self.absence_reason
            or self.start_time is None
            or self.end_time is None
            or self.lunch_time is None
        ):
            return 0

        start = self.start_time.hour * 60 + self.start_time.minute
        end = self.end_time.hour * 60 + self.end_time.minute
        lunch = self.lunch_time.hour * 60 + self.lunch_time.minute
        return end - start - lunch


class ReportRequest(BaseModel):
    company: str = Field(min_length=1, max_length=300)
    employee: str = Field(min_length=1, max_length=300)
    department: str = Field(min_length=1, max_length=300)
    manager: str = Field(min_length=1, max_length=300)
    fill_date: date
    period_start: date
    period_end: date
    entries: list[DayEntry] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_period(self) -> "ReportRequest":
        if self.period_start > self.period_end:
            raise ValueError("Начало периода не может быть позже окончания")

        workdays = set(iter_workdays(self.period_start, self.period_end))
        allowed_days = set(iter_days(self.period_start, self.period_end))

        entry_dates = {entry.date for entry in self.entries}
        if len(entry_dates) != len(self.entries):
            raise ValueError("Даты в ежедневных записях не должны повторяться")

        missing = sorted(workdays - entry_dates)
        if missing:
            dates = ", ".join(day.strftime("%d.%m.%Y") for day in missing)
            raise ValueError(f"Не заполнены рабочие дни: {dates}")

        extra = sorted(entry_dates - allowed_days)
        if extra:
            dates = ", ".join(day.strftime("%d.%m.%Y") for day in extra)
            raise ValueError(f"Указаны дни вне периода: {dates}")

        return self

    @property
    def total_minutes(self) -> int:
        return sum(entry.worked_minutes for entry in self.entries)
