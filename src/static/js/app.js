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

const projectsDialog = {
    root: document.getElementById("projects-dialog"),
    form: document.getElementById("projects-form"),
    subtitle: document.getElementById("projects-dialog-subtitle"),
    entries: document.getElementById("project-entries"),
    addEntry: document.getElementById("add-project-entry"),
    error: document.getElementById("projects-error"),
    cancel: document.getElementById("projects-cancel"),
    save: document.getElementById("projects-save"),
};

const absenceDialog = {
    root: document.getElementById("absence-dialog"),
    form: document.getElementById("absence-form"),
    subtitle: document.getElementById("absence-dialog-subtitle"),
    reason: document.getElementById("absence-reason"),
    customField: document.getElementById("absence-custom-field"),
    customReason: document.getElementById("absence-custom-reason"),
    error: document.getElementById("absence-error"),
    cancel: document.getElementById("absence-cancel"),
    save: document.getElementById("absence-save"),
};

const ABSENCE_REASONS = [
    "Плановый отпуск",
    "Отпуск за свой счет",
    "Больничный",
    "Праздничный день",
];
const ABSENCE_OTHER = "Другое";

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
const weekendDays = new Set();

let pendingDictionaryKind = null;
let pendingProjectSelect = null;
let activeProjectDate = null;
let activeAbsenceDate = null;

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
    if (toIsoDate(first) === toIsoDate(last)) {
        return formatDateRu(first);
    }
    if (first.getFullYear() === last.getFullYear()) {
        if (first.getMonth() === last.getMonth()) {
            return `${formatDateShort(first)}–${formatDateRu(last)}`;
        }
        return `${formatDateShort(first)}–${formatDateRu(last)}`;
    }
    return `${formatDateRu(first)}–${formatDateRu(last)}`;
}

