(() => {
  const STORAGE_KEY = "habit-tracker-state-v1";
  const THEME_KEY = "habit-tracker-theme";
  const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const MONTH_NAMES = [
    "1월", "2월", "3월", "4월", "5월", "6월",
    "7월", "8월", "9월", "10월", "11월", "12월",
  ];
  const HUE_COUNT = 6;

  const els = {
    prevPeriod: document.getElementById("prevPeriod"),
    nextPeriod: document.getElementById("nextPeriod"),
    periodLabel: document.getElementById("periodLabel"),
    viewMonthBtn: document.getElementById("viewMonthBtn"),
    viewYearBtn: document.getElementById("viewYearBtn"),
    addForm: document.getElementById("addHabitForm"),
    habitInput: document.getElementById("habitInput"),
    headerRow: document.getElementById("headerRow"),
    habitBody: document.getElementById("habitBody"),
    emptyState: document.getElementById("emptyState"),
    themeToggle: document.getElementById("themeToggle"),
  };

  function systemPrefersDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function effectiveTheme() {
    return localStorage.getItem(THEME_KEY) || (systemPrefersDark() ? "dark" : "light");
  }

  function renderThemeToggle(theme) {
    const isDark = theme === "dark";
    els.themeToggle.textContent = isDark ? "☀" : "☾";
    els.themeToggle.setAttribute(
      "aria-label",
      isDark ? "라이트 모드로 전환" : "다크 모드로 전환"
    );
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    renderThemeToggle(theme);
  }

  els.themeToggle.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  applyTheme(effectiveTheme());

  const today = new Date();
  const view = { mode: "month", year: today.getFullYear(), month: today.getMonth() };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { habits: [], records: {} };
      const parsed = JSON.parse(raw);
      return {
        habits: Array.isArray(parsed.habits) ? parsed.habits : [],
        records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
      };
    } catch {
      return { habits: [], records: {} };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const state = loadState();

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function dateKey(y, m, d) {
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }

  function daysInMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  function isToday(y, m, d) {
    return (
      y === today.getFullYear() && m === today.getMonth() && d === today.getDate()
    );
  }

  function isFuture(y, m, d) {
    const cellDate = new Date(y, m, d);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return cellDate > todayStart;
  }

  function addHabit(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const habit = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      hueIndex: state.habits.length % HUE_COUNT,
    };
    state.habits.push(habit);
    state.records[habit.id] = {};
    saveState();
    render();
  }

  function deleteHabit(id) {
    const habit = state.habits.find((h) => h.id === id);
    if (!habit) return;
    if (!confirm(`"${habit.name}" 습관을 삭제할까요? 기록도 함께 사라져요.`)) return;
    state.habits = state.habits.filter((h) => h.id !== id);
    delete state.records[id];
    saveState();
    render();
  }

  function toggleDay(habitId, key) {
    if (!state.records[habitId]) state.records[habitId] = {};
    if (state.records[habitId][key]) {
      delete state.records[habitId][key];
    } else {
      state.records[habitId][key] = true;
    }
    saveState();
    render();
  }

  function changePeriod(delta) {
    if (view.mode === "year") {
      view.year += delta;
      render();
      return;
    }
    let m = view.month + delta;
    let y = view.year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    view.month = m;
    view.year = y;
    render();
  }

  function setViewMode(mode) {
    view.mode = mode;
    els.viewMonthBtn.setAttribute("aria-selected", String(mode === "month"));
    els.viewYearBtn.setAttribute("aria-selected", String(mode === "year"));
    render();
  }

  function isMonthFuture(y, m) {
    return y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth());
  }

  function monthProgress(habitId, y, m, numDays) {
    const rec = state.records[habitId] || {};
    let done = 0;
    let elapsed = 0;
    for (let d = 1; d <= numDays; d++) {
      if (isFuture(y, m, d)) continue;
      elapsed++;
      if (rec[dateKey(y, m, d)]) done++;
    }
    return { done, elapsed };
  }

  function habitColorVar(habit) {
    return `var(--hue-${habit.hueIndex ?? 0})`;
  }

  function renderHabitNameCell(habit, done, elapsed) {
    const pct = elapsed > 0 ? Math.round((done / elapsed) * 100) : 0;
    const nameTd = document.createElement("td");
    nameTd.className = "habit-name-cell";
    nameTd.innerHTML = `
      <div class="habit-name-row">
        <div style="width:100%">
          <div class="habit-name-text" title="${escapeHtml(habit.name)}">${escapeHtml(habit.name)}</div>
          <div class="habit-meta">
            <div class="habit-bar"><div class="habit-bar-fill" style="width:${pct}%; --habit-color:${habitColorVar(habit)}"></div></div>
            <div class="habit-progress">${done}/${elapsed}</div>
          </div>
        </div>
        <button class="delete-habit-btn" aria-label="${escapeHtml(habit.name)} 삭제" title="삭제">✕</button>
      </div>
    `;
    nameTd.querySelector(".delete-habit-btn").addEventListener("click", () => deleteHabit(habit.id));
    return nameTd;
  }

  function render() {
    els.emptyState.hidden = state.habits.length > 0;
    if (view.mode === "year") {
      renderYearView();
    } else {
      renderMonthView();
    }
  }

  function renderMonthView() {
    els.periodLabel.textContent = `${view.year}년 ${MONTH_NAMES[view.month]}`;
    const numDays = daysInMonth(view.year, view.month);

    els.headerRow.innerHTML = "";
    const nameTh = document.createElement("th");
    nameTh.className = "habit-name-cell";
    nameTh.textContent = "습관";
    els.headerRow.appendChild(nameTh);

    for (let d = 1; d <= numDays; d++) {
      const weekday = new Date(view.year, view.month, d).getDay();
      const th = document.createElement("th");
      th.className = "day-col";
      if (weekday === 0 || weekday === 6) th.classList.add("weekend");
      if (isToday(view.year, view.month, d)) th.classList.add("today");
      th.innerHTML = `
        <span class="day-weekday">${WEEKDAY_NAMES[weekday]}</span>
        <span class="day-number">${d}</span>
      `;
      els.headerRow.appendChild(th);
    }

    els.habitBody.innerHTML = "";
    for (const habit of state.habits) {
      const tr = document.createElement("tr");
      const { done, elapsed } = monthProgress(habit.id, view.year, view.month, numDays);
      tr.appendChild(renderHabitNameCell(habit, done, elapsed));

      const habitColor = habitColorVar(habit);
      for (let d = 1; d <= numDays; d++) {
        const td = document.createElement("td");
        td.className = "day-col";
        const key = dateKey(view.year, view.month, d);
        const isDone = !!(state.records[habit.id] && state.records[habit.id][key]);
        const future = isFuture(view.year, view.month, d);

        const btn = document.createElement("button");
        btn.className = "square-btn" + (isDone ? " done" : "") + (future ? " future" : "");
        btn.style.setProperty("--habit-color", habitColor);
        btn.setAttribute("aria-pressed", String(isDone));
        btn.setAttribute(
          "aria-label",
          `${habit.name} ${view.month + 1}월 ${d}일 ${isDone ? "완료됨" : "미완료"}`
        );
        if (!future) {
          btn.addEventListener("click", () => toggleDay(habit.id, key));
        } else {
          btn.disabled = true;
        }
        td.appendChild(btn);
        tr.appendChild(td);
      }

      els.habitBody.appendChild(tr);
    }
  }

  function renderYearView() {
    els.periodLabel.textContent = `${view.year}년`;

    els.headerRow.innerHTML = "";
    const nameTh = document.createElement("th");
    nameTh.className = "habit-name-cell";
    nameTh.textContent = "습관";
    els.headerRow.appendChild(nameTh);

    for (let m = 0; m < 12; m++) {
      const th = document.createElement("th");
      th.className = "year-col";
      if (view.year === today.getFullYear() && m === today.getMonth()) {
        th.classList.add("current-period");
      }
      th.textContent = MONTH_NAMES[m];
      els.headerRow.appendChild(th);
    }

    els.habitBody.innerHTML = "";
    for (const habit of state.habits) {
      const tr = document.createElement("tr");
      const habitColor = habitColorVar(habit);

      let yearDone = 0;
      let yearElapsed = 0;
      const monthStats = [];
      for (let m = 0; m < 12; m++) {
        const stats = monthProgress(habit.id, view.year, m, daysInMonth(view.year, m));
        monthStats.push(stats);
        yearDone += stats.done;
        yearElapsed += stats.elapsed;
      }
      tr.appendChild(renderHabitNameCell(habit, yearDone, yearElapsed));

      for (let m = 0; m < 12; m++) {
        const td = document.createElement("td");
        td.className = "year-col";
        const { done, elapsed } = monthStats[m];
        const pct = elapsed > 0 ? Math.round((done / elapsed) * 100) : 0;
        const future = isMonthFuture(view.year, m);

        const btn = document.createElement("button");
        btn.className = "month-cell" + (future ? " future" : "");
        btn.style.setProperty("--habit-color", habitColor);
        btn.style.setProperty("--pct", `${pct}%`);
        btn.setAttribute(
          "aria-label",
          `${habit.name} ${view.year}년 ${MONTH_NAMES[m]} ${done}/${elapsed}일 달성, 자세히 보려면 클릭`
        );
        btn.innerHTML = `<span class="month-cell-value">${done}/${elapsed}</span>`;
        btn.addEventListener("click", () => {
          view.month = m;
          setViewMode("month");
        });
        td.appendChild(btn);
        tr.appendChild(td);
      }

      els.habitBody.appendChild(tr);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  els.prevPeriod.addEventListener("click", () => changePeriod(-1));
  els.nextPeriod.addEventListener("click", () => changePeriod(1));
  els.viewMonthBtn.addEventListener("click", () => setViewMode("month"));
  els.viewYearBtn.addEventListener("click", () => setViewMode("year"));

  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addHabit(els.habitInput.value);
    els.habitInput.value = "";
    els.habitInput.focus();
  });

  render();
})();
