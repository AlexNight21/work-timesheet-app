"""Генерация Excel-отчёта по шаблону."""

from __future__ import annotations

import warnings
from copy import copy
from dataclasses import dataclass
from datetime import date, datetime, time
from pathlib import Path
from typing import Sequence

from openpyxl import load_workbook
from openpyxl.styles.cell_style import StyleArray
from openpyxl.worksheet.worksheet import Worksheet

from app.models.schemas import DayEntry, ReportRequest
from app.services.period import WeekPeriod, build_weeks
from app.services.translit import build_report_filename

PROJECT_SEPARATOR = " / "
WEEK_LABEL = "Отчетность за неделю:"
TOTAL_LABEL = "Итого "
TABLE_HEADERS = (
    "День недели",
    "Дата",
    "Время: начала",
    "Время: окончания",
    "Время: обеда",
    "Проект",
    "Итого",
)

TIMESHEET_SHEET_INDEX = 0
REFERENCE_SHEET_INDEX = 1

# Строки шаблона, с которых снимаются стили.
WEEK_HEADER_ROW = 9
WEEK_BLANK_ROW = 10
TABLE_HEADER_ROW = 11
DATA_ROW = 12
BUFFER_ROW = 16
TOTAL_ROW = 17

REFERENCE_PROJECT_HEADER_ROW = 1
REFERENCE_PROJECT_DATA_ROW = 2
REFERENCE_WEEK_HEADER_ROW = 12
REFERENCE_WEEK_DATA_ROW = 13


@dataclass(frozen=True)
class RowTemplate:
    styles: tuple[StyleArray, ...]
    height: float | None


@dataclass(frozen=True)
class GeneratedReport:
    path: Path
    filename: str
    total_minutes: int


