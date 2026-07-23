(() => {
  const STORAGE_KEY = "habit-tracker-state-v1";
  const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const MONTH_NAMES = [
    "1월", "2월", "3월", "4월", "5월", "6월",
    "7월", "8월", "9월", "10월", "11월", "12월",
  ];
  const HUE_COUNT = 6;

  const els = {
    prevMonth: document.getElementById("prevMonth"),
    nextMonth: document.getElementById("nextMonth"),
    monthLabel: document.getElementById("monthLabel"),
    addForm: document.getElementById("addHabitForm"),
    habitInput: document.getElementById("habitInput"),
    headerRow: document.getElementById("headerRow"),
    habitBody: document.getElementById("habitBody"),
    emptyState: document.getElementById("emptyState"),
  };

  const today = new Date();
  const view = { year: today.getFullYear(), month: today.getMonth() };

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

  function changeMonth(delta) {
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

  function render() {
    els.monthLabel.textContent = `${view.year}년 ${MONTH_NAMES[view.month]}`;
    els.emptyState.hidden = state.habits.length > 0;

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

      const nameTd = document.createElement("td");
      nameTd.className = "habit-name-cell";
      const { done, elapsed } = monthProgress(habit.id, view.year, view.month, numDays);
      const pct = elapsed > 0 ? Math.round((done / elapsed) * 100) : 0;
      const habitColor = `var(--hue-${habit.hueIndex ?? 0})`;
      nameTd.innerHTML = `
        <div class="habit-name-row">
          <div style="width:100%">
            <div class="habit-name-text" title="${escapeHtml(habit.name)}">${escapeHtml(habit.name)}</div>
            <div class="habit-meta">
              <div class="habit-bar"><div class="habit-bar-fill" style="width:${pct}%; --habit-color:${habitColor}"></div></div>
              <div class="habit-progress">${done}/${elapsed}</div>
            </div>
          </div>
          <button class="delete-habit-btn" aria-label="${escapeHtml(habit.name)} 삭제" title="삭제">✕</button>
        </div>
      `;
      nameTd.querySelector(".delete-habit-btn").addEventListener("click", () => deleteHabit(habit.id));
      tr.appendChild(nameTd);

      for (let d = 1; d <= numDays; d++) {
        const td = document.createElement("td");
        td.className = "day-col";
        const key = dateKey(view.year, view.month, d);
        const done = !!(state.records[habit.id] && state.records[habit.id][key]);
        const future = isFuture(view.year, view.month, d);

        const btn = document.createElement("button");
        btn.className = "square-btn" + (done ? " done" : "") + (future ? " future" : "");
        btn.style.setProperty("--habit-color", habitColor);
        btn.setAttribute("aria-pressed", String(done));
        btn.setAttribute(
          "aria-label",
          `${habit.name} ${view.month + 1}월 ${d}일 ${done ? "완료됨" : "미완료"}`
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  els.prevMonth.addEventListener("click", () => changeMonth(-1));
  els.nextMonth.addEventListener("click", () => changeMonth(1));

  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addHabit(els.habitInput.value);
    els.habitInput.value = "";
    els.habitInput.focus();
  });

  render();
})();
