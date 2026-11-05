"use strict";

const KIND_META = {
    companies: {
        title: "Добавить компанию",
        description: "Название компании попадёт в шапку отчёта.",
        placeholder: "Например: ООО Новая Компания",
    },
    employees: {
        title: "Добавить сотрудника",
        description: "Укажите ФИО полностью: фамилия, имя, отчество.",
        placeholder: "Например: Иванов Иван Иванович",
    },
    departments: {
        title: "Добавить подразделение",
        description: "Название подразделения попадёт в шапку отчёта.",
        placeholder: "Например: Основное подразделение",
    },
    managers: {
        title: "Добавить менеджера",
        description: "Укажите ФИО менеджера проекта полностью.",
        placeholder: "Например: Смирнов Сергей Сергеевич",
    },
    projects: {
        title: "Добавить проект",
        description: "Название проекта будет доступно в ежедневных записях.",
        placeholder: "Например: Система управления складом (WMS)",
    },
};

const dictionarySelects = {
    companies: document.getElementById("company"),
    employees: document.getElementById("employee"),
    departments: document.getElementById("department"),
    managers: document.getElementById("manager"),
};

const elements = {
    fillDate: document.getElementById("fill-date"),
    periodStart: document.getElementById("period-start"),
    periodEnd: document.getElementById("period-end"),
    defaultStart: document.getElementById("default-start"),
    defaultEnd: document.getElementById("default-end"),
    weeks: document.getElementById("weeks"),
    daysEmpty: document.getElementById("days-empty"),
    firstRunHint: document.getElementById("first-run-hint"),
    generateButton: document.getElementById("generate-button"),
    downloadButton: document.getElementById("download-button"),
    reportSummary: document.getElementById("report-summary"),
    errorBox: document.getElementById("error-box"),
    addProjectButton: document.getElementById("add-project-button"),
};

const dialog = {
    root: document.getElementById("dictionary-dialog"),
    form: document.getElementById("dictionary-form"),
    title: document.getElementById("dictionary-dialog-title"),
    description: document.getElementById("dictionary-dialog-description"),
    input: document.getElementById("dictionary-input"),
    error: document.getElementById("dictionary-error"),
    cancel: document.getElementById("dictionary-cancel"),
    save: document.getElementById("dictionary-save"),
};

const WEEKDAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const EMPTY_DICTIONARIES = {
    companies: [],
    employees: [],
    departments: [],
    managers: [],
    projects: [],
};

let dictionaries = { ...EMPTY_DICTIONARIES };
const entries = new Map();

let pendingDictionaryKind = null;
let pendingProjectDate = null;

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    const raw = await response.text();
    let data = null;
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = raw;
        }
    }

    if (!response.ok) {
        let message = "Не удалось выполнить запрос";
        if (data && typeof data === "object") {
            if (typeof data.detail === "string") {
                message = data.detail;
            } else if (Array.isArray(data.detail)) {
                message = data.detail
                    .map((item) => item.msg || "Некорректное значение")
                    .join("; ");
            }
        }
        throw new Error(message);
    }

    return data;
}

function showError(message) {
    elements.errorBox.textContent = message;
    elements.errorBox.hidden = false;
}

function clearError() {
    elements.errorBox.textContent = "";
    elements.errorBox.hidden = true;
}

function showDialogError(message) {
    dialog.error.textContent = message;
    dialog.error.hidden = false;
}

function clearDialogError() {
    dialog.error.textContent = "";
    dialog.error.hidden = true;
}

async function loadDictionaries() {
    const data = await requestJson("/api/dictionaries");
    dictionaries = { ...EMPTY_DICTIONARIES, ...data };

    Object.keys(dictionarySelects).forEach((kind) => {
        renderTopSelect(kind);
    });
    updateProjectSelects();
    updateFirstRunHint();
}

function renderTopSelect(kind) {
    const select = dictionarySelects[kind];
    const current = select.value;
    select.replaceChildren(new Option("— выберите —", ""));

    for (const value of dictionaries[kind]) {
        select.append(new Option(value, value));
    }

    if (current && [...select.options].some((option) => option.value === current)) {
        select.value = current;
    } else if (select.options.length > 1) {
        select.value = select.options[1].value;
    }
}

function updateProjectSelects() {
    document.querySelectorAll("select.project-select").forEach((select) => {
        fillProjectSelect(select, select.value);
    });
}

