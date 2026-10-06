import { createDailyPuzzle, CALENDAR_YEAR, MONTHS, dailyId, dailyStatuses, daysInMonth, localDate, pad, parseDate } from '../daily/calendar.js';
import { definitionRecord } from '../library/format.js';
import { element } from './library-ui.js';
import { icon, iconButton } from '../ui/icons.js';
import { modeControl } from './mode-control.js';

export class CalendarUI {
    constructor(shell, repo) {
        this.shell = shell; this.repo = repo;
        this.month = parseDate(localDate())?.month ?? 1;
    }
    get allowFlip() { return this.repo.state.preferences['daily-allow-flip'] === true; }
    control() {
        return modeControl(this.allowFlip, async value => {
            try {
                await this.shell.library.preference('daily-allow-flip', value);
                if (this.shell.library.page === 'calendar') this.updateDateLabels();
            } catch (error) { this.shell.library.error(error); throw error; }
        }, { dots: true, label: 'Daily puzzle mode' });
    }
    homeSection() {
        const section = this.shell.library.section('Daily puzzle', this.control());
        const row = element('div', '', 'daily-actions');
        const today = this.shell.library.action('Today’s puzzle', () => this.openDate(localDate()), 'primary-button');
        today.dataset.today = ''; today.disabled = !parseDate(localDate());
        if (today.disabled) today.title = 'Daily puzzles are available for 2026';
        const calendar = iconButton('calendar', 'Daily Calendar Puzzles', () => this.show());
        calendar.classList.add('calendar-button'); row.append(today, calendar); section.append(row); return section;
    }
    show(month = this.month, push = true) {
        this.month = Number.isInteger(month) && month >= 1 && month <= 12 ? month : this.month;
        const library = this.shell.library;
        library.show('calendar', 'Daily Calendar Puzzles', { view: 'calendar', month: String(this.month), year: String(CALENDAR_YEAR) }, push);
        const main = element('div', '', 'page calendar-page');
        const back = library.action('Home', () => library.home(), 'back-link'); back.insertAdjacentHTML('afterbegin', icon('back'));
        main.append(back, element('h1', 'Daily Calendar Puzzles', 'page-title'));
        const header = element('div', '', 'calendar-header');
        const previous = iconButton('back', 'Previous month', () => this.show(this.month - 1)); previous.disabled = this.month === 1; previous.dataset.entry = 'previous-month';
        const next = iconButton('next', 'Next month', () => this.show(this.month + 1)); next.disabled = this.month === 12; next.dataset.entry = 'next-month';
        const centre = element('div', '', 'calendar-month');
        const select = document.createElement('select'); select.setAttribute('aria-label', 'Month'); select.dataset.entry = 'month';
        for (let m = 1; m <= 12; m++) { const option = element('option', MONTHS[m - 1]); option.value = String(m); select.append(option); }
        select.value = String(this.month); select.addEventListener('change', () => this.show(Number(select.value)));
        centre.append(select, element('span', String(CALENDAR_YEAR), 'calendar-year'));
        header.append(previous, centre, next); main.append(header, this.control());
        const grid = element('div', '', 'calendar-grid'); grid.setAttribute('aria-label', `${MONTHS[this.month - 1]} ${CALENDAR_YEAR}`);
        for (const weekday of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) grid.append(element('span', weekday, 'calendar-weekday'));
        const start = new Date(Date.UTC(CALENDAR_YEAR, this.month - 1, 1)).getUTCDay();
        for (let i = 0; i < start; i++) { const empty = element('span'); empty.setAttribute('aria-hidden', 'true'); grid.append(empty); }
        const statuses = dailyStatuses(this.repo.state), today = localDate();
        for (let day = 1; day <= daysInMonth(this.month); day++) {
            const date = `${CALENDAR_YEAR}-${pad(this.month)}-${pad(day)}`;
            const button = library.action('', () => this.openDate(date), 'calendar-day'); button.dataset.date = date; button.dataset.entry = date;
            button.append(element('span', String(day), 'calendar-number'));
            if (date === today) { button.classList.add('is-today'); button.setAttribute('aria-current', 'date'); }
            const dots = element('span', '', 'calendar-dots'); dots.setAttribute('aria-hidden', 'true');
            for (const flip of [false, true]) {
                const dot = element('span', '', `calendar-dot ${flip ? 'flippable' : 'fixed'} ${statuses.get(dailyId(date, flip)) ?? 'unattempted'}`);
                dots.append(dot);
            }
            button.append(dots); grid.append(button);
        }
        main.append(grid); library.restore(main); this.updateDateLabels();
    }
    updateDateLabels() {
        const statuses = dailyStatuses(this.repo.state), mode = this.allowFlip ? 'Flips allowed' : 'No flips';
        for (const button of this.shell.screen.querySelectorAll('[data-date]')) {
            const info = parseDate(button.dataset.date);
            const status = flip => statuses.get(dailyId(button.dataset.date, flip)) ?? 'not attempted';
            button.setAttribute('aria-label', `${MONTHS[info.month - 1]} ${info.day}, ${info.year}${button.classList.contains('is-today') ? ', today' : ''}. No flips: ${status(false)}. Flips allowed: ${status(true)}. Play ${mode}.`);
        }
    }
    async openDate(date, allowFlip = this.allowFlip, push = true) {
        const request = ++this.shell.navigationSerial;
        await this.shell.pendingSave;
        const record = await definitionRecord(createDailyPuzzle(date, allowFlip));
        if (request !== this.shell.navigationSerial) return;
        const change = state => {
            if (state.definitions[record.key] && (state.preferences['daily-allow-flip'] === true) === allowFlip) return state;
            return { ...state, definitions: { ...state.definitions, [record.key]: record }, preferences: { ...state.preferences, 'daily-allow-flip': allowFlip } };
        };
        if (this.repo.backend) await this.repo.mutate(change);
        else this.repo.state = change(this.repo.state);
        if (request !== this.shell.navigationSerial) return;
        this.month = parseDate(date).month;
        this.shell.open(record.def, push, 'daily', record.key);
    }
}