function calendarDaysBetween(start, end) {
    const result = [];
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (current <= last) {
        result.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return result;
}

function isWorkdayDate(day) {
    const weekday = day.getDay();
    return weekday !== 0 && weekday !== 6;
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
        const iso = row.dataset.date;
        const existing = entries.get(iso) || {};
        entries.set(iso, {
            ...existing,
            start: row.querySelector(".start-select").value,
            end: row.querySelector(".end-select").value,
            lunch: row.querySelector(".lunch-select").value,
            projects: existing.projects || [],
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

    const days = calendarDaysBetween(start, end);
    if (days.length === 0) {
        elements.daysEmpty.textContent = "В выбранном периоде нет дней.";
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

    for (const day of days.filter(isWorkdayDate)) {
        grid.append(createDayRow(day));
    }

    const saturday = days.find((day) => day.getDay() === 6) || null;
    const sunday = days.find((day) => day.getDay() === 0) || null;

    for (const weekendDay of [saturday, sunday]) {
        if (weekendDay && weekendDays.has(toIsoDate(weekendDay))) {
            grid.append(createDayRow(weekendDay));
        }
    }

    const options = createElement("div", "week__weekend-options");
    options.append(
        createWeekendToggle("Добавить субботу", saturday),
        createWeekendToggle("Добавить воскресенье", sunday),
    );

    card.append(head, grid, options);
    return card;
}

function createWeekendToggle(label, day) {
    const wrapper = createElement("label", "weekend-toggle");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "weekend-toggle__input";

    if (day) {
        const iso = toIsoDate(day);
        input.checked = weekendDays.has(iso);
        input.addEventListener("change", () => {
            if (input.checked) {
                weekendDays.add(iso);
            } else {
                weekendDays.delete(iso);
            }
            renderDays();
        });
    } else {
        input.disabled = true;
        wrapper.classList.add("weekend-toggle--disabled");
        wrapper.title = "Дата вне выбранного периода";
    }

    const text = createElement("span", "weekend-toggle__text", label);
    wrapper.append(input, text);

    if (day) {
        wrapper.append(
            createElement("span", "weekend-toggle__date", formatDateRu(day)),
        );
    }
    return wrapper;
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
        "Не работал",
    ];
    for (const label of labels) {
        row.append(createElement("span", "", label));
    }
    return row;
}

function createDayRow(day) {
    const iso = toIsoDate(day);
    const saved = entries.get(iso) || {};
    const isAbsent = Boolean(saved.absenceReason);
    const row = createElement("div", "day-row");
    row.dataset.date = iso;
    if (isAbsent) {
        row.classList.add("day-row--absence");
    }

    const name = createElement("div", "day-name", WEEKDAY_NAMES[day.getDay()]);
    const date = createElement("div", "day-date", formatDateRu(day));

    const startSelect = createElement("select", "start-select");
    startSelect.title = "Время начала работ";
    fillTimeSelect(startSelect, saved.start, elements.defaultStart.value);
    startSelect.disabled = isAbsent;

    const endSelect = createElement("select", "end-select");
    endSelect.title = "Время окончания работ";
    fillTimeSelect(endSelect, saved.end, elements.defaultEnd.value);
    endSelect.disabled = isAbsent;

    const lunchSelect = createElement("select", "lunch-select");
    lunchSelect.title = "Время обеда";
    lunchSelect.replaceChildren();
    for (const value of ["00:00", "00:30", "01:00", "01:30", "02:00"]) {
        lunchSelect.append(new Option(value, value));
    }
    lunchSelect.value = saved.lunch || "01:00";
    lunchSelect.disabled = isAbsent;

    const projectCell = createElement("div", "project-cell");
    const projectSummary = createElement(
        "span",
        "project-summary",
        isAbsent
            ? `Не работал: ${saved.absenceReason}`
            : formatProjectSummary(saved.projects || []),
    );
    if (isAbsent) {
        projectSummary.classList.add("project-summary--absence");
    }
    const editProjectsButton = createElement(
        "button",
        "icon-button open-projects-button",
        "+",
    );
    editProjectsButton.type = "button";
    editProjectsButton.title = "Выбрать проекты и проведенные работы";
    editProjectsButton.disabled = isAbsent;
    editProjectsButton.addEventListener("click", () => {
        openProjectsDialog(iso);
    });
    projectCell.append(projectSummary, editProjectsButton);

    const absenceCell = createElement("label", "absence-cell");
    const absenceCheckbox = document.createElement("input");
    absenceCheckbox.type = "checkbox";
    absenceCheckbox.className = "absence-checkbox";
    absenceCheckbox.checked = isAbsent;
    absenceCheckbox.addEventListener("change", () => {
        handleAbsenceToggle(iso, absenceCheckbox);
    });
    absenceCell.append(
        absenceCheckbox,
        createElement("span", "absence-cell__label", "Не работал"),
    );

    row.append(
        name,
        date,
        startSelect,
        endSelect,
        lunchSelect,
        projectCell,
        absenceCell,
    );
    return row;
}

function formatProjectSummary(projects) {
    if (!projects || projects.length === 0) {
        return "Проекты не выбраны";
    }
    return projects
        .map((item, index) => `${index + 1}. ${item.project}`)
        .join("; ");
}

function openProjectsDialog(iso) {
    collectEntries();
    const entry = entries.get(iso) || {};
    activeProjectDate = iso;

    projectsDialog.entries.replaceChildren();
    const projects = entry.projects && entry.projects.length
        ? entry.projects
        : [{ project: "", details: null }];
    projects.forEach((item) => {
        addProjectEntryRow(item.project || "", item.details || "");
    });
    updateProjectEntryRemoveButtons();

    const day = parseIsoDate(iso);
    projectsDialog.subtitle.textContent = day
        ? `День: ${formatDateRu(day)}`
        : "";
    clearProjectsDialogError();
    projectsDialog.save.disabled = false;
    projectsDialog.root.showModal();
}

function addProjectEntryRow(projectValue, detailsValue) {
    const row = createElement("div", "project-entry");
    const fields = createElement("div", "project-entry__fields");

    const projectField = createElement("label", "field");
    projectField.append(createElement("span", "field__label", "Проект"));
    const projectControl = createElement("div", "field__control");
    const select = createElement("select", "project-select");
    fillProjectSelect(select, projectValue || "");
    const addProjectButton = createElement("button", "icon-button", "+");
    addProjectButton.type = "button";
    addProjectButton.title = "Создать новый проект";
    addProjectButton.addEventListener("click", () => {
        openDictionaryDialog("projects", select);
    });
    projectControl.append(select, addProjectButton);
    projectField.append(projectControl);

    const detailsField = createElement("label", "field");
    detailsField.append(
        createElement("span", "field__label", "Проведенные работы"),
    );
    const detailsInput = createElement("input", "project-details-input");
    detailsInput.type = "text";
    detailsInput.maxLength = 2000;
    detailsInput.placeholder = "Необязательно";
    detailsInput.value = detailsValue || "";
    detailsField.append(detailsInput);

    fields.append(projectField, detailsField);

    const removeButton = createElement(
        "button",
        "icon-button remove-project-entry",
        "×",
    );
    removeButton.type = "button";
    removeButton.title = "Удалить проект";
    removeButton.addEventListener("click", () => {
        row.remove();
        updateProjectEntryRemoveButtons();
    });

    row.append(fields, removeButton);
    projectsDialog.entries.append(row);
    return row;
}

function updateProjectEntryRemoveButtons() {
    const rows = projectsDialog.entries.querySelectorAll(".project-entry");
    rows.forEach((row) => {
        const button = row.querySelector(".remove-project-entry");
        if (button) {
            button.disabled = rows.length <= 1;
        }
    });
}

function collectProjectEntries() {
    const rows = [...projectsDialog.entries.querySelectorAll(".project-entry")];
    if (rows.length === 0) {
        throw new Error("Добавьте хотя бы один проект.");
    }
    return rows.map((row) => {
        const project = row.querySelector(".project-select").value;
        const details = row.querySelector(".project-details-input").value.trim();
        if (!project) {
            throw new Error("Выберите проект во всех строках или удалите лишние.");
        }
        return { project, details: details || null };
    });
}

function showProjectsDialogError(message) {
    projectsDialog.error.textContent = message;
    projectsDialog.error.hidden = false;
}

function clearProjectsDialogError() {
    projectsDialog.error.textContent = "";
    projectsDialog.error.hidden = true;
}

function saveProjectsDialog(event) {
    event.preventDefault();
    clearProjectsDialogError();

    let projects;
    try {
        projects = collectProjectEntries();
    } catch (error) {
        showProjectsDialogError(error.message);
        return;
    }

    if (!activeProjectDate) {
        return;
    }

    const current = entries.get(activeProjectDate) || {};
    entries.set(activeProjectDate, { ...current, projects });
    projectsDialog.root.close();
    activeProjectDate = null;
    renderDays();
}

function fillAbsenceReasons() {
    absenceDialog.reason.replaceChildren(
        new Option("— выберите причину —", ""),
    );
    for (const reason of ABSENCE_REASONS) {
        absenceDialog.reason.append(new Option(reason, reason));
    }
    absenceDialog.reason.append(new Option(ABSENCE_OTHER, ABSENCE_OTHER));
}

function handleAbsenceToggle(iso, checkbox) {
    if (checkbox.checked) {
        openAbsenceDialog(iso);
        return;
    }
    const entry = entries.get(iso) || {};
    delete entry.absenceReason;
    entries.set(iso, entry);
    renderDays();
}

function openAbsenceDialog(iso) {
    collectEntries();
    const entry = entries.get(iso) || {};
    activeAbsenceDate = iso;
    const reason = entry.absenceReason || "";

    if (ABSENCE_REASONS.includes(reason)) {
        absenceDialog.reason.value = reason;
        absenceDialog.customReason.value = "";
        absenceDialog.customField.hidden = true;
    } else if (reason) {
        absenceDialog.reason.value = ABSENCE_OTHER;
        absenceDialog.customReason.value = reason;
        absenceDialog.customField.hidden = false;
    } else {
        absenceDialog.reason.value = "";
        absenceDialog.customReason.value = "";
        absenceDialog.customField.hidden = true;
    }

    const day = parseIsoDate(iso);
    absenceDialog.subtitle.textContent = day
        ? `День: ${formatDateRu(day)}`
        : "";
    clearAbsenceDialogError();
    absenceDialog.root.showModal();
    absenceDialog.reason.focus();
}

function updateAbsenceCustomField() {
    const isOther = absenceDialog.reason.value === ABSENCE_OTHER;
    absenceDialog.customField.hidden = !isOther;
    if (isOther) {
        absenceDialog.customReason.focus();
    }
}

function showAbsenceDialogError(message) {
    absenceDialog.error.textContent = message;
    absenceDialog.error.hidden = false;
}

function clearAbsenceDialogError() {
    absenceDialog.error.textContent = "";
    absenceDialog.error.hidden = true;
}

function saveAbsenceDialog(event) {
    event.preventDefault();
    clearAbsenceDialogError();

    const selected = absenceDialog.reason.value;
    if (!selected) {
        showAbsenceDialogError("Выберите причину отсутствия.");
        return;
    }

    let reason = selected;
    if (selected === ABSENCE_OTHER) {
        reason = absenceDialog.customReason.value.trim();
        if (!reason) {
            showAbsenceDialogError("Укажите свою причину отсутствия.");
            return;
        }
    }

    if (!activeAbsenceDate) {
        return;
    }

    const current = entries.get(activeAbsenceDate) || {};
    entries.set(activeAbsenceDate, { ...current, absenceReason: reason });
    absenceDialog.root.close();
}

function openDictionaryDialog(kind, projectSelect = null) {
    const meta = KIND_META[kind];
    if (!meta) {
        return;
    }
    pendingDictionaryKind = kind;
    pendingProjectSelect = projectSelect;

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

        if (pendingDictionaryKind !== "projects") {
            const select = dictionarySelects[pendingDictionaryKind];
            if (select) {
                select.value = value;
            }
        } else if (pendingProjectSelect) {
            pendingProjectSelect.value = value;
        }

        dialog.root.close();
        pendingDictionaryKind = null;
        pendingProjectSelect = null;
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
    const dayRows = [...document.querySelectorAll(".day-row[data-date]")];
    if (dayRows.length === 0) {
        showError("В выбранном периоде нет дней для отчёта.");
        return;
    }

    const payloadEntries = [];
    for (const row of dayRows) {
        const iso = row.dataset.date;
        const day = parseIsoDate(iso);
        const entry = entries.get(iso);

        if (!day) {
            showError("Некорректная дата в форме.");
            return;
        }
        if (entry && entry.absenceReason) {
            payloadEntries.push({
                date: iso,
                start_time: null,
                end_time: null,
                lunch_time: null,
                projects: [],
                absence_reason: entry.absenceReason,
            });
            continue;
        }
        if (!entry || !entry.projects || entry.projects.length === 0) {
            showError(`Для ${formatDateRu(day)} не выбраны проекты.`);
            return;
        }
        if (entry.projects.some((item) => !item.project)) {
            showError(
                `Для ${formatDateRu(day)} выберите проект во всех строках.`,
            );
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
            projects: entry.projects.map((item) => ({
                project: item.project,
                details: item.details || null,
            })),
            absence_reason: null,
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

    projectsDialog.addEntry.addEventListener("click", () => {
        clearProjectsDialogError();
        addProjectEntryRow("", "");
        updateProjectEntryRemoveButtons();
    });

    projectsDialog.form.addEventListener("submit", saveProjectsDialog);

    projectsDialog.cancel.addEventListener("click", () => {
        projectsDialog.root.close();
    });

    projectsDialog.root.addEventListener("close", () => {
        activeProjectDate = null;
        clearProjectsDialogError();
    });

    absenceDialog.form.addEventListener("submit", saveAbsenceDialog);

    absenceDialog.cancel.addEventListener("click", () => {
        absenceDialog.root.close();
    });

    absenceDialog.reason.addEventListener("change", () => {
        clearAbsenceDialogError();
        updateAbsenceCustomField();
    });

    absenceDialog.customReason.addEventListener(
        "input",
        clearAbsenceDialogError,
    );

    absenceDialog.root.addEventListener("close", () => {
        activeAbsenceDate = null;
        clearAbsenceDialogError();
        renderDays();
    });
}

async function init() {
    bindEvents();
    setDefaultDates();
    fillTimeSelect(elements.defaultStart, "08:00", "08:00");
    fillTimeSelect(elements.defaultEnd, "17:00", "17:00");
    fillAbsenceReasons();
    try {
        await loadDictionaries();
    } catch (error) {
        showError(error.message);
    }
    renderDays();
}

document.addEventListener("DOMContentLoaded", init);