function fillProjectSelect(select, currentValue) {
    select.replaceChildren(new Option("— проект —", ""));
    for (const project of dictionaries.projects) {
        select.append(new Option(project, project));
    }
    if ([...select.options].some((option) => option.value === currentValue)) {
        select.value = currentValue;
    }
}

function updateFirstRunHint() {
    const isEmpty = Object.values(dictionaries).every(
        (values) => values.length === 0,
    );
    elements.firstRunHint.hidden = !isEmpty;
}

function parseIsoDate(value) {
    if (!value) {
        return null;
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }
    return date;
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDateRu(date) {
    return date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function formatDateShort(date) {
    return date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
    });
}

function formatWeekRange(days) {
    const first = days[0];
    const last = days[days.length - 1];
    if (first.getFullYear() === last.getFullYear()) {
        if (first.getMonth() === last.getMonth()) {
            return `${formatDateShort(first)}–${formatDateRu(last)}`;
        }
        return `${formatDateShort(first)}–${formatDateRu(last)}`;
    }
    return `${formatDateRu(first)}–${formatDateRu(last)}`;
}

function workdaysBetween(start, end) {
    const result = [];
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (current <= last) {
        const weekday = current.getDay();
        if (weekday !== 0 && weekday !== 6) {
            result.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return result;
}

function groupByWeek(days) {
    const groups = new Map();
    for (const day of days) {
        const monday = new Date(day);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        const key = toIsoDate(monday);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(day);
    }
    return [...groups.values()];
}

function collectEntries() {
    document.querySelectorAll(".day-row[data-date]").forEach((row) => {
        entries.set(row.dataset.date, {
            start: row.querySelector(".start-select").value,
            end: row.querySelector(".end-select").value,
            lunch: row.querySelector(".lunch-select").value,
            project: row.querySelector(".project-select").value,
            details: row.querySelector(".details-input").value.trim(),
        });
    });
}

function fillTimeSelect(select, selectedValue, fallbackValue) {
    select.replaceChildren();
    for (let hour = 0; hour < 24; hour += 1) {
        const value = `${String(hour).padStart(2, "0")}:00`;
        select.append(new Option(value, value));
    }
    const value = selectedValue || fallbackValue;
    if ([...select.options].some((option) => option.value === value)) {
        select.value = value;
    }
}

function renderDays() {
    collectEntries();
    elements.weeks.replaceChildren();
    clearError();

    const start = parseIsoDate(elements.periodStart.value);
    const end = parseIsoDate(elements.periodEnd.value);

    if (!start || !end) {
        elements.daysEmpty.textContent =
            "Выберите период отчёта — ниже появятся рабочие дни, сгруппированные по неделям.";
        elements.daysEmpty.hidden = false;
        return;
    }

    if (start > end) {
        elements.daysEmpty.textContent =
            "Начало периода не может быть позже окончания.";
        elements.daysEmpty.hidden = false;
        return;
    }

    const days = workdaysBetween(start, end);
    if (days.length === 0) {
        elements.daysEmpty.textContent = "В выбранном периоде нет рабочих дней.";
        elements.daysEmpty.hidden = false;
        return;
    }

    elements.daysEmpty.hidden = true;
    const weeks = groupByWeek(days);
    weeks.forEach((weekDays, index) => {
        elements.weeks.append(createWeekCard(weekDays, index));
    });
}

function createWeekCard(days, index) {
    const card = createElement("article", "week");

    const head = createElement("div", "week__head");
    const title = createElement(
        "h3",
        "week__title",
        `Неделя ${index + 1}`,
    );
    const range = createElement("span", "week__range", formatWeekRange(days));
    head.append(title, range);

    const grid = createElement("div", "day-grid");
    grid.append(createDayHeader());

    for (const day of days) {
        grid.append(createDayRow(day));
    }

    card.append(head, grid);
    return card;
}

function createDayHeader() {
    const row = createElement("div", "day-row day-row--header");
    const labels = [
        "День",
        "Дата",
        "Начало",
        "Окончание",
        "Обед",
        "Проект",
        "Тонкости работы",
    ];
    for (const label of labels) {
        row.append(createElement("span", "", label));
    }
    return row;
}

function createDayRow(day) {
    const iso = toIsoDate(day);
    const saved = entries.get(iso) || {};
    const row = createElement("div", "day-row");
    row.dataset.date = iso;

    const name = createElement("div", "day-name", WEEKDAY_NAMES[day.getDay()]);
    const date = createElement("div", "day-date", formatDateRu(day));

    const startSelect = createElement("select", "start-select");
    startSelect.title = "Время начала работ";
    fillTimeSelect(startSelect, saved.start, elements.defaultStart.value);

    const endSelect = createElement("select", "end-select");
    endSelect.title = "Время окончания работ";
    fillTimeSelect(endSelect, saved.end, elements.defaultEnd.value);

    const lunchSelect = createElement("select", "lunch-select");
    lunchSelect.title = "Время обеда";
    lunchSelect.replaceChildren();
    for (const value of ["00:00", "00:30", "01:00", "01:30", "02:00"]) {
        lunchSelect.append(new Option(value, value));
    }
    lunchSelect.value = saved.lunch || "01:00";

    const projectCell = createElement("div", "project-cell");
    const projectSelect = createElement("select", "project-select");
    fillProjectSelect(projectSelect, saved.project || "");
    const addProjectButton = createElement("button", "icon-button", "+");
    addProjectButton.type = "button";
    addProjectButton.title = "Добавить проект";
    addProjectButton.addEventListener("click", () => {
        openDictionaryDialog("projects", iso);
    });
    projectCell.append(projectSelect, addProjectButton);

    const detailsInput = createElement("input", "details-input");
    detailsInput.type = "text";
    detailsInput.maxLength = 2000;
    detailsInput.placeholder = "Необязательно";
    detailsInput.value = saved.details || "";

    row.append(
        name,
        date,
        startSelect,
        endSelect,
        lunchSelect,
        projectCell,
        detailsInput,
    );
    return row;
}

function openDictionaryDialog(kind, projectDate = null) {
    const meta = KIND_META[kind];
    if (!meta) {
        return;
    }
    pendingDictionaryKind = kind;
    pendingProjectDate = projectDate;

    dialog.title.textContent = meta.title;
    dialog.description.textContent = meta.description;
    dialog.input.value = "";
    dialog.input.placeholder = meta.placeholder;
    clearDialogError();
    dialog.save.disabled = false;
    dialog.root.showModal();
    dialog.input.focus();
}

async function saveDictionaryValue() {
    if (!pendingDictionaryKind) {
        return;
    }

    const value = dialog.input.value.trim();
    if (!value) {
        showDialogError("Введите наименование");
        return;
    }

    dialog.save.disabled = true;
    clearDialogError();

    try {
        await requestJson(`/api/dictionaries/${pendingDictionaryKind}`, {
            method: "POST",
            body: JSON.stringify({ value }),
        });
        await loadDictionaries();

        if (pendingProjectDate) {
            const row = document.querySelector(
                `.day-row[data-date="${pendingProjectDate}"]`,
            );
            const select = row?.querySelector(".project-select");
            if (select) {
                select.value = value;
            }
        } else {
            const select = dictionarySelects[pendingDictionaryKind];
            if (select) {
                select.value = value;
            }
        }

        dialog.root.close();
        pendingDictionaryKind = null;
        pendingProjectDate = null;
    } catch (error) {
        showDialogError(error.message);
    } finally {
        dialog.save.disabled = false;
    }
}

function timeToMinutes(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
}

async function generateReport() {
    clearError();
    elements.reportSummary.hidden = true;
    elements.downloadButton.hidden = true;

    const company = dictionarySelects.companies.value;
    const employee = dictionarySelects.employees.value;
    const department = dictionarySelects.departments.value;
    const manager = dictionarySelects.managers.value;
    const fillDate = elements.fillDate.value;
    const startIso = elements.periodStart.value;
    const endIso = elements.periodEnd.value;

    if (!company || !employee || !department || !manager) {
        showError("Заполните компанию, сотрудника, подразделение и менеджера.");
        return;
    }
    if (!fillDate) {
        showError("Укажите дату заполнения.");
        return;
    }
    if (!startIso || !endIso) {
        showError("Выберите период отчёта.");
        return;
    }

    const start = parseIsoDate(startIso);
    const end = parseIsoDate(endIso);
    if (!start || !end || start > end) {
        showError("Проверьте период отчёта.");
        return;
    }

    collectEntries();
    const days = workdaysBetween(start, end);
    if (days.length === 0) {
        showError("В выбранном периоде нет рабочих дней.");
        return;
    }

    const payloadEntries = [];
    for (const day of days) {
        const iso = toIsoDate(day);
        const entry = entries.get(iso);

        if (!entry || !entry.project) {
            showError(`Для ${formatDateRu(day)} не выбран проект.`);
            return;
        }
        if (!entry.start || !entry.end || !entry.lunch) {
            showError(`Для ${formatDateRu(day)} заполните время работ.`);
            return;
        }

        const startMinutes = timeToMinutes(entry.start);
        const endMinutes = timeToMinutes(entry.end);
        const lunchMinutes = timeToMinutes(entry.lunch);

        if (endMinutes <= startMinutes) {
            showError(
                `Для ${formatDateRu(day)} время окончания должно быть позже времени начала.`,
            );
            return;
        }
        if (lunchMinutes >= endMinutes - startMinutes) {
            showError(
                `Для ${formatDateRu(day)} время обеда должно быть меньше рабочего интервала.`,
            );
            return;
        }

        payloadEntries.push({
            date: iso,
            start_time: entry.start,
            end_time: entry.end,
            lunch_time: entry.lunch,
            project: entry.project,
            details: entry.details || null,
        });
    }

    const payload = {
        company,
        employee,
        department,
        manager,
        fill_date: fillDate,
        period_start: startIso,
        period_end: endIso,
        entries: payloadEntries,
    };

    elements.generateButton.disabled = true;
    elements.generateButton.textContent = "Формирование…";

    try {
        const result = await requestJson("/api/report", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        elements.downloadButton.href = result.download_url;
        elements.downloadButton.download = result.filename;
        elements.downloadButton.hidden = false;
        const hours = result.total_minutes / 60;
        const hoursText = Number.isInteger(hours)
            ? String(hours)
            : hours.toFixed(1);
        elements.reportSummary.textContent =
            `Отчёт «${result.filename}» сформирован. Итого: ${hoursText} ч.`;
        elements.reportSummary.hidden = false;
    } catch (error) {
        showError(error.message);
    } finally {
        elements.generateButton.disabled = false;
        elements.generateButton.textContent = "Сгенерировать отчёт";
    }
}

function setDefaultDates() {
    if (!elements.fillDate.value) {
        elements.fillDate.value = toIsoDate(new Date());
    }
}

function updateAllDayTimes(selector, value) {
    document.querySelectorAll(`.day-row[data-date] ${selector}`).forEach((select) => {
        select.value = value;
    });
}

function bindEvents() {
    document.querySelectorAll(".add-dictionary").forEach((button) => {
        button.addEventListener("click", () => {
            openDictionaryDialog(button.dataset.kind);
        });
    });

    elements.addProjectButton.addEventListener("click", () => {
        openDictionaryDialog("projects");
    });

    elements.periodStart.addEventListener("change", () => {
        const start = parseIsoDate(elements.periodStart.value);
        const end = parseIsoDate(elements.periodEnd.value);
        if (start && end && start > end) {
            elements.periodEnd.value = elements.periodStart.value;
        }
        renderDays();
    });

    elements.periodEnd.addEventListener("change", () => {
        const start = parseIsoDate(elements.periodStart.value);
        const end = parseIsoDate(elements.periodEnd.value);
        if (start && end && start > end) {
            elements.periodStart.value = elements.periodEnd.value;
        }
        renderDays();
    });

    elements.defaultStart.addEventListener("change", () => {
        updateAllDayTimes(".start-select", elements.defaultStart.value);
    });

    elements.defaultEnd.addEventListener("change", () => {
        updateAllDayTimes(".end-select", elements.defaultEnd.value);
    });

    elements.generateButton.addEventListener("click", generateReport);

    dialog.form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveDictionaryValue();
    });

    dialog.cancel.addEventListener("click", () => {
        dialog.root.close();
    });

    dialog.input.addEventListener("input", clearDialogError);
}

async function init() {
    bindEvents();
    setDefaultDates();
    fillTimeSelect(elements.defaultStart, "08:00", "08:00");
    fillTimeSelect(elements.defaultEnd, "17:00", "17:00");
    try {
        await loadDictionaries();
    } catch (error) {
        showError(error.message);
    }
    renderDays();
}

document.addEventListener("DOMContentLoaded", init);
