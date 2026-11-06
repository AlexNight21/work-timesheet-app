"""Генерация Excel-отчёта с нуля, без файла-шаблона."""

from __future__ import annotations

import textwrap
from dataclasses import dataclass
from datetime import date, datetime, time
from pathlib import Path
from typing import Sequence

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Color, Font, PatternFill, Side
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

# Цвета соответствуют офисной теме, использованной в образце.
_TEXT_COLOR = Color(rgb="FF000000")
_TITLE_COLOR = Color(rgb="FF2F5496")
_GRID_COLOR = Color(rgb="FFBFBFBF")
_DARK_GRID_COLOR = Color(rgb="FF7F7F7F")
_TOTAL_COLOR = Color(rgb="FF2F5496")

_FILL_ACCENT = PatternFill(
    fill_type="solid",
    fgColor=Color(rgb="FFBDD7EE"),
    bgColor=Color(indexed=64),
)
_FILL_WHITE = PatternFill(
    fill_type="solid",
    fgColor=Color(rgb="FFFFFFFF"),
    bgColor=Color(indexed=64),
)

_FONT_TITLE = Font(
    name="Verdana",
    size=16,
    underline="single",
    color=_TITLE_COLOR,
)
_FONT_LABEL = Font(name="Verdana", size=9, italic=True, color=_TEXT_COLOR)
_FONT_9 = Font(name="Verdana", size=9, color=_TEXT_COLOR)
_FONT_9_BOLD = Font(name="Verdana", size=9, bold=True, color=_TITLE_COLOR)
_FONT_10_BOLD = Font(name="Verdana", size=10, bold=True, color=_TITLE_COLOR)
_FONT_8 = Font(name="Verdana", size=8, color=_TEXT_COLOR)
_FONT_11 = Font(name="Calibri", size=11, color=_TEXT_COLOR)
_FONT_SHEET_HEADER = Font(
    name="Verdana",
    size=10,
    italic=True,
    color=_TEXT_COLOR,
)
_FONT_TOTAL_H = Font(name="Verdana", size=10, bold=True, color=_TOTAL_COLOR)
_FONT_TOTAL_I = Font(name="Calibri", size=11, color=_DARK_GRID_COLOR)

_THIN = Side(style="thin", color=_GRID_COLOR)
_THIN_DARK = Side(style="thin", color=_DARK_GRID_COLOR)
_THIN_INDEXED = Side(style="thin", color=Color(indexed=64))
_DOUBLE = Side(style="double", color=_GRID_COLOR)

_BORDER_THIN = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)
_BORDER_BOTTOM_DARK = Border(bottom=_THIN_DARK)
_BORDER_BOTTOM_DOUBLE = Border(bottom=_DOUBLE)
_BORDER_WEEK_HEADER = Border(bottom=_THIN_INDEXED)
_BORDER_BUFFER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_DOUBLE)
_BORDER_C_FIRST = Border(
    left=_THIN,
    right=_THIN,
    top=_DOUBLE,
    bottom=_THIN,
)
_BORDER_C_REST = Border(
    left=_THIN,
    right=_THIN,
    top=_THIN,
    bottom=_THIN,
)

_ALIGN_CENTER = Alignment(horizontal="center", vertical="center")
_ALIGN_LEFT = Alignment(horizontal="left", vertical="center")
_ALIGN_RIGHT = Alignment(horizontal="right", vertical="center")
_ALIGN_CENTER_WRAP = Alignment(
    horizontal="center",
    vertical="center",
    wrap_text=True,
)
_ALIGN_LEFT_WRAP = Alignment(
    horizontal="left",
    vertical="center",
    wrap_text=True,
)
_ALIGN_VERTICAL = Alignment(vertical="center")
_ALIGN_LEFT_ONLY = Alignment(horizontal="left")