class TimesheetReportGenerator:
    """Заполняет шаблон и сохраняет готовый Excel-файл."""

    def __init__(self, template_path: Path, reports_dir: Path) -> None:
        self._template_path = template_path
        self._reports_dir = reports_dir

    def generate(
        self,
        request: ReportRequest,
        projects: Sequence[str] | None = None,
    ) -> GeneratedReport:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Data Validation extension is not supported.*",
            )
            workbook = load_workbook(self._template_path)

        timesheet = workbook.worksheets[TIMESHEET_SHEET_INDEX]
        reference = workbook.worksheets[REFERENCE_SHEET_INDEX]

        self._fill_header(timesheet, request)
        weeks = build_weeks(request.period_start, request.period_end)
        entries = {entry.date: entry for entry in request.entries}

        templates = self._capture_timesheet_templates(timesheet)
        self._clear_timesheet_blocks(timesheet)
        total_minutes = self._write_weeks(timesheet, weeks, entries, templates)

        self._fill_reference_sheet(
            reference,
            projects if projects is not None else self._used_projects(request),
            weeks,
        )

        workbook.calculation.fullCalcOnLoad = True
        workbook.calculation.forceFullCalc = True

        self._reports_dir.mkdir(parents=True, exist_ok=True)
        filename = build_report_filename(
            request.employee,
            request.period_start,
            request.period_end,
        )
        path = self._reports_dir / filename
        workbook.save(path)

        return GeneratedReport(
            path=path,
            filename=filename,
            total_minutes=total_minutes,
        )

    def _fill_header(self, ws: Worksheet, request: ReportRequest) -> None:
        ws["B2"] = request.company
        ws["D3"] = request.employee
        ws["D4"] = request.department
        ws["D5"] = request.manager
        ws["H7"] = datetime.combine(request.fill_date, time.min)

    def _capture_timesheet_templates(
        self,
        ws: Worksheet,
    ) -> dict[str, RowTemplate]:
        return {
            "week_header": self._snapshot_row(ws, WEEK_HEADER_ROW),
            "week_blank": self._snapshot_row(ws, WEEK_BLANK_ROW),
            "table_header": self._snapshot_row(ws, TABLE_HEADER_ROW),
            "data": self._snapshot_row(ws, DATA_ROW),
            "buffer": self._snapshot_row(ws, BUFFER_ROW),
            "total": self._snapshot_row(ws, TOTAL_ROW),
        }

    def _clear_timesheet_blocks(self, ws: Worksheet) -> None:
        # Сначала снимаем объединения, иначе delete_rows оставит «висячие» диапазоны.
        for merged_range in list(ws.merged_cells.ranges):
            if merged_range.min_row >= WEEK_HEADER_ROW:
                ws.unmerge_cells(str(merged_range))

        if ws.max_row >= WEEK_HEADER_ROW:
            ws.delete_rows(WEEK_HEADER_ROW, ws.max_row - WEEK_HEADER_ROW + 1)

    def _write_weeks(
        self,
        ws: Worksheet,
        weeks: list[WeekPeriod],
        entries: dict[date, DayEntry],
        templates: dict[str, RowTemplate],
    ) -> int:
        # Недельные блоки начинаются с 9-й строки, перед ними остаётся пустая строка 8.
        header_row = WEEK_HEADER_ROW
        total_minutes = 0

        for index, week in enumerate(weeks):
            if index > 0:
                header_row += 1  # пустая строка-разделитель между неделями

            total_row = self._write_week(
                ws,
                week,
                entries,
                templates,
                header_row,
            )
            total_minutes += sum(
                entries[day].worked_minutes for day in week.days
            )
            header_row = total_row + 1

        return total_minutes

    def _write_week(
        self,
        ws: Worksheet,
        week: WeekPeriod,
        entries: dict[date, DayEntry],
        templates: dict[str, RowTemplate],
        header_row: int,
    ) -> int:
        self._apply_row(ws, header_row, templates["week_header"])
        ws.merge_cells(
            start_row=header_row,
            start_column=2,
            end_row=header_row,
            end_column=3,
        )
        ws.cell(header_row, 2, WEEK_LABEL)
        ws.cell(header_row, 4, datetime.combine(week.start, time.min))
        ws.cell(header_row, 5, datetime.combine(week.end, time.min))

        blank_row = header_row + 1
        self._apply_row(ws, blank_row, templates["week_blank"])

        table_header_row = header_row + 2
        self._apply_row(ws, table_header_row, templates["table_header"])
        for column, title in enumerate(TABLE_HEADERS, start=2):
            ws.cell(table_header_row, column, title)

        first_data_row = table_header_row + 1
        for offset, day in enumerate(week.days):
            row = first_data_row + offset
            entry = entries[day]
            self._apply_row(ws, row, templates["data"])
            ws.cell(row, 2, f"=WEEKDAY(C{row})")
            ws.cell(row, 3, datetime.combine(day, time.min))
            ws.cell(row, 4, entry.start_time)
            ws.cell(row, 5, entry.end_time)
            ws.cell(row, 6, entry.lunch_time)
            ws.cell(row, 7, self._project_text(entry))
            ws.cell(row, 8, f"=E{row}-D{row}-F{row}")

        buffer_row = first_data_row + len(week.days)
        self._apply_row(ws, buffer_row, templates["buffer"])

        total_row = buffer_row + 1
        self._apply_row(ws, total_row, templates["total"])
        ws.cell(total_row, 5, TOTAL_LABEL)
        ws.cell(total_row, 8, f"=SUM(H{first_data_row}:H{buffer_row})")
        week_minutes = sum(entries[day].worked_minutes for day in week.days)
        ws.cell(total_row, 9, self._hours_label(week_minutes))

        return total_row

    def _fill_reference_sheet(
        self,
        ws: Worksheet,
        projects: Sequence[str],
        weeks: list[WeekPeriod],
    ) -> None:
        project_header = self._snapshot_row(
            ws,
            REFERENCE_PROJECT_HEADER_ROW,
            max_column=2,
        )
        project_data = self._snapshot_row(
            ws,
            REFERENCE_PROJECT_DATA_ROW,
            max_column=2,
        )
        week_header = self._snapshot_row(
            ws,
            REFERENCE_WEEK_HEADER_ROW,
            max_column=2,
        )
        week_data = self._snapshot_row(
            ws,
            REFERENCE_WEEK_DATA_ROW,
            max_column=2,
        )

        if ws.max_row > REFERENCE_PROJECT_HEADER_ROW:
            ws.delete_rows(
                REFERENCE_PROJECT_HEADER_ROW,
                ws.max_row - REFERENCE_PROJECT_HEADER_ROW + 1,
            )

        self._apply_row(ws, REFERENCE_PROJECT_HEADER_ROW, project_header, 2)
        ws.cell(REFERENCE_PROJECT_HEADER_ROW, 1, "№")
        ws.cell(REFERENCE_PROJECT_HEADER_ROW, 2, "Проекты")

        row = REFERENCE_PROJECT_DATA_ROW
        for number, project in enumerate(projects, start=1):
            self._apply_row(ws, row, project_data, 2)
            ws.cell(row, 1, number)
            ws.cell(row, 2, project)
            row += 1

        week_header_row = row + 1
        self._apply_row(ws, week_header_row, week_header, 2)
        ws.cell(week_header_row, 1, "Неделя")
        ws.cell(week_header_row, 2, "Даты")

        row = week_header_row + 1
        for week in weeks:
            for day in week.days:
                self._apply_row(ws, row, week_data, 2)
                ws.cell(row, 1, f"{week.number} неделя")
                ws.cell(row, 2, datetime.combine(day, time.min))
                row += 1

    @staticmethod
    def _used_projects(request: ReportRequest) -> list[str]:
        projects: list[str] = []
        seen: set[str] = set()
        for entry in request.entries:
            if entry.project.casefold() in seen:
                continue
            seen.add(entry.project.casefold())
            projects.append(entry.project)
        return projects

    @staticmethod
    def _project_text(entry: DayEntry) -> str:
        if entry.details:
            return f"{entry.project}{PROJECT_SEPARATOR}{entry.details}"
        return entry.project

    @staticmethod
    def _hours_label(minutes: int) -> str:
        hours = minutes // 60
        tail = minutes % 60
        if tail:
            return f"<-{hours} ч {tail:02d} мин"
        if hours % 10 == 1 and hours % 100 != 11:
            word = "час"
        elif 2 <= hours % 10 <= 4 and not 12 <= hours % 100 <= 14:
            word = "часа"
        else:
            word = "часов"
        return f"<-{hours} {word}"

    @staticmethod
    def _snapshot_row(
        ws: Worksheet,
        row: int,
        max_column: int = 9,
    ) -> RowTemplate:
        styles = tuple(
            copy(ws.cell(row=row, column=column)._style)
            for column in range(1, max_column + 1)
        )
        return RowTemplate(
            styles=styles,
            height=ws.row_dimensions[row].height,
        )

    @staticmethod
    def _apply_row(
        ws: Worksheet,
        row: int,
        template: RowTemplate,
        max_column: int | None = None,
    ) -> None:
        columns = max_column or len(template.styles)
        for column in range(1, columns + 1):
            ws.cell(row=row, column=column)._style = copy(
                template.styles[column - 1]
            )
        if template.height is not None:
            ws.row_dimensions[row].height = template.height