_TIMESHEET_COLUMN_WIDTHS = {
    "A": 1.0,
    "B": 14.0,
    "C": 11.6640625,
    "D": 14.5546875,
    "E": 18.33203125,
    "F": 13.0,
    "G": 61.5546875,
    "H": 15.77734375,
    "I": 25.33203125,
    "J": 9.109375,
    "K": 20.44140625,
    "L": 22.0,
    "M": 9.109375,
}
_REFERENCE_COLUMN_WIDTHS = {
    "A": 9.5546875,
    "B": 99.88671875,
}

WEEK_HEADER_ROW = 9
REFERENCE_PROJECT_HEADER_ROW = 1
REFERENCE_PROJECT_DATA_ROW = 2
REFERENCE_WEEK_HEADER_ROW = 12
REFERENCE_WEEK_DATA_ROW = 13


@dataclass(frozen=True)
class GeneratedReport:
    path: Path
    filename: str
    total_minutes: int


class TimesheetReportGenerator:
    """Создаёт Excel-отчёт с нуля, повторяя структуру образца."""

    def __init__(self, reports_dir: Path) -> None:
        self._reports_dir = reports_dir

    def generate(
        self,
        request: ReportRequest,
        projects: Sequence[str] | None = None,
    ) -> GeneratedReport:
        workbook = Workbook()
        timesheet = workbook.active
        timesheet.title = "Лист1"
        reference = workbook.create_sheet("Лист2")

        self._configure_workbook(workbook)
        self._setup_timesheet(timesheet)
        self._write_header(timesheet, request)

        optional_days = [
            entry.date for entry in request.entries if entry.date.weekday() >= 5
        ]
        weeks = build_weeks(
            request.period_start,
            request.period_end,
            optional_days,
        )
        entries = {entry.date: entry for entry in request.entries}
        total_minutes = self._write_weeks(timesheet, weeks, entries)

        self._write_reference_sheet(
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

    @staticmethod
    def _configure_workbook(workbook: Workbook) -> None:
        props = workbook.properties
        props.creator = ""
        props.lastModifiedBy = ""
        props.title = ""
        props.subject = ""
        props.description = ""
        props.keywords = ""
        props.category = ""

    @staticmethod
    def _setup_timesheet(ws: Worksheet) -> None:
        for column, width in _TIMESHEET_COLUMN_WIDTHS.items():
            ws.column_dimensions[column].width = width
        ws.page_setup.orientation = "portrait"
        ws.page_setup.paperSize = 9

    def _write_header(self, ws: Worksheet, request: ReportRequest) -> None:
        ws.merge_cells("B1:H1")
        self._style_cell(
            ws["B1"],
            value="Еженедельный табель учета рабочего времени в разрезе проектов",
            font=_FONT_TITLE,
            alignment=_ALIGN_CENTER,
        )
        ws.row_dimensions[1].height = 19.8

        ws.merge_cells("B2:H2")
        self._style_cell(
            ws["B2"],
            value=request.company,
            font=_FONT_LABEL,
            alignment=_ALIGN_CENTER,
        )

        ws.merge_cells("B3:C3")
        self._style_cell(
            ws["B3"],
            value="ФИО сотрудника:",
            font=_FONT_LABEL,
            alignment=_ALIGN_LEFT,
        )
        self._style_cell(
            ws["D3"],
            value=request.employee,
            font=_FONT_11,
            fill=_FILL_ACCENT,
            border=_BORDER_BOTTOM_DARK,
            alignment=_ALIGN_LEFT,
        )
        for column in range(5, 9):
            ws.cell(3, column).border = _BORDER_BOTTOM_DARK
        ws.merge_cells("D3:H3")

        ws.merge_cells("B4:C4")
        self._style_cell(
            ws["B4"],
            value="Подразделение:",
            font=_FONT_LABEL,
            alignment=_ALIGN_LEFT,
        )
        self._style_cell(
            ws["D4"],
            value=request.department,
            font=_FONT_11,
            border=_BORDER_BOTTOM_DARK,
            alignment=_ALIGN_LEFT,
        )
        for column in range(5, 9):
            ws.cell(4, column).border = _BORDER_BOTTOM_DARK
        ws.merge_cells("D4:H4")

        ws.merge_cells("B5:C5")
        self._style_cell(
            ws["B5"],
            value="Менеджер проекта:",
            font=_FONT_LABEL,
            alignment=_ALIGN_LEFT,
        )
        self._style_cell(
            ws["D5"],
            value=request.manager,
            font=_FONT_11,
            border=_BORDER_BOTTOM_DARK,
            alignment=_ALIGN_LEFT,
        )
        for column in range(5, 9):
            ws.cell(5, column).border = _BORDER_BOTTOM_DARK
        ws.merge_cells("D5:H5")

        ws.row_dimensions[4].height = 15.0
        ws.row_dimensions[5].height = 18.75

        self._style_cell(
            ws["G7"],
            value="Дата:",
            font=_FONT_LABEL,
            alignment=_ALIGN_RIGHT,
        )
        self._style_cell(
            ws["H7"],
            value=datetime.combine(request.fill_date, time.min),
            font=_FONT_9,
            fill=_FILL_ACCENT,
            border=_BORDER_THIN,
            alignment=_ALIGN_CENTER,
            number_format="mm-dd-yy",
        )
        ws.row_dimensions[7].height = 18.0

    def _write_weeks(
        self,
        ws: Worksheet,
        weeks: list[WeekPeriod],
        entries: dict[date, DayEntry],
    ) -> int:
        header_row = WEEK_HEADER_ROW
        total_minutes = 0

        for index, week in enumerate(weeks):
            if index > 0:
                header_row += 1

            total_row = self._write_week(ws, week, entries, header_row)
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
        header_row: int,
    ) -> int:
        self._style_cell(
            ws.cell(header_row - 1, 6),
            border=_BORDER_THIN,
        )

        ws.merge_cells(
            start_row=header_row,
            start_column=2,
            end_row=header_row,
            end_column=3,
        )
        self._style_cell(
            ws.cell(header_row, 2),
            value=WEEK_LABEL,
            font=_FONT_LABEL,
            border=_BORDER_WEEK_HEADER,
            alignment=_ALIGN_LEFT,
        )
        ws.cell(header_row, 3).border = _BORDER_WEEK_HEADER
        self._style_cell(
            ws.cell(header_row, 4),
            value=datetime.combine(week.start, time.min),
            font=_FONT_11,
            fill=_FILL_ACCENT,
            border=_BORDER_WEEK_HEADER,
            alignment=_ALIGN_VERTICAL,
            number_format="mm-dd-yy",
        )
        self._style_cell(
            ws.cell(header_row, 5),
            value=datetime.combine(week.end, time.min),
            font=_FONT_11,
            fill=_FILL_ACCENT,
            border=_BORDER_WEEK_HEADER,
            alignment=_ALIGN_VERTICAL,
            number_format="mm-dd-yy",
        )
        self._style_cell(
            ws.cell(header_row, 6),
            font=_FONT_11,
            fill=_FILL_WHITE,
            border=_BORDER_THIN,
            alignment=_ALIGN_VERTICAL,
            number_format="mm-dd-yy",
        )

        blank_row = header_row + 1
        self._style_cell(
            ws.cell(blank_row, 6),
            border=_BORDER_THIN,
        )

        table_header_row = header_row + 2
        for offset, title in enumerate(TABLE_HEADERS, start=2):
            self._style_cell(
                ws.cell(table_header_row, offset),
                value=title,
                font=_FONT_9_BOLD,
                border=_BORDER_BOTTOM_DOUBLE,
                alignment=_ALIGN_CENTER,
            )

        first_data_row = table_header_row + 1
        for offset, day in enumerate(week.days):
            row = first_data_row + offset
            entry = entries[day]

            self._style_cell(
                ws.cell(row, 2),
                value=f"=WEEKDAY(C{row})",
                font=_FONT_9,
                border=_BORDER_THIN,
                alignment=_ALIGN_CENTER,
                number_format="ddd",
            )
            self._style_cell(
                ws.cell(row, 3),
                value=datetime.combine(day, time.min),
                font=_FONT_9,
                border=_BORDER_C_FIRST if offset == 0 else _BORDER_C_REST,
                alignment=_ALIGN_CENTER,
                number_format="mm-dd-yy",
            )

            if entry.absence_reason:
                self._write_absence_row(ws, row, entry.absence_reason)
            else:
                self._style_cell(
                    ws.cell(row, 4),
                    value=entry.start_time,
                    font=_FONT_9,
                    border=_BORDER_THIN,
                    alignment=_ALIGN_CENTER,
                    number_format="h:mm;@",
                )
                self._style_cell(
                    ws.cell(row, 5),
                    value=entry.end_time,
                    font=_FONT_9,
                    border=_BORDER_THIN,
                    alignment=_ALIGN_CENTER,
                    number_format="h:mm;@",
                )
                self._style_cell(
                    ws.cell(row, 6),
                    value=entry.lunch_time,
                    font=_FONT_9,
                    border=_BORDER_THIN,
                    alignment=_ALIGN_CENTER,
                    number_format="h:mm;@",
                )
                project_text = self._project_text(entry)
                self._style_cell(
                    ws.cell(row, 7),
                    value=project_text,
                    font=_FONT_11,
                    border=_BORDER_THIN,
                    alignment=_ALIGN_LEFT_WRAP,
                )
                self._fit_project_row_height(ws, row, project_text)
                self._style_cell(
                    ws.cell(row, 8),
                    value=f"=E{row}-D{row}-F{row}",
                    font=_FONT_9,
                    border=_BORDER_THIN,
                    alignment=_ALIGN_CENTER,
                    number_format="h:mm",
                )

            ws.row_dimensions[row].height = max(
                ws.row_dimensions[row].height or 0,
                15.6,
            )

        buffer_row = first_data_row + len(week.days)
        for column in range(2, 9):
            self._style_cell(
                ws.cell(buffer_row, column),
                font=_FONT_11 if column == 7 else _FONT_8,
                border=_BORDER_BUFFER,
                alignment=_ALIGN_LEFT if column == 7 else _ALIGN_VERTICAL,
            )
        ws.row_dimensions[buffer_row].height = 15.0

        total_row = buffer_row + 1
        self._style_cell(
            ws.cell(total_row, 5),
            value=TOTAL_LABEL,
            font=_FONT_10_BOLD,
            alignment=_ALIGN_RIGHT,
        )
        self._style_cell(
            ws.cell(total_row, 8),
            value=f"=SUM(H{first_data_row}:H{buffer_row})",
            font=_FONT_TOTAL_H,
            alignment=_ALIGN_CENTER,
            number_format='[h]":"mm',
        )
        week_minutes = sum(entries[day].worked_minutes for day in week.days)
        self._style_cell(
            ws.cell(total_row, 9),
            value=self._hours_label(week_minutes),
            font=_FONT_TOTAL_I,
            alignment=_ALIGN_CENTER,
        )
        ws.row_dimensions[total_row].height = 15.0

        return total_row

    def _write_absence_row(
        self,
        ws: Worksheet,
        row: int,
        reason: str,
    ) -> None:
        self._style_cell(
            ws.cell(row, 4),
            value=reason,
            font=_FONT_9,
            border=_BORDER_THIN,
            alignment=_ALIGN_CENTER_WRAP,
            number_format="h:mm;@",
        )
        for column in range(5, 9):
            self._style_cell(
                ws.cell(row, column),
                font=_FONT_9,
                border=_BORDER_THIN,
                alignment=_ALIGN_CENTER,
            )
        ws.merge_cells(
            start_row=row,
            start_column=4,
            end_row=row,
            end_column=8,
        )
        merged_width = sum(
            ws.column_dimensions[column].width or 8.43
            for column in ("D", "E", "F", "G", "H")
        )
        self._fit_row_height(ws, row, reason, merged_width)

    def _write_reference_sheet(
        self,
        ws: Worksheet,
        projects: Sequence[str],
        weeks: list[WeekPeriod],
    ) -> None:
        for column, width in _REFERENCE_COLUMN_WIDTHS.items():
            ws.column_dimensions[column].width = width

        self._write_reference_header(ws, REFERENCE_PROJECT_HEADER_ROW, "№", "Проекты")

        row = REFERENCE_PROJECT_DATA_ROW
        for number, project in enumerate(projects, start=1):
            self._style_cell(
                ws.cell(row, 1),
                value=number,
                font=_FONT_11,
                border=_BORDER_THIN,
            )
            self._style_cell(
                ws.cell(row, 2),
                value=project,
                font=_FONT_11,
                border=_BORDER_THIN,
            )
            row += 1

        week_header_row = row + 1
        self._write_reference_header(
            ws,
            week_header_row,
            "Неделя",
            "Даты",
        )

        row = week_header_row + 1
        for week in weeks:
            for day in week.days:
                self._style_cell(
                    ws.cell(row, 1),
                    value=f"{week.number} неделя",
                    font=_FONT_11,
                )
                self._style_cell(
                    ws.cell(row, 2),
                    value=datetime.combine(day, time.min),
                    font=_FONT_11,
                    alignment=_ALIGN_LEFT_ONLY,
                    number_format="mm-dd-yy",
                )
                row += 1

    def _write_reference_header(
        self,
        ws: Worksheet,
        row: int,
        left: str,
        right: str,
    ) -> None:
        self._style_cell(
            ws.cell(row, 1),
            value=left,
            font=_FONT_SHEET_HEADER,
            fill=_FILL_ACCENT,
            border=_BORDER_THIN,
        )
        self._style_cell(
            ws.cell(row, 2),
            value=right,
            font=_FONT_SHEET_HEADER,
            fill=_FILL_ACCENT,
            border=_BORDER_THIN,
        )

    @staticmethod
    def _style_cell(
        cell,
        *,
        value=None,
        font: Font | None = None,
        fill: PatternFill | None = None,
        border: Border | None = None,
        alignment: Alignment | None = None,
        number_format: str | None = None,
    ) -> None:
        if value is not None:
            cell.value = value
        if font is not None:
            cell.font = font
        if fill is not None:
            cell.fill = fill
        if border is not None:
            cell.border = border
        if alignment is not None:
            cell.alignment = alignment
        if number_format is not None:
            cell.number_format = number_format

    @staticmethod
    def _used_projects(request: ReportRequest) -> list[str]:
        projects: list[str] = []
        seen: set[str] = set()
        for entry in request.entries:
            for day_project in entry.projects:
                folded = day_project.project.casefold()
                if folded in seen:
                    continue
                seen.add(folded)
                projects.append(day_project.project)
        return projects

    @staticmethod
    def _project_text(entry: DayEntry) -> str:
        parts: list[str] = []
        for index, day_project in enumerate(entry.projects, start=1):
            text = f"{index}. {day_project.project}"
            if day_project.details:
                text += f"{PROJECT_SEPARATOR}{day_project.details}"
            parts.append(text)
        return "; ".join(parts)

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
    def _fit_project_row_height(
        ws: Worksheet,
        row: int,
        text: str,
    ) -> None:
        column_width = ws.column_dimensions["G"].width or 61.55
        TimesheetReportGenerator._fit_row_height(
            ws,
            row,
            text,
            column_width,
        )

    @staticmethod
    def _fit_row_height(
        ws: Worksheet,
        row: int,
        text: str,
        column_width: float,
    ) -> None:
        chars_per_line = max(10, int(column_width) - 2)
        lines = 0
        for paragraph in text.splitlines() or [""]:
            wrapped = textwrap.wrap(paragraph, width=chars_per_line)
            lines += max(1, len(wrapped))

        if lines <= 1:
            return

        base_height = ws.row_dimensions[row].height or 15.6
        ws.row_dimensions[row].height = min(base_height * lines, 409.5)
