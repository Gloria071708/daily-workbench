/* ============================================================
 * 个人工作台 · Daily Workbench
 * 数据全部存储在 localStorage,无后端依赖
 * ============================================================ */

(function () {
  "use strict";

  /* ---------- 工具函数 ---------- */
  const $ = (id) => document.getElementById(id);
  const fmt2 = (n) => String(n).padStart(2, "0");

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
  }
  function addDays(dateStr, delta) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
  }
  function fmtDateCN(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
  }
  function fmtMin(min) {
    min = Math.round(min || 0);
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h${m}m` : `${h}h`;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function isValidDateStr(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + "T00:00:00");
    return !isNaN(d.getTime());
  }

  function toast(msg, type) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("toast-done", "toast-warn", "toast-danger");
    if (type === "done" || type === "success") t.classList.add("toast-done");
    else if (type === "warn" || type === "warning") t.classList.add("toast-warn");
    else if (type === "danger" || type === "error") t.classList.add("toast-danger");
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------- 数据层 ---------- */
  const STORE_KEY = "workbench_data_v1";
  const THEME_KEY = "workbench_theme";

  function loadData() {
    let d;
    try {
      d = JSON.parse(localStorage.getItem(STORE_KEY)) || defaultData();
    } catch {
      d = defaultData();
    }
    // 兼容旧版本数据(补齐缺失字段)
    const def = defaultData();
    if (!d || typeof d !== "object") d = def;
    if (!d.tasks || typeof d.tasks !== "object") d.tasks = {};
    if (!Array.isArray(d.countdowns)) d.countdowns = [];
    if (!d.notes || typeof d.notes !== "object") d.notes = {};
    if (!Array.isArray(d.words)) d.words = [];
    if (!d.summaries || typeof d.summaries !== "object") d.summaries = {};
    return d;
  }
  function saveData() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.data));
  }
  function defaultData() {
    return { tasks: {}, countdowns: [], notes: {}, words: [], summaries: {} };
  }

  const state = {
    data: loadData(),
    viewDate: todayStr(),
    timer: {
      mode: "up",        // up | down
      running: false,
      remain: 0,         // 倒计时剩余秒 / 正计时累计秒
      target: 0,         // 倒计时目标秒
      intervalId: null,
      linkTaskId: "",
      linkTaskDate: "",
    },
    review: { from: "", to: "" },
    english: {
      subtitles: [],   // [{ id, en, zh, status, src }]
      srcMode: "text",
      translating: false,
    },
  };

  /* 任务按日期分组: data.tasks[dateStr] = [task,...]
     task: { id, name, priority, estimate, actual, status, note, reflect, createdAt } */

  function getTasks(date) { return state.data.tasks[date] || []; }
  function setTasks(date, arr) { state.data.tasks[date] = arr; saveData(); }

  /* ============================================================
   * 主题
   * ============================================================ */
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(saved);
    $("themeToggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(cur === "light" ? "dark" : "light");
    });
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("themeIcon").textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem(THEME_KEY, theme);
    // 同步 PWA 状态栏主题色
    const darkColor = "#14172b";
    const lightColor = "#5b6cff";
    const col = theme === "dark" ? darkColor : lightColor;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", col);
    const maskIcon = document.querySelector('meta[name="msapplication-TileColor"]');
    if (maskIcon) maskIcon.setAttribute("content", col);
    // iOS 状态栏
    const iosBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (iosBar) iosBar.setAttribute("content", theme === "dark" ? "black-translucent" : "default");
  }

  /* ============================================================
   * 导航切换
   * ============================================================ */
  function initNav() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
  }
  function switchTab(tab) {
    document.querySelectorAll(".nav-item").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab)
    );
    document.querySelectorAll(".panel").forEach((p) =>
      p.classList.toggle("active", p.id === "panel-" + tab)
    );
    if (tab === "review") { renderReview(); refreshSummaryDateSel(); refreshDailyHub(); }
    if (tab === "timer") refreshTimerTaskLink();
    if (tab === "english") renderWordCount();
    renderModule(tab);
    // 移动端:关闭抽屉 + 更新标题
    if (window.innerWidth <= 980) {
      const sidebar = document.getElementById("sidebar");
      const overlay = document.getElementById("mobileOverlay");
      if (sidebar) sidebar.classList.remove("open");
      if (overlay) overlay.classList.remove("show");
    }
    const label = document.querySelector(`.nav-item[data-tab="${tab}"] .nav-label`);
    const mt = document.getElementById("mobileTitle");
    if (label && mt) mt.textContent = label.textContent;
  }

  /* ============================================================
   * 侧边栏今日卡片
   * ============================================================ */
  function renderSidebarToday() {
    const d = new Date();
    const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    $("sidebarToday").innerHTML =
      `<div class="tc-date">${fmt2(d.getMonth() + 1)}/${fmt2(d.getDate())} 周${week}</div>` +
      `今天 · ${todayStr()}`;
  }

  /* ============================================================
   * 今日任务模块
   * ============================================================ */
  function initTasks() {
    $("taskDate").value = state.viewDate;
    $("taskDate").addEventListener("change", (e) => {
      state.viewDate = e.target.value || todayStr();
      renderTasks();
    });
    $("prevDay").addEventListener("click", () => {
      state.viewDate = addDays(state.viewDate, -1);
      $("taskDate").value = state.viewDate;
      renderTasks();
    });
    $("nextDay").addEventListener("click", () => {
      state.viewDate = addDays(state.viewDate, 1);
      $("taskDate").value = state.viewDate;
      renderTasks();
    });
    $("todayBtn").addEventListener("click", () => {
      state.viewDate = todayStr();
      $("taskDate").value = state.viewDate;
      renderTasks();
    });

    $("addTaskBtn").addEventListener("click", addTask);
    $("taskInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") addTask();
    });

    renderTasks();
  }

  function addTask() {
    const name = $("taskInput").value.trim();
    if (!name) { toast("请输入任务名称"); return; }
    const priority = $("taskPriority").value;
    const estimate = parseInt($("taskEstimate").value, 10) || 0;
    const list = getTasks(state.viewDate);
    list.push({
      id: uid(),
      name,
      priority,
      estimate,
      actual: 0,
      status: "todo",   // todo | doing | done
      note: "",
      reflect: "",
      createdAt: Date.now(),
    });
    setTasks(state.viewDate, list);
    $("taskInput").value = "";
    $("taskEstimate").value = "";
    renderTasks();
    toast("任务已添加");
  }

  function renderTasks() {
    const list = getTasks(state.viewDate);
    const wrap = $("taskList");
    const empty = $("taskEmpty");
    wrap.innerHTML = "";

    if (!list.length) {
      empty.style.display = "block";
      updateStats(list);
      return;
    }
    empty.style.display = "none";

    const order = { high: 0, medium: 1, low: 2 };
    const sorted = [...list].sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      return order[a.priority] - order[b.priority] || a.createdAt - b.createdAt;
    });

    sorted.forEach((task) => wrap.appendChild(taskNode(task, state.viewDate)));
    updateStats(list);
  }

  function taskNode(task, date) {
    const el = document.createElement("div");
    el.className = "task-item" + (task.status === "done" ? " done" : "");
    const pLabel = { high: "高优", medium: "中优", low: "低优" }[task.priority];

    const photos = Array.isArray(task.photos) ? task.photos : [];
    el.innerHTML = `
      <div class="task-check" title="标记完成">✓</div>
      ${photos.length ? `<img class="task-photo-thumb" src="${photos[0]}" alt="照片" title="点击查看照片"/>` : ""}
      <div class="task-main">
        <div class="task-name"></div>
        <div class="task-meta">
          <span class="tag tag-${task.priority}">${pLabel}</span>
          <span>⏱ 预计 ${task.estimate ? task.estimate + "min" : "—"}</span>
          <span>✓ 实际 ${fmtMin(task.actual)}</span>
          ${photos.length ? `<span>📷 ${photos.length}张</span>` : ""}
          ${task.status === "doing" ? '<span style="color:var(--warn)">● 进行中</span>' : ""}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn btn-play" title="开始计时">▶</button>
        <button class="icon-btn btn-edit" title="详情/复盘">✎</button>
        <button class="icon-btn btn-del" title="删除">🗑</button>
      </div>
    `;
    el.querySelector(".task-name").textContent = task.name;

    el.querySelector(".task-check").addEventListener("click", () => toggleDone(task, date));
    el.querySelector(".btn-del").addEventListener("click", () => deleteTask(task.id, date));
    el.querySelector(".btn-edit").addEventListener("click", () => openTaskModal(task, date));
    el.querySelector(".btn-play").addEventListener("click", () => startTimerForTask(task, date));
    const thumb = el.querySelector(".task-photo-thumb");
    if (thumb) thumb.addEventListener("click", () => viewPhoto(photos[0]));

    return el;
  }

  function toggleDone(task, date) {
    const list = getTasks(date);
    const t = list.find((x) => x.id === task.id);
    if (!t) return;
    t.status = t.status === "done" ? "todo" : "done";
    setTasks(date, list);
    renderTasks();
  }

  function deleteTask(id, date) {
    if (!confirm("确定删除这个任务吗?")) return;
    let list = getTasks(date);
    list = list.filter((x) => x.id !== id);
    setTasks(date, list);
    renderTasks();
    toast("已删除");
  }

  function updateStats(list) {
    const total = list.length;
    const done = list.filter((t) => t.status === "done").length;
    const active = list.filter((t) => t.status === "doing").length;
    $("statTotal").textContent = total;
    $("statDone").textContent = done;
    $("statActive").textContent = active;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("progressFill").style.width = pct + "%";
    $("progressText").textContent = pct + "%";
  }

  /* ============================================================
   * 任务详情弹层 (复盘)
   * ============================================================ */
  function openTaskModal(task, date) {
    const body = $("modalBody");
    const t = getTasks(date).find((x) => x.id === task.id);
    if (!t) return;
    const cur = getTasks(date).find((x) => x.id === task.id);

    body.innerHTML = `
      <div class="modal-field">
        <label>任务名称</label>
        <input type="text" id="mName" value="${escapeHtml(t.name)}" />
      </div>
      <div class="modal-field" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label>优先级</label>
          <select id="mPriority">
            <option value="high">高优</option>
            <option value="medium">中优</option>
            <option value="low">低优</option>
          </select>
        </div>
        <div>
          <label>状态</label>
          <select id="mStatus">
            <option value="todo">待办</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
          </select>
        </div>
      </div>
      <div class="modal-field" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label>预计耗时 (min)</label>
          <input type="number" id="mEstimate" value="${t.estimate || 0}" min="0" />
        </div>
        <div>
          <label>实际耗时 (min)</label>
          <input type="number" id="mActual" value="${t.actual || 0}" min="0" />
        </div>
      </div>
      <div class="modal-divider"></div>
      <div class="modal-field">
        <label>执行情况记录 (做了什么、怎么做的)</label>
        <textarea id="mNote" rows="3" placeholder="记录实际执行过程...">${escapeHtml(t.note || "")}</textarea>
      </div>
      <div class="modal-field">
        <label>复盘反思 (卡点、收获、可改进点)</label>
        <textarea id="mReflect" rows="3" placeholder="哪里做得好?哪里卡住了?下次怎么优化?">${escapeHtml(t.reflect || "")}</textarea>
      </div>
      <div class="modal-divider"></div>
      <div class="modal-field modal-photo-section">
        <label>📷 任务照片 (可附执行现场/成果图片)</label>
        <div class="photo-upload-area" id="photoUploadArea">点击或拖拽上传图片</div>
        <input type="file" id="photoInput" accept="image/*" multiple style="display:none;" />
        <div class="photo-preview-row" id="photoPreviewRow"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mCancel">取消</button>
        <button class="btn btn-primary" id="mSave">保存</button>
      </div>
    `;
    $("mPriority").value = t.priority;
    $("mStatus").value = t.status;

    // 照片编辑(临时列表,保存时写回)
    const photoDraft = Array.isArray(t.photos) ? [...t.photos] : [];
    renderPhotoPreview(photoDraft);
    $("photoUploadArea").addEventListener("click", () => $("photoInput").click());
    $("photoUploadArea").addEventListener("dragover", (e) => { e.preventDefault(); });
    $("photoUploadArea").addEventListener("drop", (e) => {
      e.preventDefault();
      handlePhotoFiles(e.dataTransfer.files, photoDraft);
    });
    $("photoInput").addEventListener("change", (e) => {
      handlePhotoFiles(e.target.files, photoDraft);
      e.target.value = "";
    });

    $("mCancel").addEventListener("click", closeModal);
    $("mSave").addEventListener("click", () => {
      const list = getTasks(date);
      const target = list.find((x) => x.id === task.id);
      if (!target) return;
      target.name = $("mName").value.trim() || target.name;
      target.priority = $("mPriority").value;
      target.status = $("mStatus").value;
      target.estimate = parseInt($("mEstimate").value, 10) || 0;
      target.actual = parseInt($("mActual").value, 10) || 0;
      target.note = $("mNote").value.trim();
      target.reflect = $("mReflect").value.trim();
      target.photos = photoDraft;
      setTasks(date, list);
      renderTasks();
      closeModal();
      toast("已保存");
    });

    $("taskModal").classList.add("show");
  }

  /* ---------- 任务照片 ---------- */
  function handlePhotoFiles(files, draft) {
    const arr = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    let processed = 0;
    arr.forEach((file) => {
      compressImage(file, (dataUrl) => {
        if (dataUrl) draft.push(dataUrl);
        processed++;
        renderPhotoPreview(draft);
        if (processed === arr.length) toast(`已添加 ${arr.length} 张图片`);
      });
    });
  }
  function compressImage(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        cb(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => cb(null);
      img.src = reader.result;
    };
    reader.onerror = () => cb(null);
    reader.readAsDataURL(file);
  }
  function renderPhotoPreview(draft) {
    const row = $("photoPreviewRow");
    if (!row) return;
    if (!draft.length) { row.innerHTML = ""; return; }
    row.innerHTML = draft.map((src, i) =>
      `<div class="photo-thumb"><img src="${src}" alt="照片"/><div class="photo-del" data-i="${i}">✕</div></div>`
    ).join("");
    row.querySelectorAll(".photo-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        draft.splice(parseInt(btn.dataset.i, 10), 1);
        renderPhotoPreview(draft);
      });
    });
  }
  function viewPhoto(src) {
    let v = document.getElementById("photoViewer");
    if (!v) {
      v = document.createElement("div");
      v.id = "photoViewer";
      v.className = "photo-viewer";
      v.innerHTML = '<img alt="预览" />';
      v.addEventListener("click", () => v.classList.remove("show"));
      document.body.appendChild(v);
    }
    v.querySelector("img").src = src;
    v.classList.add("show");
  }
  function closeModal() { $("taskModal").classList.remove("show"); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  /* ============================================================
   * 计时器模块
   * ============================================================ */
  function initTimer() {
    document.querySelectorAll(".mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => setTimerMode(tab.dataset.mode));
    });
    document.querySelectorAll(".preset-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const sec = parseInt(b.dataset.sec, 10);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        $("setH").value = h;
        $("setM").value = m;
        $("setS").value = s;
        applyCountdownSetup();
      });
    });
    ["setH", "setM", "setS"].forEach((id) =>
      $(id).addEventListener("change", applyCountdownSetup)
    );

    $("timerStart").addEventListener("click", timerToggle);
    $("timerPause").addEventListener("click", timerToggle);
    $("timerReset").addEventListener("click", timerReset);
    $("modalClose").addEventListener("click", closeModal);
    $("taskModal").addEventListener("click", (e) => {
      if (e.target.id === "taskModal") closeModal();
    });

    applyCountdownSetup();
    updateTimerDisplay();
  }

  function setTimerMode(mode) {
    if (state.timer.running) {
      toast("请先暂停或重置当前计时");
      return;
    }
    state.timer.mode = mode;
    document.querySelectorAll(".mode-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.mode === mode)
    );
    $("timerSetup").style.display = mode === "down" ? "block" : "none";
    timerReset();
  }

  function applyCountdownSetup() {
    if (state.timer.running) return;
    if (state.timer.mode !== "down") {
      state.timer.remain = 0;
      updateTimerDisplay();
      return;
    }
    const sec = readSetupSeconds();
    state.timer.target = sec;
    state.timer.remain = sec;
    updateTimerDisplay();
    $("timerStatus").textContent = sec ? "已设定,等待开始" : "请设置时间";
  }
  function readSetupSeconds() {
    const h = parseInt($("setH").value, 10) || 0;
    const m = parseInt($("setM").value, 10) || 0;
    const s = parseInt($("setS").value, 10) || 0;
    return h * 3600 + m * 60 + s;
  }

  function timerToggle() {
    const tm = state.timer;
    if (tm.mode === "down" && !tm.running && tm.remain <= 0) {
      const sec = readSetupSeconds();
      if (!sec) { toast("请先设置倒计时时间"); return; }
      tm.target = sec;
      tm.remain = sec;
    }
    if (tm.running) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function startTimer() {
    const tm = state.timer;
    tm.running = true;
    $("timerStart").textContent = "继续";
    $("timerStart").disabled = true;
    $("timerPause").disabled = false;
    $("timerDisplay").classList.add("running");
    $("timerStatus").textContent = tm.mode === "up" ? "正计时中…" : "倒计时中…";

    tm.intervalId = setInterval(tick, 1000);
  }
  function pauseTimer() {
    const tm = state.timer;
    tm.running = false;
    clearInterval(tm.intervalId);
    $("timerStart").disabled = false;
    $("timerStart").textContent = "继续";
    $("timerPause").disabled = true;
    $("timerDisplay").classList.remove("running");
    $("timerStatus").textContent = "已暂停";
  }
  function timerReset() {
    const tm = state.timer;
    clearInterval(tm.intervalId);
    tm.running = false;
    $("timerStart").textContent = "开始";
    $("timerStart").disabled = false;
    $("timerPause").disabled = true;
    $("timerDisplay").classList.remove("running");
    applyCountdownSetup();
    if (tm.mode === "up") {
      tm.remain = 0;
      updateTimerDisplay();
      $("timerStatus").textContent = "就绪";
    }
    // 正计时重置时结算关联任务
    if (tm.linkTaskId) commitTimerToTask();
  }

  function tick() {
    const tm = state.timer;
    if (tm.mode === "up") {
      tm.remain += 1;
    } else {
      tm.remain -= 1;
      if (tm.remain <= 0) {
        tm.remain = 0;
        finishCountdown();
        return;
      }
    }
    updateTimerDisplay();
  }

  function finishCountdown() {
    clearInterval(state.timer.intervalId);
    state.timer.running = false;
    $("timerDisplay").classList.remove("running");
    $("timerStart").textContent = "开始";
    $("timerStart").disabled = false;
    $("timerPause").disabled = true;
    updateTimerDisplay();
    $("timerStatus").textContent = "时间到!";
    notifyTimeUp();
    // 倒计时结束,若关联任务则累计实际时间
    if (state.timer.linkTaskId) commitTimerToTask();
  }

  function notifyTimeUp() {
    try {
      if (Notification && Notification.permission === "granted") {
        new Notification("⏰ 时间到", { body: "你的倒计时已结束,休息一下吧" });
      }
    } catch {}
    // 播放提示音 (Web Audio 短促 beep)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.6);
    } catch {}
    toast("⏰ 时间到!");
  }

  function updateTimerDisplay() {
    const tm = state.timer;
    let sec = tm.remain;
    if (sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    $("timerDisplay").textContent = `${fmt2(h)}:${fmt2(m)}:${fmt2(s)}`;
  }

  function refreshTimerTaskLink() {
    const sel = $("timerTaskLink");
    const cur = sel.value;
    const tasks = getTasks(state.viewDate).filter((t) => t.status !== "done");
    sel.innerHTML = '<option value="">不关联</option>' +
      tasks.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
    if (tasks.find((t) => t.id === cur)) sel.value = cur;
    else state.timer.linkTaskId = "";
  }

  function startTimerForTask(task, date) {
    state.viewDate = date;
    state.timer.linkTaskId = task.id;
    state.timer.linkTaskDate = date;
    switchTab("timer");
    refreshTimerTaskLink();
    $("timerTaskLink").value = task.id;
    if (state.timer.mode !== "up") setTimerMode("up");
    if (!state.timer.running) startTimer();
    toast(`开始为「${task.name}」计时`);
  }

  // 把正计时累计的时间写入关联任务
  function commitTimerToTask() {
    const tm = state.timer;
    if (!tm.linkTaskId || !tm.linkTaskDate) return;
    const minutes = Math.round(tm.remain / 60);
    if (minutes <= 0) { tm.linkTaskId = ""; return; }
    const list = getTasks(tm.linkTaskDate);
    const t = list.find((x) => x.id === tm.linkTaskId);
    if (t) {
      t.actual = (t.actual || 0) + minutes;
      if (t.status === "todo") t.status = "doing";
      setTasks(tm.linkTaskDate, list);
      toast(`已为「${t.name}」记录 ${fmtMin(minutes)}`);
    }
    tm.linkTaskId = "";
    tm.remain = 0;
    updateTimerDisplay();
    refreshTimerTaskLink();
  }

  // 关联选择变化
  function initTimerLink() {
    $("timerTaskLink").addEventListener("change", (e) => {
      // 切换前若正在关联且已累计,先结算
      if (state.timer.linkTaskId && state.timer.linkTaskId !== e.target.value && state.timer.remain > 0 && state.timer.mode === "up") {
        if (confirm("切换关联任务前,先把当前累计时间记入原任务?")) commitTimerToTask();
      }
      state.timer.linkTaskId = e.target.value;
      state.timer.linkTaskDate = state.viewDate;
    });
  }

  /* ============================================================
   * 日期倒计时模块
   * ============================================================ */
  function initCountdown() {
    $("addCdBtn").addEventListener("click", addCountdown);
    renderCountdowns();
    // 每分钟刷新
    setInterval(renderCountdowns, 60000);
  }
  function addCountdown() {
    const name = $("cdName").value.trim();
    const date = $("cdDate").value;
    if (!name) { toast("请输入事件名称"); return; }
    if (!isValidDateStr(date)) { toast("请选择有效的日期"); return; }
    state.data.countdowns.push({ id: uid(), name, date });
    saveData();
    $("cdName").value = "";
    $("cdDate").value = "";
    renderCountdowns();
    toast("已添加倒计时");
  }
  function renderCountdowns() {
    let list = (state.data.countdowns || []).filter((cd) => isValidDateStr(cd.date));
    // 清理历史脏数据
    if (list.length !== (state.data.countdowns || []).length) {
      state.data.countdowns = list;
      saveData();
    }
    const wrap = $("countdownList");
    const empty = $("cdEmpty");
    wrap.innerHTML = "";
    if (!list.length) { empty.style.display = "block"; return; }
    empty.style.display = "none";

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
    sorted.forEach((cd) => {
      const target = new Date(cd.date + "T00:00:00");
      const diff = Math.round((target - now) / 86400000);
      const overdue = diff < 0;
      const days = Math.abs(diff);
      const today = diff === 0;

      const el = document.createElement("div");
      el.className = "cd-item";
      el.innerHTML = `
        <div class="cd-info">
          <div class="cd-name"></div>
          <div class="cd-date">${cd.date} · ${fmtDateCN(cd.date)}</div>
        </div>
        <div class="cd-days ${overdue ? "overdue" : ""}">
          <div class="cd-days-num">${today ? "今天" : days}</div>
          <div class="cd-days-label">${today ? "就是今天" : overdue ? "天前已过" : "天后"}</div>
        </div>
        <button class="icon-btn btn-del-cd" title="删除">🗑</button>
      `;
      el.querySelector(".cd-name").textContent = cd.name;
      el.querySelector(".btn-del-cd").addEventListener("click", () => {
        if (!confirm("删除这个倒计时?")) return;
        state.data.countdowns = state.data.countdowns.filter((x) => x.id !== cd.id);
        saveData();
        renderCountdowns();
      });
      wrap.appendChild(el);
    });
  }

  /* ============================================================
   * 复盘分析模块
   * ============================================================ */
  function initReview() {
    // 默认最近 7 天
    const to = todayStr();
    const from = addDays(to, -6);
    $("reviewFrom").value = from;
    $("reviewTo").value = to;
    state.review = { from, to };

    $("reviewApply").addEventListener("click", () => {
      state.review.from = $("reviewFrom").value || from;
      state.review.to = $("reviewTo").value || to;
      renderReview();
    });

    $("saveNoteBtn").addEventListener("click", saveNote);
    loadNote();

    // 自动复盘总结
    $("genSummaryBtn").addEventListener("click", generateSummary);
    refreshSummaryDateSel();
  }

  function refreshSummaryDateSel() {
    const sel = $("summaryDateSel");
    if (!sel) return;
    const dates = Object.keys(state.data.tasks)
      .filter((d) => (state.data.tasks[d] || []).length > 0)
      .sort().reverse();
    if (!dates.length) {
      sel.innerHTML = `<option value="${todayStr()}">${todayStr()} (今天,暂无任务)</option>`;
      return;
    }
    sel.innerHTML = dates.map((d) =>
      `<option value="${d}" ${d === state.viewDate ? "selected" : ""}>${d} (${fmtDateCN(d)})</option>`
    ).join("");
  }

  function generateSummary() {
    const date = $("summaryDateSel").value || todayStr();
    const tasks = getTasks(date);
    const wrap = $("autoSummary");
    if (!tasks.length) {
      wrap.innerHTML = `<div class="summary-section warn"><h4>⚠️ 无数据</h4><p>${date} 没有任务记录,无法生成复盘总结。请先到「今日任务」添加并执行任务。</p></div>`;
      return;
    }

    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const doing = tasks.filter((t) => t.status === "doing").length;
    const todo = tasks.filter((t) => t.status === "todo").length;
    const rate = Math.round((done / total) * 100);
    const estSum = tasks.reduce((s, t) => s + (t.estimate || 0), 0);
    const actSum = tasks.reduce((s, t) => s + (t.actual || 0), 0);
    const highTasks = tasks.filter((t) => t.priority === "high");
    const highDone = highTasks.filter((t) => t.status === "done").length;
    const reflected = tasks.filter((t) => t.reflect && t.reflect.trim());
    const noted = tasks.filter((t) => t.note && t.note.trim());
    const withPhoto = tasks.filter((t) => Array.isArray(t.photos) && t.photos.length);
    // 优先读取当前单日笔记(review.from===review.to 时),否则尝试 date_date 兜底
    const singleDayKey = date + "_" + date;
    const note = (state.data.notes[singleDayKey] || "").trim();
    const estRatio = estSum > 0 ? actSum / estSum : 0;

    // 等级判定
    let grade, gradeClass, gradeText;
    if (rate >= 85) { grade = "A"; gradeClass = "good"; gradeText = "执行力强,表现优秀"; }
    else if (rate >= 70) { grade = "B"; gradeClass = "good"; gradeText = "执行良好,小幅可优化"; }
    else if (rate >= 50) { grade = "C"; gradeClass = "warn"; gradeText = "中等,需提升完成度"; }
    else { grade = "D"; gradeClass = "warn"; gradeText = "完成度偏低,需重点改进"; }

    // 卡点识别(从反思/笔记文本提取关键词)
    const allText = tasks.map((t) => (t.reflect + " " + t.note)).join(" ") + " " + note;
    const blockerKw = ["卡", "难", "慢", "拖延", "中断", "分心", "超时", "没做完", "来不及", "打扰", "刷", "累", "困", "忘了"];
    const foundBlockers = blockerKw.filter((k) => allText.includes(k));

    // 亮点识别
    const highlightKw = ["完成", "专注", "高效", "顺利", "提前", "突破", "坚持", "清晰"];
    const foundHighlights = highlightKw.filter((k) => allText.includes(k));

    // 生成各部分
    let html = "";

    // 1. 概览
    html += `<div class="summary-section highlight">
      <h4>📊 当日概览</h4>
      <div class="summary-kv">
        <span>日期:<b>${fmtDateCN(date)}</b></span>
        <span>任务总数:<b>${total}</b></span>
        <span>已完成:<b>${done}</b></span>
        <span>进行中:<b>${doing}</b></span>
        <span>未开始:<b>${todo}</b></span>
        <span>完成率:<b>${rate}%</b></span>
      </div>
      <div class="summary-kv" style="margin-top:8px;">
        <span>预计投入:<b>${fmtMin(estSum)}</b></span>
        <span>实际投入:<b>${fmtMin(actSum)}</b></span>
        ${estSum ? `<span>估时偏差:<b>${actSum > estSum ? "+" : ""}${Math.round((estRatio - 1) * 100)}%</b></span>` : ""}
        <span>高优完成:<b>${highDone}/${highTasks.length}</b></span>
        <span>带照片任务:<b>${withPhoto.length}</b></span>
      </div>
    </div>`;

    // 2. 执行评级
    html += `<div class="summary-section ${gradeClass}">
      <h4>🎯 执行评级</h4>
      <p><b style="font-size:18px;">${grade} 级</b> · ${gradeText}。完成率 ${rate}%,${done}/${total} 个任务完成。</p>
    </div>`;

    // 3. 完成情况分析
    let compAnalysis = [];
    if (rate >= 85) compAnalysis.push(`完成率 ${rate}% 表现优秀,绝大部分任务已闭环,执行力稳定。`);
    else if (rate >= 60) compAnalysis.push(`完成率 ${rate}% 中等偏上,剩余 ${total - done} 个任务未完成,需关注是否因优先级不清或拆分不足导致。`);
    else compAnalysis.push(`完成率仅 ${rate}%,偏低。${todo} 个未开始、${doing} 个进行中,任务积压明显。`);
    if (highTasks.length > 0) {
      const hr = Math.round((highDone / highTasks.length) * 100);
      compAnalysis.push(hr >= 80
        ? `高优任务完成 ${highDone}/${highTasks.length}(${hr}%),要事优先原则执行良好。`
        : `高优任务仅完成 ${highDone}/${highTasks.length}(${hr}%),要事未优先处理是主要问题。`);
    }
    if (doing > 0) compAnalysis.push(`有 ${doing} 个任务停留在「进行中」,建议今日收尾或明确状态,避免长期悬挂。`);
    html += `<div class="summary-section"><h4>✅ 完成情况分析</h4><ul>${compAnalysis.map((t) => `<li>${t}</li>`).join("")}</ul></div>`;

    // 4. 时间投入分析
    let timeAnalysis = [];
    if (estSum === 0) {
      timeAnalysis.push("未对任务预估耗时,无法评估时间感知准确度。建议为每个任务填写预计时间。");
    } else if (actSum === 0) {
      timeAnalysis.push(`已预估 ${fmtMin(estSum)} 但无实际投入记录。建议用计时器记录真实投入时间。`);
    } else {
      if (estRatio > 1.3) timeAnalysis.push(`实际投入 ${fmtMin(actSum)} 比预计 ${fmtMin(estSum)} 多 ${Math.round((estRatio - 1) * 100)}%,任务普遍超时,估时偏乐观。`);
      else if (estRatio < 0.7) timeAnalysis.push(`实际投入 ${fmtMin(actSum)} 远低于预计 ${fmtMin(estSum)} (${Math.round(estRatio * 100)}%),可能任务未真正完成或被中断。`);
      else timeAnalysis.push(`估时准确度高(实际/预计 ≈ ${Math.round(estRatio * 100)}%),时间感知能力良好。`);
      const avgPerTask = Math.round(actSum / total);
      timeAnalysis.push(`平均每任务投入 ${fmtMin(avgPerTask)}。`);
    }
    html += `<div class="summary-section"><h4>⏱ 时间投入分析</h4><ul>${timeAnalysis.map((t) => `<li>${t}</li>`).join("")}</ul></div>`;

    // 5. 执行亮点
    let highlightHtml = "";
    if (foundHighlights.length) {
      highlightHtml = `<ul>${foundHighlights.map((k) => `<li>检测到关键词「${k}」:执行中体现了该积极状态</li>`).join("")}</ul>`;
    } else if (reflected.length) {
      highlightHtml = `<ul><li>已为 ${reflected.length} 个任务记录反思,复盘意识良好</li></ul>`;
    } else {
      highlightHtml = `<p class="muted">未从记录中识别到明显亮点关键词,建议执行时主动记录积极表现。</p>`;
    }
    html += `<div class="summary-section good"><h4>🌟 执行亮点</h4>${highlightHtml}</div>`;

    // 6. 卡点识别
    let blockerHtml = "";
    if (foundBlockers.length) {
      blockerHtml = `<ul>${foundBlockers.map((k) => `<li>识别到卡点关键词「${k}」—— 建议针对性分析根因</li>`).join("")}</ul>`;
      if (foundBlockers.includes("拖延") || foundBlockers.includes("分心") || foundBlockers.includes("刷")) {
        blockerHtml += `<p style="margin-top:6px;">存在注意力分散迹象,建议下次使用番茄钟(计时器-25分预设)强制专注。</p>`;
      }
      if (foundBlockers.includes("超时") || foundBlockers.includes("没做完") || foundBlockers.includes("来不及")) {
        blockerHtml += `<p style="margin-top:6px;">存在任务超载或估时不足,建议下次减少任务量或给预估加 30% 缓冲。</p>`;
      }
    } else {
      blockerHtml = `<p class="muted">未从记录中识别到明显卡点关键词。如实际有卡顿,建议在任务反思中具体描述。</p>`;
    }
    html += `<div class="summary-section warn"><h4>⚠️ 卡点识别</h4>${blockerHtml}</div>`;

    // 7. 优化建议
    const suggestions = [];
    if (rate < 70) suggestions.push("每日核心任务控制在 3-5 个,先完成高优再处理低优。");
    if (estSum === 0) suggestions.push("为每个任务预估耗时,便于复盘估时准确度。");
    if (actSum === 0 && estSum > 0) suggestions.push("使用计时器记录实际投入,形成「预计 vs 实际」对比数据。");
    if (highTasks.length > 0 && highDone / highTasks.length < 0.8) suggestions.push("每天先把最高优的 1-2 件事做完,再处理其它。");
    if (reflected.length < total / 2) suggestions.push("为更多任务填写复盘反思,记录执行过程与改进点。");
    if (estRatio > 1.3) suggestions.push("下次预估时给每个任务多留 30% 时间缓冲。");
    if (todo + doing > total * 0.4) suggestions.push("避免任务积压,未完成的及时调整优先级或移到次日。");
    if (foundBlockers.includes("拖延") || foundBlockers.includes("分心")) suggestions.push("用番茄钟(25分钟专注+5分钟休息)对抗分心。");
    if (!suggestions.length) suggestions.push("整体执行良好,保持当前节奏,可尝试挑战更高难度的任务。");
    html += `<div class="summary-section highlight"><h4>💡 优化建议(下次如何做)</h4><ul>${suggestions.map((t) => `<li>${t}</li>`).join("")}</ul></div>`;

    // 8. 明日重点
    const tomorrow = addDays(date, 1);
    const carryOver = tasks.filter((t) => t.status !== "done");
    let tomorrowHtml = `<p>明日(${fmtDateCN(tomorrow)})建议聚焦:</p><ul>`;
    if (carryOver.length) {
      carryOver.slice(0, 3).forEach((t) => {
        tomorrowHtml += `<li>延续未完成:${escapeHtml(t.name)}(${t.priority === "high" ? "高优" : t.priority === "medium" ? "中优" : "低优"})</li>`;
      });
    } else {
      tomorrowHtml += `<li>今日已全部完成,明日可规划新的核心目标</li>`;
    }
    tomorrowHtml += `</ul>`;
    html += `<div class="summary-section"><h4>📌 明日重点建议</h4>${tomorrowHtml}</div>`;

    // 9. 数据完整性提示
    const gaps = [];
    if (!noted.length) gaps.push("无执行情况记录");
    if (!reflected.length) gaps.push("无复盘反思");
    if (!withPhoto.length) gaps.push("无照片佐证");
    if (gaps.length) {
      html += `<div class="summary-section"><h4>📝 数据完整性</h4><p class="muted">当前缺失:${gaps.join("、")}。数据越完整,复盘分析越准确。</p></div>`;
    }

    wrap.innerHTML = html;

    // 缓存总结
    state.data.summaries[date] = { generatedAt: Date.now(), rate, total, done, grade };
    saveData();
    toast("已生成结构化复盘总结");
  }

  function gatherRangeData(from, to) {
    const days = [];
    let cur = from;
    while (cur <= to) {
      days.push({ date: cur, tasks: getTasks(cur) });
      cur = addDays(cur, 1);
    }
    return days;
  }

  function renderReview() {
    const from = $("reviewFrom").value;
    const to = $("reviewTo").value;
    if (!from || !to || from > to) {
      $("suggestList").innerHTML = '<p class="muted">请选择有效的日期范围</p>';
      return;
    }
    const days = gatherRangeData(from, to);

    let total = 0, done = 0, estSum = 0, actSum = 0;
    days.forEach((d) => {
      total += d.tasks.length;
      done += d.tasks.filter((t) => t.status === "done").length;
      estSum += d.tasks.reduce((s, t) => s + (t.estimate || 0), 0);
      actSum += d.tasks.reduce((s, t) => s + (t.actual || 0), 0);
    });
    const rate = total ? Math.round((done / total) * 100) : 0;

    $("rDays").textContent = days.length;
    $("rTotal").textContent = total;
    $("rDone").textContent = done;
    $("rRate").textContent = rate + "%";
    $("rEst").textContent = fmtMin(estSum);
    $("rAct").textContent = fmtMin(actSum);

    renderTrendChart(days);
    renderSuggestions(days, { total, done, rate, estSum, actSum });
    renderDetailTable(days);
    loadNote();
  }

  function renderTrendChart(days) {
    const wrap = $("trendChart");
    wrap.innerHTML = "";
    const max = Math.max(1, ...days.map((d) => d.tasks.length));
    if (days.every((d) => d.tasks.length === 0)) {
      wrap.innerHTML = '<div class="chart-empty">所选范围内暂无任务数据</div>';
      return;
    }
    days.forEach((d) => {
      const total = d.tasks.length;
      const done = d.tasks.filter((t) => t.status === "done").length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const h = total ? Math.round((total / max) * 130) + 6 : 4;
      const wrapEl = document.createElement("div");
      wrapEl.className = "chart-bar-wrap";
      wrapEl.innerHTML = `
        <div class="chart-bar" style="height:${h}px" data-tip="${fmtDateCN(d.date)} · 完成${done}/${total} (${pct}%)"></div>
        <div class="chart-label">${d.date.slice(5)}</div>
      `;
      wrap.appendChild(wrapEl);
    });
  }

  function renderSuggestions(days, agg) {
    const list = $("suggestList");
    const items = [];
    const { total, done, rate, estSum, actSum } = agg;

    if (total === 0) {
      list.innerHTML = '<p class="muted">所选范围内暂无任务数据,先去「今日任务」记录吧。</p>';
      return;
    }

    // 1. 完成率
    if (rate >= 85) {
      items.push({ type: "good", icon: "🎉", text: `完成率 ${rate}% 表现优秀!这段时间执行力很强,保持当前节奏。` });
    } else if (rate >= 60) {
      items.push({ type: "warn", icon: "💪", text: `完成率 ${rate}% 中等偏上,还有 ${total - done} 个任务未完成。建议检查未完成任务是否因拆分不够细或优先级不清导致。` });
    } else {
      items.push({ type: "bad", icon: "⚠️", text: `完成率仅 ${rate}%,偏低。建议:① 每天任务不超过 5 个核心项;② 把大任务拆成 30 分钟内可完成的小步;③ 高优任务先做。` });
    }

    // 2. 估时偏差
    if (estSum > 0 && actSum > 0) {
      const ratio = actSum / estSum;
      if (ratio > 1.3) {
        items.push({ type: "bad", icon: "⏰", text: `实际投入 ${fmtMin(actSum)} 比预计 ${fmtMin(estSum)} 多 ${Math.round((ratio - 1) * 100)}%。任务普遍超时,下次预估时给每个任务多留 30% 缓冲,或先识别耗时真实的子步骤。` });
      } else if (ratio < 0.7) {
        items.push({ type: "warn", icon: "⚡", text: `实际投入 ${fmtMin(actSum)} 远低于预计 ${fmtMin(estSum)}。可能任务未真正完成或被中断。建议用计时器专注执行,并记录中断原因。` });
      } else {
        items.push({ type: "good", icon: "🎯", text: `估时准确度高(实际/预计 ≈ ${Math.round(ratio * 100)}%),时间感知能力不错,继续保持。` });
      }
    } else if (estSum === 0) {
      items.push({ type: "warn", icon: "📌", text: "多数任务没有填写预计耗时。建议为每个任务预估时间,便于复盘估时准确度。" });
    }

    // 3. 每日分布
    const activeDays = days.filter((d) => d.tasks.length > 0);
    if (activeDays.length > 0) {
      const avgPerDay = total / activeDays.length;
      if (avgPerDay > 8) {
        items.push({ type: "bad", icon: "📦", text: `平均每天 ${avgPerDay.toFixed(1)} 个任务,偏多。任务过多易分散注意力,建议每日聚焦 3-5 个核心任务。` });
      } else if (avgPerDay < 1.5) {
        items.push({ type: "warn", icon: "🌱", text: `平均每天 ${avgPerDay.toFixed(1)} 个任务,偏少。可尝试把目标拆解成更小可执行的任务,让进度更可见。` });
      }
    }

    // 4. 空档天
    const emptyDays = days.filter((d) => d.tasks.length === 0).length;
    if (emptyDays > 0 && days.length > 1) {
      items.push({ type: "warn", icon: "🗓", text: `范围内有 ${emptyDays} 天没有任何任务记录。如果是有意休息很好;若是遗漏,建议养成每天早上先列任务的习惯。` });
    }

    // 5. 高优完成情况
    const highTasks = [];
    days.forEach((d) => d.tasks.forEach((t) => t.priority === "high" && highTasks.push(t)));
    if (highTasks.length) {
      const highDone = highTasks.filter((t) => t.status === "done").length;
      const highRate = Math.round((highDone / highTasks.length) * 100);
      if (highRate < 70) {
        items.push({ type: "bad", icon: "🔥", text: `高优任务完成率仅 ${highRate}%(${highDone}/${highTasks.length})。高优事项未完成影响最大,建议每天先把最高优的 1-2 件事做完再处理其它。` });
      } else {
        items.push({ type: "good", icon: "✅", text: `高优任务完成率 ${highRate}%,要事优先执行得不错。` });
      }
    }

    // 6. 是否有反思
    const reflected = days.reduce((s, d) => s + d.tasks.filter((t) => t.reflect && t.reflect.trim()).length, 0);
    if (reflected === 0) {
      items.push({ type: "warn", icon: "✍️", text: "还没有任何任务填写复盘反思。点击任务的「✎」记录执行情况和改进点,这是持续优化的关键。" });
    } else {
      items.push({ type: "good", icon: "📝", text: `已为 ${reflected} 个任务写了复盘反思,继续保持这个习惯。` });
    }

    list.innerHTML = items.map((it) =>
      `<div class="suggest-item ${it.type}"><span class="suggest-icon">${it.icon}</span><span>${it.text}</span></div>`
    ).join("");
  }

  function renderDetailTable(days) {
    const wrap = $("reviewDetail");
    const rows = [];
    days.forEach((d) => {
      d.tasks.forEach((t) => {
        rows.push({ date: d.date, task: t });
      });
    });
    if (!rows.length) {
      wrap.innerHTML = '<div class="muted">暂无数据</div>';
      return;
    }
    const statusText = { todo: "待办", doing: "进行中", done: "已完成" };
    let html = `<div class="rdt-row head">
      <div>日期</div><div>任务</div><div>优先级</div><div>预计</div><div>实际</div><div>状态</div>
    </div>`;
    rows.forEach((r) => {
      const t = r.task;
      const pLabel = { high: "高", medium: "中", low: "低" }[t.priority];
      html += `<div class="rdt-row">
        <div>${r.date.slice(5)}</div>
        <div></div>
        <div>${pLabel}</div>
        <div>${t.estimate || 0}min</div>
        <div>${fmtMin(t.actual)}</div>
        <div class="rdt-status ${t.status}">${statusText[t.status]}</div>
      </div>`;
    });
    wrap.innerHTML = html;
    // 填充任务名 (避免 HTML 注入)
    const nameEls = wrap.querySelectorAll(".rdt-row:not(.head) div:nth-child(2)");
    rows.forEach((r, i) => { nameEls[i].textContent = r.task.name; });
  }

  function noteKey() {
    return state.review.from + "_" + state.review.to;
  }
  function loadNote() {
    const key = noteKey();
    $("reviewNote").value = state.data.notes[key] || "";
    $("noteSavedTip").textContent = state.data.notes[key] ? "已保存的笔记" : "";
  }
  function saveNote() {
    const key = noteKey();
    const val = $("reviewNote").value.trim();
    state.data.notes[key] = val;
    saveData();
    $("noteSavedTip").textContent = "✓ 已保存";
    toast("笔记已保存");
    setTimeout(() => { $("noteSavedTip").textContent = "已保存的笔记"; }, 2000);
  }

  /* ============================================================
   * 英语学习模块
   * ============================================================ */
  function initEnglish() {
    // 切换导入方式
    document.querySelectorAll(".eng-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".eng-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const src = tab.dataset.src;
        state.english.srcMode = src;
        ["Text", "File", "Url"].forEach((s) => {
          $("src" + s).style.display = s.toLowerCase() === (src === "text" ? "text" : src === "file" ? "file" : "url") ? "block" : "none";
        });
      });
    });

    $("loadSubBtn").addEventListener("click", loadAndTranslate);
    $("clearSubBtn").addEventListener("click", clearSubtitles);
    $("subtitleFile").addEventListener("change", onSubtitleFile);
    // 文件选择后显示信息(原生 file input 透明覆盖在按钮上,用户直接点击即弹选择器)
    $("subtitleFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      const info = $("subtitleFileInfo");
      if (!f) { if (info) info.textContent = ""; return; }
      const sizeKB = (f.size / 1024).toFixed(1);
      const isAV = /\.(mp3|wav|m4a|ogg|flac|aac|webm|mp4|mov)$/i.test(f.name);
      if (info) {
        info.innerHTML = `<span style="color:var(--done)">✅ 已选:${escapeHtml(f.name)} (${sizeKB}KB)</span><br><span class="muted" style="font-size:11px">${isAV ? "音视频文件 → AI 自动转写为字幕" : "字幕文件 → 自动解析为逐句"};点击下方「加载并逐句翻译」或在文件 tab 内自行开始</span>`;
      }
    });
    // 拖拽 + 粘贴上传(绕过文件选择器被拦截的问题)
    const subDropzone = $("sub-dropzone");
    const subFilePicked = (file) => {
      onSubtitleFile({ target: { files: [file] } });
      const info = $("subtitleFileInfo");
      if (info) {
        const sizeKB = (file.size / 1024).toFixed(1);
        const isAV = /\.(mp3|wav|m4a|ogg|flac|aac|webm|mp4|mov)$/i.test(file.name);
        info.innerHTML = `<span style="color:var(--done)">✅ 已接收:${escapeHtml(file.name)} (${sizeKB}KB)</span><br><span class="muted" style="font-size:11px">${isAV ? "音视频文件 → AI 自动转写为字幕" : "字幕文件 → 自动解析为逐句"}</span>`;
      }
    };
    if (subDropzone) {
      subDropzone.addEventListener("dragover", (e) => {
        e.preventDefault(); e.stopPropagation();
        subDropzone.style.background = "var(--primary-soft)";
        subDropzone.style.borderColor = "var(--primary-deep)";
        subDropzone.style.transform = "scale(1.01)";
      });
      subDropzone.addEventListener("dragleave", (e) => {
        e.preventDefault(); e.stopPropagation();
        subDropzone.style.background = "var(--primary-soft)";
        subDropzone.style.borderColor = "var(--primary)";
        subDropzone.style.transform = "scale(1)";
      });
      subDropzone.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        subDropzone.style.background = "var(--primary-soft)";
        subDropzone.style.borderColor = "var(--primary)";
        subDropzone.style.transform = "scale(1)";
        const files = e.dataTransfer.files || [];
        if (!files.length) { toast("未检测到拖入的文件", "warn"); return; }
        subFilePicked(files[0]);
      });
      // 粘贴:文件 → 走文件流程;文本 → 自动切到「粘贴字幕」tab 并填入
      subDropzone.addEventListener("paste", (e) => {
        if (!e.clipboardData) return;
        const files = [];
        let text = "";
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const it = e.clipboardData.items[i];
          if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); }
          else if (it.kind === "string" && it.type === "text/plain") { text = e.clipboardData.getData("text/plain"); }
        }
        if (files.length) { e.preventDefault(); subFilePicked(files[0]); return; }
        if (text && text.trim()) {
          e.preventDefault();
          const textTab = document.querySelector('.eng-tab[data-src="text"]');
          if (textTab) textTab.click();
          const ta = $("subtitleText");
          if (ta) { ta.value = text; toast("已粘贴字幕文本,点「加载并逐句翻译」", "done"); }
        }
      });
      // 点击 dropzone:label 已原生关联 input,手机/电脑点击直接打开文件选择器,无需 JS
    }
    // 视频链接分析按钮
    const vCheck = $("videoUrlCheck");
    if (vCheck) vCheck.addEventListener("click", () => {
      const url = $("videoUrl").value.trim();
      const st = $("videoUrlStatus");
      if (!url) { st.innerHTML = `<span style="color:var(--warn)">请先粘贴视频链接</span>`; return; }
      let hint = "";
      if (/youtube\.com|youtu\.be/i.test(url)) {
        hint = `YouTube 视频链接。<br><b>推荐操作:</b>在 YouTube 页面 → 下方「⋯」更多 → 打开字幕 → 复制字幕文字 → 切到「粘贴字幕」tab 粘贴。<br>或用 <code style="background:var(--bg-soft);padding:1px 4px;border-radius:4px">youtubetranscript.com</code> 等工具导出 .srt 后用「选择文件」上传。`;
      } else if (/bilibili\.com|b23\.tv/i.test(url)) {
        hint = `Bilibili 视频链接。<br><b>推荐操作:</b>在 B 站视频页 → CC 字幕按钮(若有)→ 字幕菜单点「导出」或复制文字 → 切到「粘贴字幕」tab 粘贴。<br>若没有 CC 字幕,请自行录屏或下载视频 → 用「选择文件」上传 → AI 转写。`;
      } else {
        hint = `其他平台链接。建议直接在平台打开字幕复制文字,或下载视频文件后用「选择文件」上传 → AI 转写。`;
      }
      st.innerHTML = `<span style="color:var(--text-sub)">${hint}</span>`;
    });
    $("subSearch").addEventListener("input", filterSubtitles);
    $("showWordbook").addEventListener("click", showWordbook);
    $("backToSubtitle").addEventListener("click", backToSubtitle);

    // 帮助弹层
    $("engHelpBtn").addEventListener("click", () => $("engHelpModal").classList.add("show"));
    $("engHelpClose").addEventListener("click", () => $("engHelpModal").classList.remove("show"));
    $("engHelpModal").addEventListener("click", (e) => {
      if (e.target.id === "engHelpModal") $("engHelpModal").classList.remove("show");
    });

    renderWordCount();
    renderSubtitles();
  }

  /* 字幕解析 */
  function parseSRT(text) {
    // 去除 BOM
    text = text.replace(/^\uFEFF/, "");
    const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
    const out = [];
    blocks.forEach((blk) => {
      const lines = blk.split("\n").filter((l) => l.trim());
      // 跳过序号行、时间轴行
      const texts = lines.filter((l) => !/^\d+$/.test(l) && !/^\d{2}:\d{2}/.test(l));
      const joined = texts.join(" ").replace(/<[^>]+>/g, "").trim();
      if (joined) out.push(joined);
    });
    return out;
  }
  function parseVTT(text) {
    text = text.replace(/^\uFEFF/, "").replace(/^WEBVTT.*\n/i, "");
    return parseSRT(text);
  }
  function parsePlainText(text) {
    return text.replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  function onSubtitleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isAV = /\.(mp3|wav|m4a|ogg|flac|aac|webm|mp4|mov)$/i.test(name);
    if (isAV) {
      transcribeAVFile(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      let lines;
      if (name.endsWith(".srt")) lines = parseSRT(text);
      else if (name.endsWith(".vtt")) lines = parseVTT(text);
      else lines = parsePlainText(text);
      $("subtitleText").value = lines.join("\n");
      // 切回粘贴视图便于查看
      document.querySelector('.eng-tab[data-src="text"]').click();
      toast(`已解析 ${lines.length} 句字幕,点击「加载并逐句翻译」`);
    };
    reader.readAsText(file);
  }

  // 音视频文件 AI 转写为字幕
  async function transcribeAVFile(file) {
    const statusEl = $("avTranscribeStatus");
    const cfg = getAIConfig();
    const key = cfg.apiKey && cfg.apiKey.trim();
    if (!key) {
      statusEl.innerHTML = `<span style="color:var(--danger)">❌ 未配置 AI,无法转写音视频。请在「复盘分析 → AI 配置」中填入支持音频转写的 API Key(如 OpenAI Whisper)。</span>`;
      toast("请先在设置中配置 AI");
      return;
    }
    // 文件大小限制(25MB,与 OpenAI 一致)
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > 25) {
      statusEl.innerHTML = `<span style="color:var(--danger)">❌ 文件过大(${sizeMB.toFixed(1)}MB),AI 转写上限 25MB。请裁剪或压缩后再上传,或改用音频文件。</span>`;
      toast("文件过大,请压缩到 25MB 以内");
      return;
    }
    statusEl.innerHTML = `<span style="color:var(--primary)">🎙 正在用 AI 转写字幕(${sizeMB.toFixed(1)}MB)…这可能需要几十秒,请稍候</span>`;
    toast("AI 转写中,请稍候…");
    try {
      const text = await callAITranscribe(file);
      if (!text || !text.trim()) {
        statusEl.innerHTML = `<span style="color:var(--danger)">❌ 转写结果为空,该文件可能无音轨或 AI 不支持此格式。</span>`;
        return;
      }
      // 按句切分
      const lines = parsePlainText(text).filter((l) => l.length > 0);
      $("subtitleText").value = lines.join("\n");
      document.querySelector('.eng-tab[data-src="text"]').click();
      statusEl.innerHTML = `<span style="color:var(--done)">✅ AI 转写完成,共 ${lines.length} 句,点击「加载并逐句翻译」</span>`;
      toast(`AI 转写完成,共 ${lines.length} 句字幕`);
    } catch (err) {
      statusEl.innerHTML = `<span style="color:var(--danger)">❌ 转写失败:${escapeHtml(err.message)}<br><span class="muted">提示:确认 API 支持音频转写(Whisper),且 Base URL 指向兼容 /audio/transcriptions 的服务。</span></span>`;
      toast("AI 转写失败:" + err.message);
    }
  }

  // 调用 AI 音频转写(OpenAI 兼容 /audio/transcriptions)
  async function callAITranscribe(file) {
    const cfg = getAIConfig();
    const key = cfg.apiKey && cfg.apiKey.trim();
    const base = (cfg.baseUrl && cfg.baseUrl.trim()) || "https://api.openai.com/v1";
    const model = (cfg.audioModel && cfg.audioModel.trim()) || "whisper-1";
    const form = new FormData();
    form.append("file", file);
    form.append("model", model);
    form.append("response_format", "text");
    const r = await fetch(base.replace(/\/$/, "") + "/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key },
      body: form,
    });
    if (!r.ok) {
      const errBody = await r.text().catch(() => "");
      throw new Error("AI 转写 HTTP " + r.status + ": " + errBody.slice(0, 200));
    }
    // response_format=text 时返回纯文本
    const txt = await r.text();
    try {
      // 某些服务仍返回 JSON
      const j = JSON.parse(txt);
      return j.text || j.transcript || "";
    } catch {
      return txt;
    }
  }

  function loadAndTranslate() {
    if (state.english.translating) { toast("正在翻译中,请稍候"); return; }
    let lines = [];
    const mode = state.english.srcMode;
    if (mode === "text") {
      lines = parsePlainText($("subtitleText").value);
    } else if (mode === "url") {
      const url = $("videoUrl").value.trim();
      if (url) {
        toast("⚠ 受跨域限制无法直接抓取视频字幕,请改用粘贴字幕或上传字幕文件");
      }
      return;
    } else {
      lines = parsePlainText($("subtitleText").value);
    }
    lines = lines.filter((l) => l.length > 0);
    if (!lines.length) { toast("请先输入或上传字幕内容"); return; }
    if (lines.length > 80) {
      if (!confirm(`共 ${lines.length} 句,翻译可能较慢(每句约 0.6s),是否继续?`)) return;
    }

    // 构建字幕对象
    state.english.subtitles = lines.map((en) => ({
      id: uid(), en, zh: "", status: "pending", src: en,
    }));
    renderSubtitles();
    $("subInfo").textContent = `共 ${lines.length} 句,开始翻译…`;
    translateAll();
  }

  async function translateAll() {
    const subs = state.english.subtitles;
    state.english.translating = true;
    $("engProgress").style.display = "flex";
    $("loadSubBtn").disabled = true;

    const total = subs.length;
    for (let i = 0; i < total; i++) {
      const s = subs[i];
      if (s.status === "done") continue;
      s.status = "translating";
      renderSubtitleItem(i);
      try {
        const zh = await translateText(s.en);
        s.zh = zh;
        s.status = "done";
      } catch (err) {
        s.zh = "翻译失败:" + (err.message || "未知错误");
        s.status = "error";
      }
      renderSubtitleItem(i);
      updateProgress(i + 1, total);
      // 限流
      if (i < total - 1) await sleep(550);
    }
    state.english.translating = false;
    $("loadSubBtn").disabled = false;
    $("engProgress").style.display = "none";
    $("subInfo").textContent = `共 ${total} 句,翻译完成`;
    toast("翻译完成");
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function translateText(text) {
    // 统一走 freeTranslate:MyMemory 在线 + TECH_DICT 短语级离线兜底
    // (比逐词 offlineTranslate 更自然,保留句子结构)
    const r = await freeTranslate(text, "en", "zh-CN");
    if (r) return r;
    // 最终兜底:逐词离线词典
    return offlineTranslate(text);
  }

  /* 离线基础英汉词典(常见词),用于网络不可用时的兜底 */
  const OFFLINE_DICT = {
    hello:"你好",hi:"嗨",world:"世界",how:"怎样",are:"是",you:"你",today:"今天",
    i:"我",am:"是",learning:"学习",english:"英语",this:"这",is:"是",a:"一个",test:"测试",
    good:"好的",morning:"早上",afternoon:"下午",evening:"晚上",night:"夜晚",
    thank:"谢谢",please:"请",yes:"是",no:"不",ok:"好的",fine:"很好",
    love:"爱",like:"喜欢",want:"想要",need:"需要",have:"有",has:"有",had:"有",
    go:"去",come:"来",see:"看见",look:"看",hear:"听见",know:"知道",think:"思考",
    time:"时间",day:"天",week:"周",month:"月",year:"年",now:"现在",then:"那时",
    book:"书",read:"读",write:"写",learn:"学习",study:"学习",work:"工作",play:"玩",
    food:"食物",eat:"吃",drink:"喝",water:"水",tea:"茶",coffee:"咖啡",
    friend:"朋友",family:"家庭",home:"家",school:"学校",teacher:"老师",student:"学生",
    happy:"快乐",sad:"悲伤",big:"大",small:"小",new:"新",old:"旧",good2:"好",
    the:"这个",and:"和",or:"或",but:"但",because:"因为",if:"如果",when:"当",
    what:"什么",where:"哪里",who:"谁",why:"为什么",which:"哪个",
    my:"我的",your:"你的",his:"他的",her:"她的",our:"我们的",their:"他们的",
    we:"我们",they:"他们",he:"他",she:"她",it:"它",
    do:"做",does:"做",did:"做",can:"能",will:"将",would:"会",should:"应该",
    get:"得到",make:"制作",take:"拿",give:"给",find:"找到",use:"使用",try:"尝试",
    help:"帮助",ask:"问",tell:"告诉",say:"说",talk:"谈话",speak:"说",
    man:"男人",woman:"女人",boy:"男孩",girl:"女孩",child:"孩子",people:"人们",
    city:"城市",country:"国家",road:"路",car:"车",bus:"公交车",train:"火车",plane:"飞机",
    money:"钱",price:"价格",buy:"买",sell:"卖",shop:"商店",
    music:"音乐",song:"歌曲",movie:"电影",game:"游戏",sport:"运动",
    run:"跑",walk:"走",jump:"跳",swim:"游泳",dance:"跳舞",sing:"唱歌",
    open:"打开",close:"关闭",start:"开始",stop:"停止",end:"结束",begin:"开始",
    one:"一",two:"二",three:"三",four:"四",five:"五",six:"六",seven:"七",eight:"八",nine:"九",ten:"十",
    first:"第一",last:"最后",next:"下一个",here:"这里",there:"那里",
    very:"非常",much:"很多",many:"许多",some:"一些",any:"任何",all:"所有",
    beautiful:"美丽",great:"伟大",wonderful:"精彩",nice:"美好",cool:"酷",
    sorry:"抱歉",welcome:"欢迎",bye:"再见",goodbye:"再见",
    question:"问题",answer:"答案",problem:"问题",idea:"想法",way:"方法",
    life:"生活",world2:"世界",story:"故事",word:"单词",sentence:"句子",language:"语言",
    computer:"电脑",phone:"电话",internet:"互联网",video:"视频",picture:"图片",
  };
  function offlineTranslate(text) {
    if (!text) return "";
    // 逐词翻译,保留标点空格,未知词保留原文
    const tokens = text.split(/(\s+|[.,!?;:'"()])/);
    const out = tokens.map((tok) => {
      const lower = tok.toLowerCase().replace(/^'+|'+$/g, "");
      if (!lower || !/^[a-z]+$/.test(lower)) return tok;
      if (OFFLINE_DICT[lower]) return OFFLINE_DICT[lower];
      // 单数化尝试
      let stem = lower;
      if (stem.endsWith("s") && OFFLINE_DICT[stem.slice(0, -1)]) return OFFLINE_DICT[stem.slice(0, -1)];
      if (stem.endsWith("ing") && OFFLINE_DICT[stem.slice(0, -3)]) return OFFLINE_DICT[stem.slice(0, -3)];
      if (stem.endsWith("ed") && OFFLINE_DICT[stem.slice(0, -2)]) return OFFLINE_DICT[stem.slice(0, -2)];
      return tok; // 未知词保留原文
    });
    let result = out.join("");
    // 标点前不加空格
    result = result.replace(/\s+([.,!?;:'"()])/g, "$1");
    return result || "[离线翻译:无匹配,建议联网使用在线翻译]";
  }

  function updateProgress(done, total) {
    const pct = Math.round((done / total) * 100);
    $("engProgressFill").style.width = pct + "%";
    $("engProgressText").textContent = `翻译进度 ${done}/${total} (${pct}%)`;
  }

  function renderSubtitles() {
    const wrap = $("subtitleList");
    const subs = state.english.subtitles;
    if (!subs.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🌐</div><p>还没有字幕内容</p><span>粘贴、上传或导入字幕开始学习</span></div>`;
      return;
    }
    wrap.innerHTML = "";
    subs.forEach((s, i) => wrap.appendChild(buildSubItem(s, i)));
  }

  function buildSubItem(s, i) {
    const el = document.createElement("div");
    el.className = "sub-item";
    el.dataset.index = i;
    el.dataset.en = s.en.toLowerCase();
    el.innerHTML = `
      <div class="sub-en"></div>
      <div class="sub-zh ${s.status === "translating" ? "loading" : s.status === "error" ? "error" : ""}"></div>
      <div class="sub-meta">第 ${i + 1} 句 · ${statusLabel(s.status)}</div>
    `;
    // 英文做成可点单词
    el.querySelector(".sub-en").innerHTML = wordsToHtml(s.en);
    el.querySelector(".sub-zh").textContent =
      s.status === "pending" ? "等待翻译…" :
      s.status === "translating" ? "翻译中…" :
      s.zh;
    // 单词点击加入生词本(传入元素本身做弹动高亮,不重渲染整列)
    el.querySelectorAll(".word").forEach((w) => {
      w.addEventListener("click", () => toggleWord(w.textContent.trim(), s.en, w));
    });
    return el;
  }

  function statusLabel(st) {
    return { pending: "待翻译", translating: "翻译中", done: "已翻译", error: "翻译失败" }[st] || st;
  }

  function wordsToHtml(en) {
    // 拆分单词,保留标点和空格
    return escapeHtml(en).replace(/[A-Za-z']+/g, (m) => {
      const inBook = state.data.words.some((w) => w.word.toLowerCase() === m.toLowerCase());
      return `<span class="word${inBook ? " in-book" : ""}">${m}</span>`;
    });
  }

  function renderSubtitleItem(i) {
    const wrap = $("subtitleList");
    const old = wrap.children[i];
    if (!old) return;
    const s = state.english.subtitles[i];
    const fresh = buildSubItem(s, i);
    // 保留 hidden 状态(搜索过滤)
    if (old.classList.contains("hidden")) fresh.classList.add("hidden");
    wrap.replaceChild(fresh, old);
  }

  function filterSubtitles() {
    const q = $("subSearch").value.trim().toLowerCase();
    const items = $("subtitleList").querySelectorAll(".sub-item");
    items.forEach((it) => {
      if (!q) { it.classList.remove("hidden"); return; }
      const en = it.dataset.en || "";
      const zh = (state.english.subtitles[parseInt(it.dataset.index, 10)] || {}).zh || "";
      it.classList.toggle("hidden", !(en.includes(q) || zh.toLowerCase().includes(q)));
    });
  }

  function clearSubtitles() {
    if (state.english.translating) { toast("翻译进行中,无法清空"); return; }
    if (!state.english.subtitles.length) { $("subtitleText").value = ""; return; }
    if (!confirm("确定清空当前字幕内容?")) return;
    state.english.subtitles = [];
    $("subtitleText").value = "";
    $("subInfo").textContent = "";
    $("engProgress").style.display = "none";
    renderSubtitles();
    toast("已清空");
  }

  /* 生词本 */
  function toggleWord(word, fromSentence, el) {
    word = word.replace(/^'+|'+$/g, "");
    if (!word) return;
    const list = state.data.words;
    const idx = list.findIndex((w) => w.word.toLowerCase() === word.toLowerCase());
    if (idx >= 0) {
      list.splice(idx, 1);
      toast(`已从生词本移除「${word}」`, "warn");
      if (el) { el.classList.remove("word-pop", "in-book"); void el.offsetWidth; el.classList.add("word-pop"); }
    } else {
      list.push({
        word,
        from: fromSentence,
        trans: "",
        addedAt: Date.now(),
      });
      toast(`已加入生词本「${word}」`, "done");
      if (el) { el.classList.add("word-pop", "in-book"); void el.offsetWidth; el.classList.remove("word-pop"); el.classList.add("word-pop"); }
      fetchWordTrans(word);
    }
    saveData();
    renderWordCount();
  }

  async function fetchWordTrans(word) {
    let trans = "";
    try {
      const url = "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(word) + "&langpair=en|zh-CN";
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        const t = data && data.responseData && data.responseData.translatedText;
        if (t && !/MYMEMORY WARNING|QUOTA/i.test(t)) trans = t;
      }
    } catch {}
    // 在线失败 → 离线词典兜底
    if (!trans) {
      const lower = word.toLowerCase().replace(/^'+|'+$/g, "");
      if (OFFLINE_DICT[lower]) trans = OFFLINE_DICT[lower];
      else if (lower.endsWith("s") && OFFLINE_DICT[lower.slice(0, -1)]) trans = OFFLINE_DICT[lower.slice(0, -1)];
      else if (lower.endsWith("ing") && OFFLINE_DICT[lower.slice(0, -3)]) trans = OFFLINE_DICT[lower.slice(0, -3)];
      else trans = "(暂无释义,联网后可自动获取)";
    }
    const w = state.data.words.find((x) => x.word === word);
    if (w) { w.trans = trans; saveData(); renderWordbook(); }
  }

  function renderWordCount() {
    $("wordCount").textContent = state.data.words.length;
  }

  function showWordbook() {
    $("subtitleList").style.display = "none";
    $("wordbook").style.display = "flex";
    $("backToSubtitle").style.display = "inline-block";
    $("showWordbook").style.display = "none";
    renderWordbook();
  }
  function backToSubtitle() {
    $("wordbook").style.display = "none";
    $("subtitleList").style.display = "flex";
    $("backToSubtitle").style.display = "none";
    $("showWordbook").style.display = "inline-block";
  }

  function renderWordbook() {
    const wrap = $("wordbook");
    const list = state.data.words;
    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📓</div><p>生词本为空</p><span>在字幕中点击单词即可收藏</span></div>`;
      return;
    }
    wrap.innerHTML = "";
    [...list].reverse().forEach((w) => {
      const el = document.createElement("div");
      el.className = "wb-item";
      el.innerHTML = `
        <div class="wb-main">
          <div><span class="wb-word"></span></div>
          <div class="wb-trans">${w.trans ? escapeHtml(w.trans) : '<span class="muted">释义加载中…</span>'}</div>
          <div class="wb-from">出处:${escapeHtml(w.from || "")}</div>
        </div>
        <div class="wb-actions">
          <button class="icon-btn btn-speak" title="朗读">🔊</button>
          <button class="icon-btn btn-del-w" title="删除">🗑</button>
        </div>
      `;
      el.querySelector(".wb-word").textContent = w.word;
      el.querySelector(".btn-speak").addEventListener("click", () => speak(w.word));
      el.querySelector(".btn-del-w").addEventListener("click", () => {
        state.data.words = state.data.words.filter((x) => x.word !== w.word);
        saveData();
        renderWordCount();
        renderWordbook();
        renderSubtitles();
      });
      wrap.appendChild(el);
    });
  }

  /* ============ 语音播报(TTS)统一引擎 ============
   * 双模式:本地 speechSynthesis + 在线 TTS(Google Translate)兜底
   * 沙箱/Linux 服务器通常没装 TTS 引擎,本地 voices=0 会报 synthesis-failed,
   * 这时自动切到在线 TTS,通过 <audio> 元素播放 MP3 流(无 CORS 限制)。
   */
  const TTS = {
    ready: false,
    voices: [],
    current: null,         // 当前 SpeechSynthesisUtterance 或 audio 元素
    mode: "auto",          // "auto" | "local" | "online"
    _paused: false,
    _audioEl: null,        // 在线模式用的 audio 元素
    _cancelFlag: false,
    onState: null,
    loadVoices() {
      const load = () => {
        this.voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
        this.ready = true;
      };
      if (!window.speechSynthesis) return;
      load();
      speechSynthesis.onvoiceschanged = () => load();
    },
    pickVoice(lang) {
      if (!this.ready) this.loadVoices();
      const l = (lang || "en-US").toLowerCase();
      const all = this.voices || [];
      let v = all.find((x) => (x.lang || "").toLowerCase() === l);
      if (v) return v;
      const pref = l.split("-")[0];
      v = all.find((x) => (x.lang || "").toLowerCase().startsWith(pref));
      if (v) return v;
      return all.find((x) => x.default) || all[0] || null;
    },
    // 探测本地 TTS 是否真的能用(voices 列表 + 一次 speak 测试)
    probeLocal() {
      return new Promise((resolve) => {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return resolve(false);
        const voices = window.speechSynthesis.getVoices() || [];
        if (!voices.length) return resolve(false);
        // 试着 speak 一段极短文本看是否触发 onstart/onend
        let done = false;
        const finish = (ok) => { if (done) return; done = true; try { window.speechSynthesis.cancel(); } catch {} resolve(ok); };
        try {
          const u = new SpeechSynthesisUtterance(" ");
          u.lang = "en-US";
          u.volume = 0;
          u.onstart = () => finish(true);
          u.onend = () => finish(true);
          u.onerror = () => finish(false);
          window.speechSynthesis.speak(u);
          setTimeout(() => finish(false), 800);
        } catch { resolve(false); }
      });
    },
    // 启动时自动决定模式
    async init() {
      this.loadVoices();
      // 等 voices 异步加载(部分浏览器要等 200ms)
      if (window.speechSynthesis && !this.voices.length) {
        await new Promise((r) => setTimeout(r, 250));
        this.voices = window.speechSynthesis.getVoices() || [];
      }
      if (this.mode === "online") return; // 用户强制在线
      const ok = await this.probeLocal();
      this.mode = ok ? "local" : "online";
      console.log("[TTS] mode =", this.mode, "voices =", this.voices.length);
    },
    speak(text, lang, opts) {
      opts = opts || {};
      const txt = (text || "").trim();
      if (!txt) { if (opts.onend) opts.onend(); return null; }
      // 在线模式(或本地 voices 为 0)
      if (this.mode === "online" || (this.mode === "auto" && !this.voices.length)) {
        return this._speakOnline(txt, lang, opts);
      }
      return this._speakLocal(txt, lang, opts);
    },
    _speakLocal(text, lang, opts) {
      if (!window.speechSynthesis) { if (opts.onerror) opts.onerror({ error: "no-speech-synthesis" }); return null; }
      if (opts.cancel) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || "en-US";
      u.rate = opts.rate != null ? opts.rate : (lang && lang.toLowerCase().startsWith("zh") ? 0.98 : 0.95);
      u.pitch = opts.pitch || 1;
      u.volume = opts.volume != null ? opts.volume : 1;
      const v = this.pickVoice(lang);
      if (v) u.voice = v;
      if (opts.onstart) u.onstart = opts.onstart;
      if (opts.onend) u.onend = opts.onend;
      if (opts.onerror) u.onerror = opts.onerror;
      if (opts.onboundary) u.onboundary = opts.onboundary;
      this.current = u;
      this._paused = false;
      speechSynthesis.speak(u);
      return u;
    },
    _speakOnline(text, lang, opts) {
      this._stopAudio();
      const l = (lang || "en-US");
      const pref = l.toLowerCase().split("-")[0];
      const isZh = pref === "zh";
      // 在线 TTS 端点列表(按优先级尝试)
      const endpoints = [
        {
          name: "baidu",
          // 百度翻译 TTS:zh 中文,en 英文
          build: (chunk) => "https://fanyi.baidu.com/gettts?lan=" + (isZh ? "zh" : "en") +
                            "&text=" + encodeURIComponent(chunk) + "&spd=3&source=web",
          maxLen: 180,
        },
        {
          name: "youdao",
          // 有道 TTS:lang=zh 中文,lang=en 英文(用 https 避免混合内容拦截)
          build: (chunk) => "https://tts.youdao.com/tts?lang=" + (isZh ? "zh" : "en") +
                            "&img=false&audio=true&text=" + encodeURIComponent(chunk),
          maxLen: 200,
        },
        {
          name: "google",
          build: (chunk) => "https://translate.google.com/translate_tts?ie=UTF-8&q=" + encodeURIComponent(chunk) +
                            "&tl=" + (isZh ? "zh-CN" : "en-US") + "&client=tw-ob",
          maxLen: 180,
        },
      ];
      let epIdx = 0;
      const tryEndpoint = () => {
        if (epIdx >= endpoints.length) {
          // 所有端点都失败
          toast("在线 TTS 暂时不可用(网络受限),可稍后重试", "warn");
          this._audioEl = null;
          if (opts.onerror) opts.onerror({ error: "all-endpoints-failed" });
          if (opts.onend) opts.onend();
          return;
        }
        const ep = endpoints[epIdx];
        const chunks = this._splitText(text, ep.maxLen);
        let chunkIdx = 0;
        let firstChunkFailed = false;
        const playNextChunk = () => {
          if (chunkIdx >= chunks.length) {
            this._audioEl = null;
            if (opts.onend) opts.onend();
            return;
          }
          if (this._cancelFlag) { this._audioEl = null; return; }
          const chunk = chunks[chunkIdx];
          const url = ep.build(chunk);
          const audio = new Audio();
          audio.src = url;
          audio.preload = "auto";
          this._audioEl = audio;
          if (chunkIdx === 0 && opts.onstart) audio.addEventListener("playing", opts.onstart, { once: true });
          audio.addEventListener("ended", () => { chunkIdx++; firstChunkFailed = false; playNextChunk(); });
          audio.addEventListener("error", (e) => {
            console.warn("[TTS-online] " + ep.name + " chunk " + chunkIdx + " error", e);
            if (chunkIdx === 0 && !firstChunkFailed) {
              // 第一段失败 → 整个端点可能不可用,换下一个端点
              firstChunkFailed = true;
              epIdx++;
              setTimeout(tryEndpoint, 100);
              return;
            }
            // 中间段失败 → 跳过继续
            chunkIdx++;
            setTimeout(playNextChunk, 100);
          });
          const playPromise = audio.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch((err) => {
              console.warn("[TTS-online] " + ep.name + " play() rejected:", err && err.name);
              if (err && err.name === "NotAllowedError") {
                toast("浏览器拦截了自动播放,请点页面任意位置后重试", "warn");
                this._audioEl = null;
                if (opts.onerror) opts.onerror({ error: "autoplay-blocked" });
                if (opts.onend) opts.onend();
              } else if (chunkIdx === 0 && !firstChunkFailed) {
                firstChunkFailed = true;
                epIdx++;
                setTimeout(tryEndpoint, 100);
              } else {
                chunkIdx++;
                setTimeout(playNextChunk, 100);
              }
            });
          }
        };
        this._cancelFlag = false;
        playNextChunk();
      };
      tryEndpoint();
      return this._audioEl;
    },
    // 把长文本按句号/逗号切分成不超过 maxLen 的片段
    _splitText(text, maxLen) {
      if (!text) return [];
      if (text.length <= maxLen) return [text];
      const result = [];
      // 先按句号、问号、感叹号、换行切
      const sentences = text.split(/(?<=[。.!!??\n])/);
      let cur = "";
      for (const s of sentences) {
        if ((cur + s).length > maxLen) {
          if (cur) result.push(cur);
          // 单句超长,按逗号再切
          if (s.length > maxLen) {
            const parts = s.split(/(?<=[,，;；])/);
            let c2 = "";
            for (const p of parts) {
              if ((c2 + p).length > maxLen) {
                if (c2) result.push(c2);
                // 还是超长,硬切
                if (p.length > maxLen) {
                  for (let i = 0; i < p.length; i += maxLen) result.push(p.slice(i, i + maxLen));
                  c2 = "";
                } else { c2 = p; }
              } else { c2 += p; }
            }
            if (c2) result.push(c2);
            cur = "";
          } else { cur = s; }
        } else { cur += s; }
      }
      if (cur) result.push(cur);
      return result;
    },
    _stopAudio() {
      this._cancelFlag = true;
      if (this._audioEl) {
        try { this._audioEl.pause(); this._audioEl.src = ""; this._audioEl.load(); } catch {}
        this._audioEl = null;
      }
    },
    cancel() {
      if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch {} }
      this._stopAudio();
      this.current = null;
    },
    pause() {
      if (this._audioEl) { try { this._audioEl.pause(); this._paused = true; } catch {} }
      else if (window.speechSynthesis) { try { speechSynthesis.pause(); this._paused = true; } catch {} }
      if (this.onState) this.onState({ paused: true });
    },
    resume() {
      if (this._audioEl) { try { this._audioEl.play(); this._paused = false; } catch {} }
      else if (window.speechSynthesis) { try { speechSynthesis.resume(); this._paused = false; } catch {} }
      if (this.onState) this.onState({ paused: false });
    },
    get paused() { return this._paused; },
  };
  // 立刻预加载 + 自动探测模式
  TTS.loadVoices();
  TTS.init();
  // 兼容 speak 旧函数(其他模块仍在调用)
  function speak(text, lang) { TTS.speak(text, lang, { cancel: true }); }

  /* ============================================================
   * 模块系统:21 个模块(配置驱动 + 定制)
   * AI 调用统一走 callAI(),当前为离线规则占位,后续可接 OpenAI/Claude
   * ============================================================ */

  // 模块分组定义(顺序即导航顺序)
  const MODULE_GROUPS = [
    { name: "学习", items: [
      { id: "tasks", icon: "📋", label: "每日计划", type: "existing" },
      { id: "notes", icon: "📓", label: "智能笔记", type: "list" },
      { id: "flashcard", icon: "🃏", label: "闪卡填空", type: "custom" },
      { id: "vocab", icon: "📖", label: "背单词", type: "custom" },
      { id: "speaking", icon: "🗣️", label: "英语口语", type: "custom" },
      { id: "korean", icon: "🇰🇷", label: "韩语学习", type: "custom" },
      { id: "pharma", icon: "💊", label: "药学知识库", type: "list" },
      { id: "aitips", icon: "🤖", label: "AI 技巧库", type: "list" },
    ]},
    { name: "创作", items: [
      { id: "editing", icon: "🎬", label: "剪辑自媒体", type: "list" },
      { id: "inspiration", icon: "💡", label: "选题灵感库", type: "list" },
      { id: "contentreview", icon: "📊", label: "内容复盘", type: "list" },
    ]},
    { name: "生活", items: [
      { id: "memo", icon: "📝", label: "备忘录", type: "list" },
      { id: "photodiary", icon: "📷", label: "生活照片日记", type: "custom" },
      { id: "saving", icon: "💰", label: "存钱计划", type: "custom" },
      { id: "finance", icon: "🧾", label: "每日记账", type: "custom" },
      { id: "fitness", icon: "💪", label: "健身打卡", type: "list" },
      { id: "medialist", icon: "🎬", label: "影视书籍", type: "list" },
    ]},
    { name: "心灵", items: [
      { id: "meditation", icon: "🧘", label: "释放法冥想", type: "custom" },
      { id: "tarot", icon: "🔮", label: "塔罗占卜", type: "custom" },
    ]},
    { name: "信息", items: [
      { id: "news", icon: "🌍", label: "每日新闻播客", type: "custom" },
    ]},
    { name: "工具", items: [
      { id: "timer", icon: "⏱", label: "计时器", type: "existing" },
      { id: "countdown", icon: "📅", label: "日期倒计时", type: "existing" },
      { id: "english", icon: "🌐", label: "英语字幕学习", type: "existing" },
      { id: "review", icon: "📌", label: "每日复盘", type: "existing" },
    ]},
    { name: "系统", items: [
      { id: "settings", icon: "⚙️", label: "设置", type: "custom" },
    ]},
  ];

  // 通用列表模块字段 schema
  const LIST_DEFS = {
    notes: { titleField: "title", bodyField: "content", sortBy: "updatedAt",
      fields: [
        { key: "title", label: "标题", type: "text" },
        { key: "folder", label: "文件夹", type: "select", options: ["默认","学习","工作","生活","药学","灵感"] },
        { key: "tags", label: "标签(逗号分隔)", type: "tags" },
        { key: "content", label: "内容(Markdown)", type: "textarea" },
      ]},
    pharma: { titleField: "title", bodyField: "content", sortBy: "updatedAt",
      fields: [
        { key: "title", label: "知识点标题", type: "text" },
        { key: "category", label: "分类", type: "select", options: ["药理学","药剂学","药物化学","药事管理","临床药学","中药学"] },
        { key: "source", label: "来源", type: "text" },
        { key: "content", label: "内容", type: "textarea" },
      ]},
    aitips: { titleField: "title", bodyField: "content", sortBy: "updatedAt",
      fields: [
        { key: "title", label: "标题", type: "text" },
        { key: "category", label: "分类", type: "select", options: ["工具技巧","Prompt指令","AI创作","AI办公效率"] },
        { key: "link", label: "链接(可选)", type: "text" },
        { key: "content", label: "内容", type: "textarea" },
      ]},
    editing: { titleField: "title", bodyField: "content", sortBy: "createdAt",
      fields: [
        { key: "title", label: "标题", type: "text" },
        { key: "kind", label: "类型", type: "select", options: ["练习","作品","教程收藏","素材"] },
        { key: "duration", label: "时长(min)", type: "number" },
        { key: "platform", label: "平台", type: "select", options: ["—","抖音","B站","YouTube","小红书","其他"] },
        { key: "content", label: "说明", type: "textarea" },
      ]},
    inspiration: { titleField: "title", bodyField: "content", sortBy: "createdAt",
      fields: [
        { key: "title", label: "选题", type: "text" },
        { key: "category", label: "分类", type: "select", options: ["干货","颜值","日常","吐槽","好物"] },
        { key: "heat", label: "热度", type: "select", options: ["高","中","低"] },
        { key: "content", label: "脚本/思路", type: "textarea" },
      ]},
    contentreview: { titleField: "title", bodyField: "notes", sortBy: "createdAt",
      fields: [
        { key: "title", label: "作品标题", type: "text" },
        { key: "platform", label: "平台", type: "select", options: ["抖音","B站","YouTube","小红书","其他"] },
        { key: "plays", label: "播放量", type: "number" },
        { key: "likes", label: "点赞", type: "number" },
        { key: "comments", label: "评论", type: "number" },
        { key: "notes", label: "优缺点/优化", type: "textarea" },
      ]},
    memo: { titleField: "title", bodyField: "content", sortBy: "pinned", pinned: true,
      fields: [
        { key: "title", label: "标题", type: "text" },
        { key: "category", label: "分类", type: "select", options: ["待办琐事","购物清单","重要联系人","账号密码","其他"] },
        { key: "pinned", label: "置顶", type: "checkbox" },
        { key: "remind", label: "提醒日期", type: "date" },
        { key: "content", label: "内容", type: "textarea" },
      ]},
    fitness: { titleField: "title", bodyField: "content", sortBy: "date",
      fields: [
        { key: "title", label: "项目", type: "text" },
        { key: "date", label: "日期", type: "date", default: "today" },
        { key: "kind", label: "类型", type: "select", options: ["有氧","力量","拉伸","瑜伽"] },
        { key: "duration", label: "时长(min)", type: "number" },
        { key: "weight", label: "体重(kg)", type: "number" },
        { key: "content", label: "备注", type: "textarea" },
      ]},
    medialist: { titleField: "title", bodyField: "content", sortBy: "updatedAt",
      fields: [
        { key: "title", label: "名称", type: "text" },
        { key: "kind", label: "类型", type: "select", options: ["电影","剧集","书籍","纪录片"] },
        { key: "status", label: "状态", type: "select", options: ["想看","在看","已看完"] },
        { key: "rating", label: "评分(1-10)", type: "number" },
        { key: "content", label: "感受/书评", type: "textarea" },
      ]},
  };

  // 模块数据存取(统一放 modules[id])
  function getMod(id) {
    if (!state.data.modules) state.data.modules = {};
    if (!state.data.modules[id]) state.data.modules[id] = [];
    return state.data.modules[id];
  }
  function setMod(id, arr) { state.data.modules[id] = arr; saveData(); }

  /* ---------- 导航生成 ---------- */
  function buildNav() {
    const wrap = $("navContainer");
    let html = "";
    MODULE_GROUPS.forEach((g) => {
      html += `<div class="nav-group"><div class="nav-group-label">${g.name}</div><div class="nav-group-items">`;
      g.items.forEach((it) => {
        const active = it.id === "tasks" ? " active" : "";
        html += `<button class="nav-item${active}" data-tab="${it.id}" title="${it.label}">
          <span class="nav-icon">${it.icon}</span><span class="nav-label">${it.label}</span></button>`;
      });
      html += `</div></div>`;
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
    // 折叠
    $("navCollapseBtn").addEventListener("click", () => {
      const sb = document.querySelector(".sidebar");
      sb.classList.toggle("collapsed");
      $("navCollapseBtn").textContent = sb.classList.contains("collapsed") ? "›" : "‹ 收起";
    });
  }

  /* ---------- 模块面板生成(定制模块在此挂载) ---------- */
  const MODULE_RENDER = {}; // id -> render fn
  function buildPanels() {
    const cont = $("dynamicPanels");
    let html = "";
    MODULE_GROUPS.forEach((g) => {
      g.items.forEach((it) => {
        if (it.type === "existing") return; // 已有 HTML 面板
        html += `<section class="panel" id="panel-${it.id}">
          <header class="panel-header"><div>
            <h1 class="panel-title">${it.icon} ${it.label}</h1>
            <p class="panel-desc" id="desc-${it.id}"></p>
          </div></header>
          <div id="mod-${it.id}"></div>
        </section>`;
      });
    });
    cont.innerHTML = html;
    // 初始化各定制模块
    initFlashcard(); initVocab(); initSpeaking(); initKorean();
    initPhotoDiary(); initMeditation(); initTarot(); initNews();
    initSaving(); initFinance(); initSettings();
    // 初始化列表模块
    Object.keys(LIST_DEFS).forEach(initListModule);
  }

  function renderModule(id) {
    if (MODULE_RENDER[id]) MODULE_RENDER[id]();
    else if (LIST_DEFS[id]) renderListModule(id);
  }

  /* ============================================================
   * AI 层:callAI(type, payload)
   * 若设置中配置了 API Key,则调用 OpenAI 兼容接口;否则使用离线规则兜底。
   * ============================================================ */
  const AI_KEY_STORE = "workbench_ai_config";

  function getAIConfig() {
    try { return JSON.parse(localStorage.getItem(AI_KEY_STORE)) || {}; }
    catch { return {}; }
  }
  function setAIConfig(cfg) { localStorage.setItem(AI_KEY_STORE, JSON.stringify(cfg || {})); }

  // 系统 prompt 映射,确保各功能输出格式稳定
  const AI_PROMPTS = {
    "tarot-reading": `你是精通塔罗牌意与东方黄历(干支、建除十二神、五行、冲煞、宜忌)的占卜师兼学习顾问。你必须将牌意、黄历、用户复盘数据三者深度融合,而非分别罗列。

请返回严格 JSON(不要 markdown 代码块),格式如下:
{
  "overall": "整体运势解读:将三张牌的牌意与当日黄历(干支/建除/五行/宜忌/冲煞)交织分析,点明今日能量主调,80-120字",
  "dimensions": {
    "career": "事业学业维度,结合牌意与黄历宜忌,50-80字",
    "love": "感情人际维度,40-60字",
    "health": "身心健康维度,结合五行与冲煞,40-60字"
  },
  "psyche": "用户当前心理状态分析:结合牌意(尤其逆位)、黄历建除神煞、以及复盘数据(任务完成率/情绪/冥想记录),判断用户是疲惫/焦虑/专注/散漫等状态及成因,80-120字",
  "learningState": "今日学习状态评估:综合牌意能量 + 黄历宜忌 + 心理状态,判断今日适合高强度还是低强度、适合输入还是输出,60-100字",
  "learningMode": "六选一: deep(深度阅读)|light(轻松复习)|create(创作输出)|practice(技能练习)|structure(结构化整理)|explore(探索新知)",
  "learningReason": "推荐理由:必须明确引用黄历宜忌和牌意作为依据,解释为什么这个模式最适合今天,80-120字",
  "actionPlan": "具体实操建议:3条可执行的行动项,每条结合黄历宜忌或牌意,格式为 '1. ... 2. ... 3. ...'",
  "caution": "今日注意事项:结合黄历忌项与逆位牌警示,40-60字"
}
语气神秘而温暖,用中文。`,
    "news-summary": `你是新闻编辑。将给定的多条新闻整理成一份双语播客稿:每条先英文原文一句话,再中文一句话摘要。开头加一句中文播报问候。整体不超过400字。`,
    "review-summary": `你是成长教练。基于用户当日全模块数据(任务完成率、闪卡复习、背单词、口语、冥想情绪、支出等),生成结构化成长评语:亮点、待改进、明日建议。中文,200字内。`,
    "speaking-feedback": `你是雅思口语考官。评估用户英文回答,给出发音/流利度/语法/词汇四项0-90分,并指出主要语法错误与改进建议。返回JSON:{"pronunciation":n,"fluency":n,"grammar":n,"vocabulary":n,"feedback":"..."}`,
    "flashcard-gen": `你是知识提取助手。从给定文本提取关键知识点生成闪卡,每张含q(问题)和a(答案),可选tag(标签)。返回JSON数组:[{"q":"...","a":"...","tag":"..."}],最多10张。`,
    "flashcard-blank": `你是填空题生成器。从给定文本中提取关键知识点,生成填空题。将关键术语或概念替换为 ____ 形成填空。必须返回严格JSON对象(不要markdown代码块),格式为:{"blanks":[{"q":"完整原句","a":"被挖空的答案","blankText":"包含____的填空文本"}]},最多10道。`,
    "inspiration-recommend": `你是自媒体选题顾问。基于用户账号定位与近期数据推荐3个潜力选题。返回JSON数组:[{"title":"","category":"","reason":""}]。`,
    "note-analysis": `你是知识管理助手兼学习顾问。分析用户的笔记内容,提供深度洞察。必须返回严格JSON(不要markdown代码块),格式如下:
{
  "summary": "笔记核心内容摘要,30-60字",
  "keywords": ["关键词1","关键词2","关键词3"],
  "structure": "结构化整理:将笔记内容重新组织为层次分明的要点,用换行分隔,100-200字",
  "insights": "AI洞察:指出笔记中的知识盲点、逻辑漏洞或可深入的方向,60-100字",
  "connections": "与其他知识的关联:建议如何与已有知识体系建立联系,40-80字",
  "actionItems": "基于笔记的3条可执行学习建议,格式 '1. ... 2. ... 3. ...'",
  "questions": "3个深入思考题,帮助巩固理解,格式 '1. ... 2. ... 3. ...'"
}
用中文。`,
    "photodiary-summary": `你是生活记录助手。基于用户今日照片日记的几条文字记录,生成一段温暖的生活小结:捕捉今日主题、情绪、值得纪念的瞬间。中文,80-150字。`,
    "korean-chat": `你是韩语老师。用户用中文或韩语提问,你用韩语回答(附中文翻译),并纠正用户的语法/用词错误。每轮回复格式:【韩语】... 【中文】... 【讲解】...`,
    "content-stats": `你是数据分析师。基于用户近期内容数据(播放/点赞/评论/优缺点)给出简短分析:哪种内容表现最好、改进方向。中文,150字内。`,
    "fitness-stats": `你是健身教练。基于用户近期打卡数据(项目/时长/体重)给出简短分析:训练规律、体重趋势、下一阶段建议。中文,150字内。`,
  };

  async function callAI(type, payload) {
    const cfg = getAIConfig();
    const key = cfg.apiKey && cfg.apiKey.trim();
    const base = (cfg.baseUrl && cfg.baseUrl.trim()) || "https://api.openai.com/v1";
    const model = (cfg.model && cfg.model.trim()) || "gpt-4o-mini";
    if (!key) return aiOffline(type, payload); // 无 key 走离线规则

    const sys = AI_PROMPTS[type] || "你是通用AI助手。";
    let user = "";
    try {
      if (type === "tarot-reading") {
        user = `牌阵:\n${(payload.cards||[]).map(c=>`【${c.pos}】${c.n}${c.rev?"(逆位)":""}:${c.m}`).join("\n")}\n黄历:${JSON.stringify(payload.almanac||{})}\n复盘数据:${JSON.stringify(payload.review||{})}`;
      } else if (type === "news-summary") {
        user = `新闻列表:\n${JSON.stringify(payload.items||[])}\n请整理成双语播客稿。`;
      } else if (type === "review-summary") {
        user = `当日数据:${JSON.stringify(payload.data||{})}\n日期:${payload.date||""}`;
      } else if (type === "speaking-feedback") {
        user = `话题:${payload.topic||""}\n回答:${payload.text||""}`;
      } else if (type === "flashcard-gen") {
        user = `文本:\n${payload.text||""}`;
      } else if (type === "flashcard-blank") {
        user = `文本:\n${payload.text||""}`;
      } else if (type === "inspiration-recommend") {
        user = `账号定位:${payload.profile||""}\n近期数据:${JSON.stringify(payload.stats||{})}`;
      } else if (type === "note-analysis") {
        user = `笔记标题:${payload.title||""}\n笔记内容:\n${payload.content||""}`;
      } else if (type === "photodiary-summary") {
        user = `今日照片日记记录:\n${JSON.stringify(payload.entries||[])}\n请生成温暖的生活小结。`;
      } else if (type === "korean-chat") {
        // payload.history: [{role:"user"|"assistant", text:""}]; payload.input: 本次输入
        const hist = (payload.history||[]).map((m)=>`${m.role==="user"?"用户":"老师"}:${m.text}`).join("\n");
        user = `${hist?hist+"\n":""}用户:${payload.input||""}`;
      } else if (type === "content-stats") {
        user = `近期内容数据:\n${JSON.stringify(payload.items||[])}\n请分析哪种内容表现最好及改进方向。`;
      } else if (type === "fitness-stats") {
        user = `近期健身打卡数据:\n${JSON.stringify(payload.items||[])}\n请分析训练规律、体重趋势及下阶段建议。`;
      } else {
        user = JSON.stringify(payload || {});
      }
      const needJson = ["speaking-feedback","flashcard-gen","flashcard-blank","inspiration-recommend","tarot-reading","note-analysis"].includes(type);
      const r = await fetch(base.replace(/\/$/,"") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({
          model,
          messages: [ { role: "system", content: sys }, { role: "user", content: user } ],
          temperature: 0.8,
          ...(needJson ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        throw new Error("AI HTTP " + r.status + ": " + errBody.slice(0, 200));
      }
      const j = await r.json();
      const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "";
      // 记录 token
      try {
        if (!state.data.aiUsage) state.data.aiUsage = { calls: 0, tokens: 0 };
        state.data.aiUsage.calls++;
        state.data.aiUsage.tokens += (j.usage && j.usage.total_tokens) || 0;
        saveData();
      } catch {}
      if (type === "speaking-feedback") {
        try { const o = JSON.parse(txt); return { pronunciation:+o.pronunciation||70, fluency:+o.fluency||70, grammar:+o.grammar||70, vocabulary:+o.vocabulary||70, feedback:o.feedback||"" }; }
        catch { return { pronunciation:70, fluency:70, grammar:70, vocabulary:70, feedback: txt.slice(0,200) }; }
      }
      if (type === "tarot-reading") {
        try {
          const o = JSON.parse(txt.replace(/```json|```/g, "").trim());
          return {
            overall: o.overall || "",
            dimensions: o.dimensions || {},
            psyche: o.psyche || "",
            learningState: o.learningState || "",
            learningMode: o.learningMode || "light",
            learningReason: o.learningReason || "",
            actionPlan: o.actionPlan || "",
            caution: o.caution || "",
            _ai: true,
          };
        } catch (e) {
          console.warn("[AI] 塔罗JSON解析失败,回退离线:", e.message);
          return aiOffline("tarot-reading", payload);
        }
      }
      if (type === "flashcard-gen") {
        try { const o = JSON.parse(txt); return Array.isArray(o)?o:(o.cards||o.items||[]); }
        catch { return aiOffline("flashcard-gen", payload); }
      }
      if (type === "flashcard-blank") {
        try { const o = JSON.parse(txt.replace(/```json|```/g, "").trim()); return Array.isArray(o)?o:(o.cards||o.items||o.blanks||[]); }
        catch { return aiOffline("flashcard-blank", payload); }
      }
      if (type === "inspiration-recommend") {
        try { const o = JSON.parse(txt); return Array.isArray(o)?o:(o.topics||o.recommendations||[]); }
        catch { return aiOffline("inspiration-recommend", payload); }
      }
      if (type === "note-analysis") {
        try {
          const o = JSON.parse(txt.replace(/```json|```/g, "").trim());
          return {
            summary: o.summary || "",
            keywords: o.keywords || [],
            structure: o.structure || "",
            insights: o.insights || "",
            connections: o.connections || "",
            actionItems: o.actionItems || "",
            questions: o.questions || "",
            _ai: true,
          };
        } catch (e) {
          console.warn("[AI] 笔记分析JSON解析失败,回退离线:", e.message);
          return aiOffline("note-analysis", payload);
        }
      }
      return txt || aiOffline(type, payload);
    } catch (e) {
      console.warn("[AI] 调用失败,回退离线:", e.message);
      toast("AI 调用失败:" + e.message.slice(0, 80) + " · 已回退离线");
      return aiOffline(type, payload);
    }
  }

  function aiOffline(type, p) {
    switch (type) {
      case "flashcard-gen": {
        // 从文本按句子切分生成简易闪卡
        const text = (p && p.text) || "";
        const sents = text.split(/[。.\n!?！？]/).map((s) => s.trim()).filter((s) => s.length > 4);
        return sents.slice(0, 10).map((s) => ({ q: s, a: "（待补充答案,AI 接入后自动生成）" }));
      }
      case "flashcard-blank": {
        const text = (p && p.text) || "";
        const sentences = text.split(/[。\n;；!！?？.]+/).map((s) => s.trim()).filter((s) => s.length > 8);
        return sentences.slice(0, 5).map((s) => {
          const words = s.split(/[\s,，、]+/).filter((w) => w.length > 1);
          const key = words[Math.floor(words.length / 2)] || "关键词";
          const blankText = s.replace(key, "____");
          return { q: s, a: key, blankText };
        });
      }
      case "tarot-reading": {
        return offlineTarotReading(p.cards || [], p.almanac || null, p.review || null);
      }
      case "speaking-feedback": {
        const text = (p && p.text) || "";
        const words = text.split(/\s+/).filter(Boolean).length;
        return {
          pronunciation: Math.min(90, 60 + words),
          fluency: Math.min(85, 55 + Math.floor(words / 2)),
          grammar: 70,
          vocabulary: Math.min(80, 50 + words),
          feedback: "（离线评估:基于文本长度估算。接入 AI 后将给出精准发音/语法评分与改进建议。）",
        };
      }
      case "inspiration-recommend": {
        return [
          { title: "今日学习复盘 vlog", category: "干货", reason: "结合你的学习打卡数据" },
          { title: "药学知识点 60 秒", category: "干货", reason: "近期药学模块活跃" },
          { title: "一个普通人的晨间 routine", category: "日常", reason: "日常类互动率高" },
        ];
      }
      case "news-summary": {
        // 与在线保持一致:返回字符串(中文摘要文本)
        const items = (p && p.items) || [];
        if (!items.length) return "（暂无新闻可生成摘要）";
        return items.map((it) => `${it.tag}:${(it.title || "").slice(0, 40)}`).join("；") + "。（离线摘要:接入 AI 后将生成更精准的中文播客稿）";
      }
      case "review-summary": {
        return "（离线规则生成的总结。接入 AI 后将基于全部模块数据生成更深入的成长评语与建议。）";
      }
      case "note-analysis": {
        const content = (p && p.content) || "";
        const words = content.split(/[\s,，。.\n;；、]+/).filter((w) => w.length > 1);
        const keywords = [...new Set(words)].slice(0, 3);
        return {
          summary: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
          keywords,
          structure: "（离线模式:接入 AI 后将自动整理笔记结构为层次分明的要点。）",
          insights: "（离线模式:接入 AI 后将分析笔记中的知识盲点和逻辑漏洞。）",
          connections: "（离线模式:接入 AI 后将建议与其他知识的关联方向。）",
          actionItems: "1. 重新阅读笔记并补充遗漏细节\n2. 针对关键词深入搜索学习\n3. 用自己的话复述核心要点",
          questions: "1. 这条笔记的核心概念是什么?\n2. 它与已学知识有什么联系?\n3. 如何应用到实际场景中?",
          _ai: false,
        };
      }
      case "photodiary-summary": {
        const entries = (p && p.entries) || [];
        if (!entries.length) return "（暂无照片日记记录,上传照片并加一句话记录后即可生成小结）";
        const notes = entries.map((e) => e.note || "").filter(Boolean);
        if (!notes.length) return `今日共记录 ${entries.length} 张照片,主题多样。接入 AI 后将生成更温暖的生活小结。`;
        return `今日共记录 ${entries.length} 张照片,关键词:${[...new Set(notes.join(" ").split(/[\s,，。]+/).filter((w)=>w.length>1))].slice(0,5).join("、")}。${notes[0].slice(0,40)}。（离线小结:接入 AI 后将生成更有温度的生活记录）`;
      }
      case "korean-chat": {
        const input = (p && p.input) || "";
        // 离线:基于内置课程做简单回复
        return `【韩语】안녕하세요! 질문을 이해했어요. (annyeonghaseyo! jilmuneul ihaehaesseoyo.)\n【中文】你好!我理解了你的问题:${input.slice(0,40)}。\n【讲解】（离线模式:接入 AI 后将提供完整的韩语对话练习、语法纠正与讲解。当前可参考上方 30 课系统课程学习句型。）`;
      }
      case "content-stats": {
        const items = (p && p.items) || [];
        if (!items.length) return "（暂无内容数据,在「内容复盘」中添加作品数据后即可分析）";
        const totalPlays = items.reduce((s,i)=>s+(i.plays||0),0);
        const totalLikes = items.reduce((s,i)=>s+(i.likes||0),0);
        const avg = items.length?Math.round(totalPlays/items.length):0;
        return `共 ${items.length} 条内容,总播放 ${totalPlays},总点赞 ${totalLikes},平均播放 ${avg}。${totalLikes>0?`互动率约 ${(totalLikes/totalPlays*100).toFixed(1)}%。`:""}（离线分析:接入 AI 后将给出更深入的内容表现分析与改进建议）`;
      }
      case "fitness-stats": {
        const items = (p && p.items) || [];
        if (!items.length) return "（暂无健身打卡数据,在「健身打卡」中记录后即可分析）";
        const totalMin = items.reduce((s,i)=>s+(i.duration||0),0);
        const weights = items.map((i)=>i.weight).filter((w)=>w>0);
        const wTrend = weights.length>=2 ? (weights[0]-weights[weights.length-1]).toFixed(1) : 0;
        return `近期打卡 ${items.length} 次,累计训练 ${totalMin} 分钟。${weights.length?`体重从 ${weights[weights.length-1]}kg 变化到 ${weights[0]}kg(${wTrend>0?"-"+wTrend:"+"+Math.abs(wTrend)}kg)。`:""}建议保持规律训练。（离线分析:接入 AI 后将给出个性化训练建议）`;
      }
      default:
        return "（AI 功能待接入。当前为占位结果,后续接入 OpenAI/Claude 后启用智能生成。）";
    }
  }

  /* ============================================================
   * 通用列表模块(schema 驱动 CRUD)
   * ============================================================ */
  function initListModule(id) {
    const def = LIST_DEFS[id];
    const root = $("mod-" + id);
    if (!root || !def) return;
    const desc = $("desc-" + id);
    if (desc) desc.textContent = "支持新增/编辑/删除,数据自动保存到本地";

    // 构建表单
    let formHtml = `<div class="gen-form" id="form-${id}">`;
    def.fields.forEach((f) => {
      const fid = `f-${id}-${f.key}`;
      if (f.type === "textarea") {
        formHtml += `<div><label style="font-size:11px;color:var(--text-sub)">${f.label}</label><textarea id="${fid}" rows="3"></textarea></div>`;
      } else if (f.type === "checkbox") {
        formHtml += `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="${fid}" style="width:auto"> ${f.label}</label>`;
      } else {
        formHtml += `<div><label style="font-size:11px;color:var(--text-sub)">${f.label}</label><${f.type === "select" ? "select" : "input"} id="${fid}" ${f.type === "select" ? "" : `type="${f.type === "tags" ? "text" : f.type}"`}${f.type === "number" ? ' min="0"' : ""}>${f.type === "select" ? f.options.map((o) => `<option>${o}</option>`).join("") + "</select>" : ""}</div>`;
      }
    });
    formHtml += `<div class="gen-form-actions"><button class="btn btn-primary" id="add-${id}">+ 添加</button>`;
    // 选题灵感库:加 AI 推荐按钮
    if (id === "inspiration") {
      formHtml += `<button class="btn btn-ghost" id="ai-inspiration">🤖 AI 推荐选题</button>`;
    }
    // 智能笔记:加 AI 批量分析按钮
    if (id === "notes") {
      formHtml += `<button class="btn btn-ghost" id="ai-notes-all">🤖 AI 分析全部笔记</button>`;
    }
    // 内容复盘:加 AI 数据分析按钮
    if (id === "contentreview") {
      formHtml += `<button class="btn btn-ghost" id="ai-content-stats">🤖 AI 分析内容数据</button>`;
    }
    // 健身打卡:加 AI 训练分析按钮
    if (id === "fitness") {
      formHtml += `<button class="btn btn-ghost" id="ai-fitness-stats">🤖 AI 分析训练数据</button>`;
    }
    formHtml += `</div></div>`;
    // AI 分析结果容器(仅 contentreview / fitness)
    if (id === "contentreview" || id === "fitness") {
      formHtml += `<div class="auto-summary" id="ai-stats-${id}" style="margin-top:10px"></div>`;
    }
    formHtml += `<div class="gen-list" id="list-${id}"></div>`;
    root.innerHTML = formHtml;

    $("add-" + id).addEventListener("click", () => addListItem(id));
    // 选题灵感库 AI 推荐
    const aiBtn = $("ai-inspiration");
    if (aiBtn) aiBtn.addEventListener("click", async () => {
      aiBtn.disabled = true;
      aiBtn.textContent = "🤖 AI 推荐中…";
      toast("AI 分析你的数据,推荐选题中…");
      const stats = {
        taskRate: collectDayData(todayStr()).taskRate,
        modules: Object.keys(state.data.modules || {}),
        recentLogs: (getMod("inspiration") || []).slice(0, 5).map((i) => i.title),
      };
      const recs = await callAI("inspiration-recommend", { profile: "学习成长类自媒体", stats });
      if (Array.isArray(recs) && recs.length) {
        const list = getMod("inspiration");
        recs.forEach((r) => list.unshift({ id: uid(), title: r.title || "", category: r.category || "干货", heat: "中", content: (r.reason || "") + " [AI推荐]", createdAt: Date.now() }));
        setMod("inspiration", list);
        renderListModule("inspiration");
        toast(`AI 推荐了 ${recs.length} 个选题`);
      } else {
        toast("AI 推荐失败,请检查 API 配置");
      }
      aiBtn.disabled = false;
      aiBtn.textContent = "🤖 AI 推荐选题";
    });
    renderListModule(id);
    // 智能笔记:AI 批量分析
    const notesAiBtn = $("ai-notes-all");
    if (notesAiBtn) notesAiBtn.addEventListener("click", async () => {
      const allNotes = getMod("notes");
      if (!allNotes.length) { toast("暂无笔记,请先添加笔记"); return; }
      notesAiBtn.disabled = true;
      notesAiBtn.textContent = "🤖 AI 分析中…";
      toast(`开始分析 ${allNotes.length} 条笔记…`);
      for (const n of allNotes) {
        await analyzeNote(n.id);
      }
      notesAiBtn.disabled = false;
      notesAiBtn.textContent = "🤖 AI 分析全部笔记";
    });
    // 内容复盘:AI 数据分析
    const contentStatsBtn = $("ai-content-stats");
    if (contentStatsBtn) contentStatsBtn.addEventListener("click", async () => {
      const items = getMod("contentreview");
      if (!items.length) { toast("暂无内容数据,请先添加作品复盘记录"); return; }
      contentStatsBtn.disabled = true; contentStatsBtn.textContent = "🤖 AI 分析中…";
      const wrap = $("ai-stats-contentreview");
      if (wrap) wrap.innerHTML = `<p class="muted">🤖 AI 正在分析内容表现…</p>`;
      const aiOn = !!(getAIConfig().apiKey && getAIConfig().apiKey.trim());
      const data = items.slice(0, 20).map((it) => ({ title: it.title, platform: it.platform, plays: it.plays, likes: it.likes, comments: it.comments, notes: (it.notes||"").slice(0,80) }));
      const txt = await callAI("content-stats", { items: data });
      if (wrap) wrap.innerHTML = `<div class="summary-section highlight${aiOn?"":" warn"}"><h4>${aiOn?"✨ AI 内容分析":"📊 数据分析(离线)"}</h4><p style="line-height:1.7;margin-top:6px">${escapeHtml(typeof txt==="string"?txt:JSON.stringify(txt))}</p></div>`;
      contentStatsBtn.disabled = false; contentStatsBtn.textContent = "🤖 AI 分析内容数据";
      toast(aiOn ? "AI 内容分析完成" : "已生成离线分析");
    });
    // 健身打卡:AI 训练分析
    const fitnessStatsBtn = $("ai-fitness-stats");
    if (fitnessStatsBtn) fitnessStatsBtn.addEventListener("click", async () => {
      const items = getMod("fitness");
      if (!items.length) { toast("暂无健身数据,请先添加打卡记录"); return; }
      fitnessStatsBtn.disabled = true; fitnessStatsBtn.textContent = "🤖 AI 分析中…";
      const wrap = $("ai-stats-fitness");
      if (wrap) wrap.innerHTML = `<p class="muted">🤖 AI 正在分析训练数据…</p>`;
      const aiOn = !!(getAIConfig().apiKey && getAIConfig().apiKey.trim());
      const data = items.slice(0, 30).map((it) => ({ date: it.date, title: it.title, kind: it.kind, duration: it.duration, weight: it.weight }));
      const txt = await callAI("fitness-stats", { items: data });
      if (wrap) wrap.innerHTML = `<div class="summary-section highlight${aiOn?"":" warn"}"><h4>${aiOn?"✨ AI 训练分析":"📊 训练分析(离线)"}</h4><p style="line-height:1.7;margin-top:6px">${escapeHtml(typeof txt==="string"?txt:JSON.stringify(txt))}</p></div>`;
      fitnessStatsBtn.disabled = false; fitnessStatsBtn.textContent = "🤖 AI 分析训练数据";
      toast(aiOn ? "AI 训练分析完成" : "已生成离线分析");
    });
  }

  function getFieldValue(id, f) {
    const el = $("f-" + id + "-" + f.key);
    if (!el) return "";
    if (f.type === "checkbox") return el.checked;
    if (f.type === "number") return parseFloat(el.value) || 0;
    return el.value.trim();
  }
  function clearForm(id) {
    const def = LIST_DEFS[id];
    def.fields.forEach((f) => {
      const el = $("f-" + id + "-" + f.key);
      if (!el) return;
      if (f.type === "checkbox") el.checked = false;
      else el.value = f.default === "today" ? todayStr() : "";
    });
  }

  function addListItem(id) {
    const def = LIST_DEFS[id];
    const item = { id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
    let valid = false;
    def.fields.forEach((f) => {
      item[f.key] = getFieldValue(id, f);
      if (f.key === def.titleField && item[f.key]) valid = true;
    });
    if (!valid) { toast("请填写" + def.fields.find((f) => f.key === def.titleField).label); return; }
    const list = getMod(id);
    list.unshift(item);
    setMod(id, list);
    clearForm(id);
    renderListModule(id);
    toast("已添加");
  }

  function renderListModule(id) {
    const def = LIST_DEFS[id];
    const list = $("list-" + id);
    if (!list) return;
    const arr = getMod(id);
    if (!arr.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗒️</div><p>暂无内容</p><span>在上方添加第一条记录</span></div>`;
      return;
    }
    // 排序
    let sorted = [...arr];
    if (def.sortBy === "pinned") {
      sorted.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
    } else if (def.sortBy === "date" || def.sortBy === "createdAt" || def.sortBy === "updatedAt") {
      // 按时间戳/日期字符串倒序(新的在前)
      sorted.sort((a, b) => {
        const av = a[def.sortBy] || 0, bv = b[def.sortBy] || 0;
        if (typeof av === "number" || typeof bv === "number") return (Number(bv) || 0) - (Number(av) || 0);
        return String(bv).localeCompare(String(av));
      });
    }
    list.innerHTML = sorted.map((it) => listItemCard(id, it)).join("");
    list.querySelectorAll(".btn-del-li").forEach((b) => b.addEventListener("click", () => delListItem(id, b.dataset.id)));
    list.querySelectorAll(".btn-edit-li").forEach((b) => b.addEventListener("click", () => editListItem(id, b.dataset.id)));
    list.querySelectorAll(".btn-pin-li").forEach((b) => b.addEventListener("click", () => togglePin(id, b.dataset.id)));
    // 智能笔记模块:AI 分析按钮
    if (id === "notes") {
      list.querySelectorAll(".btn-ai-note").forEach((b) => b.addEventListener("click", () => analyzeNote(b.dataset.id)));
    }
  }

  function listItemCard(id, it) {
    const def = LIST_DEFS[id];
    const title = it[def.titleField] || "(无标题)";
    const body = it[def.bodyField] || "";
    const meta = [];
    def.fields.forEach((f) => {
      if ([def.titleField, def.bodyField].includes(f.key)) return;
      if (f.type === "checkbox") { if (it[f.key]) meta.push("📌置顶"); return; }
      if (it[f.key] !== "" && it[f.key] != null) meta.push(`${f.label.replace(/\(.*\)/, "")}:${it[f.key]}`);
    });
    const pinnedCls = it.pinned ? " pinned" : "";
    // 智能笔记模块:每条卡片加 AI 分析按钮
    const aiBtn = id === "notes" ? `<button class="icon-btn btn-ai-note" data-id="${it.id}" title="AI分析">🤖</button>` : "";
    // 备忘录:到期提醒徽标
    const memoDue = (id === "memo" && it.remind && isValidDateStr(it.remind) && it.remind <= todayStr())
      ? `<span class="ai-badge" style="background:var(--warn);color:#fff">🔔 今日提醒</span>` : "";
    return `<div class="gen-card${pinnedCls}" data-id="${it.id}">
      <div class="gen-card-head">
        <div><div class="gen-card-title">${escapeHtml(title)} ${memoDue}</div>
        <div class="gen-card-meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join("")}</div></div>
        <div class="gen-card-actions">
          ${aiBtn}
          ${def.pinned ? `<button class="icon-btn btn-pin-li" data-id="${it.id}" title="置顶">📌</button>` : ""}
          <button class="icon-btn btn-edit-li" data-id="${it.id}" title="编辑">✎</button>
          <button class="icon-btn btn-del-li" data-id="${it.id}" title="删除">🗑</button>
        </div>
      </div>
      ${body ? `<div class="gen-card-body">${escapeHtml(body).replace(/\n/g, "<br>")}</div>` : ""}
      <div class="note-ai-result" id="note-ai-${it.id}"></div>
    </div>`;
  }
  // 渲染后填充文本(避免 XSS)— 当前已用 escapeHtml 直接渲染,保留空函数兼容旧调用
  function fillListCardText(_id, _it) { /* no-op:文本已在 listItemCard 中通过 escapeHtml 渲染 */ }

  function delListItem(id, itemId) {
    if (!confirm("确定删除?")) return;
    setMod(id, getMod(id).filter((x) => x.id !== itemId));
    renderListModule(id);
    toast("已删除");
  }
  function togglePin(id, itemId) {
    const list = getMod(id);
    const it = list.find((x) => x.id === itemId);
    if (it) { it.pinned = !it.pinned; setMod(id, list); renderListModule(id); }
  }

  // 智能笔记 AI 分析
  async function analyzeNote(noteId) {
    const list = getMod("notes");
    const note = list.find((x) => x.id === noteId);
    if (!note) return;
    const resultEl = $("note-ai-" + noteId);
    if (!resultEl) return;
    const btn = document.querySelector(`.btn-ai-note[data-id="${noteId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
    resultEl.innerHTML = `<div class="muted" style="padding:10px;text-align:center">🤖 AI 分析中…</div>`;
    toast("AI 正在分析笔记…");
    const result = await callAI("note-analysis", { title: note.title || "", content: note.content || "" });
    let html = `<div class="note-ai-card">`;
    if (result._ai) {
      html += `<div class="note-ai-badge">✨ AI 深度分析</div>`;
    } else {
      html += `<div class="note-ai-badge offline">离线模式</div>`;
    }
    if (result.summary) {
      html += `<div class="note-ai-section"><b>📝 核心摘要</b><br>${escapeHtml(result.summary)}</div>`;
    }
    if (result.keywords && result.keywords.length) {
      html += `<div class="note-ai-section"><b>🏷️ 关键词</b><br>${result.keywords.map((k) => `<span class="note-ai-tag">${escapeHtml(k)}</span>`).join("")}</div>`;
    }
    if (result.structure) {
      html += `<div class="note-ai-section"><b>📋 结构化整理</b><br>${escapeHtml(result.structure).replace(/\n/g, "<br>")}</div>`;
    }
    if (result.insights) {
      html += `<div class="note-ai-section"><b>💡 AI 洞察</b><br>${escapeHtml(result.insights)}</div>`;
    }
    if (result.connections) {
      html += `<div class="note-ai-section"><b>🔗 知识关联</b><br>${escapeHtml(result.connections)}</div>`;
    }
    if (result.actionItems) {
      html += `<div class="note-ai-section"><b>✅ 学习建议</b><br>${escapeHtml(result.actionItems).replace(/\n/g, "<br>")}</div>`;
    }
    if (result.questions) {
      html += `<div class="note-ai-section"><b>❓ 深入思考</b><br>${escapeHtml(result.questions).replace(/\n/g, "<br>")}</div>`;
    }
    html += `</div>`;
    resultEl.innerHTML = html;
    if (btn) { btn.disabled = false; btn.textContent = "🤖"; }
    toast(result._ai ? "AI 分析完成" : "离线分析完成");
  }
  function editListItem(id, itemId) {
    const list = getMod(id);
    const it = list.find((x) => x.id === itemId);
    if (!it) return;
    const def = LIST_DEFS[id];
    const body = $("modalBody");
    body.innerHTML = `<div class="modal-header" style="margin:-22px -22px 16px;padding:18px 22px;border-bottom:1px solid var(--border)"><h3>编辑</h3></div>` +
      def.fields.map((f) => {
        const fid = "em-" + f.key;
        const val = it[f.key] != null ? it[f.key] : "";
        if (f.type === "textarea") return `<div class="modal-field"><label>${f.label}</label><textarea id="${fid}" rows="4">${escapeHtml(val)}</textarea></div>`;
        if (f.type === "checkbox") return `<div class="modal-field"><label><input type="checkbox" id="${fid}" ${val ? "checked" : ""} style="width:auto"> ${f.label}</label></div>`;
        if (f.type === "select") return `<div class="modal-field"><label>${f.label}</label><select id="${fid}">${f.options.map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
        return `<div class="modal-field"><label>${f.label}</label><input type="${f.type === "tags" ? "text" : f.type}" id="${fid}" value="${escapeHtml(String(val))}"></div>`;
      }).join("") +
      `<div class="modal-actions"><button class="btn btn-ghost" id="em-cancel">取消</button><button class="btn btn-primary" id="em-save">保存</button></div>`;
    $("taskModal").classList.add("show");
    $("em-cancel").addEventListener("click", closeModal);
    $("em-save").addEventListener("click", () => {
      def.fields.forEach((f) => {
        const el = $("em-" + f.key);
        if (f.type === "checkbox") it[f.key] = el.checked;
        else if (f.type === "number") it[f.key] = parseFloat(el.value) || 0;
        else it[f.key] = el.value.trim();
      });
      it.updatedAt = Date.now();
      setMod(id, list);
      closeModal();
      renderListModule(id);
      toast("已保存");
    });
  }

  /* ============================================================
   * 定制模块:闪卡填空(SM-2 间隔重复)
   * ============================================================ */
  function initFlashcard() {
    const root = $("mod-flashcard");
    if (!root) return;
    $("desc-flashcard").textContent = "文档导入 + AI 生成闪卡,翻转/填空复习";
    MODULE_RENDER.flashcard = renderFlashcard;
    renderFlashcard();
  }
  function getDueCards() {
    const all = getMod("flashcard");
    const now = Date.now();
    return all.filter((c) => !c.nextReview || c.nextReview <= now);
  }
  function renderFlashcard() {
    const root = $("mod-flashcard");
    const all = getMod("flashcard");
    const due = getDueCards();
    const todayKey = todayStr();
    const reviewedToday = (state.data.fcLog || {})[todayKey] || 0;
    const reviewMode = state.data.fcReviewMode || "flip";
    let html = `<div class="mod-stats">
      <div class="mod-stat"><div class="mod-stat-label">总卡片</div><div class="mod-stat-value">${all.length}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">待复习</div><div class="mod-stat-value">${due.length}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">今日已复习</div><div class="mod-stat-value">${reviewedToday}</div></div>
    </div>`;
    // 添加卡片 + 文档导入
    html += `<div class="gen-form">
      <div class="gen-form-row"><input type="text" id="fc-q" placeholder="正面问题">
      <input type="text" id="fc-a" placeholder="背面答案"></div>
      <div class="gen-form-row"><input type="text" id="fc-tag" placeholder="标签(可选)">
      <button class="btn btn-primary" id="fc-add">+ 添加卡片</button></div>
      <div style="margin:10px 0;padding:10px;background:var(--bg-soft);border-radius:8px">
        <label style="font-size:12px;color:var(--text-sub);display:block;margin-bottom:6px">📄 上传文档(PDF / Word / TXT) — AI 自动提取知识点生成闪卡</label>
        <input type="file" id="fc-file" accept=".pdf,.docx,.doc,.txt" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden">
        <label id="fc-dropzone" for="fc-file" style="display:block;padding:22px 14px;border:2px dashed var(--primary);border-radius:12px;background:var(--primary-soft);text-align:center;cursor:pointer;transition:all 0.15s">
          <div style="font-size:30px;line-height:1;margin-bottom:6px">📥</div>
          <div style="font-size:13px;font-weight:700;color:var(--primary-deep)">点击此处选择文件</div>
          <div style="font-size:11px;color:var(--text-sub);margin-top:4px">支持 PDF / Word / TXT · 也可拖拽或 Ctrl+V 粘贴</div>
        </label>
        <div id="fc-file-status" style="font-size:12px;margin-top:6px"></div>
      </div>
      <div style="margin:10px 0">
        <label style="font-size:12px;color:var(--text-sub);display:block;margin-bottom:6px">或直接粘贴文本:</label>
        <textarea id="fc-src" rows="4" placeholder="粘贴学习内容,AI 将自动生成闪卡..."></textarea>
      </div>
      <div class="gen-form-actions">
        <button class="btn btn-ghost" id="fc-ai">✨ AI 生成闪卡</button>
        <button class="btn btn-ghost" id="fc-ai-blank">📝 AI 生成填空题</button>
      </div>
    </div>`;
    // 复习区
    if (due.length) {
      const c = due[0];
      if (reviewMode === "blank" && c.blankText) {
        // 填空模式
        html += `<div class="flashcard-blank" id="fc-blank-area">
          <div class="flashcard-q-label">填空题</div>
          <div class="flashcard-text" id="fc-blank-text">${c.blankText}</div>
          <input type="text" id="fc-blank-input" placeholder="输入答案..." style="margin-top:12px">
          <div class="gen-form-actions" style="margin-top:8px">
            <button class="btn btn-primary" id="fc-blank-check">提交答案</button>
            <button class="btn btn-ghost" id="fc-blank-show">显示答案</button>
          </div>
          <div id="fc-blank-result" style="margin-top:8px"></div>
        </div>`;
      } else {
        // 翻转模式
        html += `<div class="flashcard" id="fc-card"><div class="flashcard-inner">
          <div class="flashcard-face"><div class="flashcard-q-label">问题</div><div class="flashcard-text" id="fc-front"></div><div class="flashcard-hint">点击翻转</div></div>
          <div class="flashcard-face flashcard-back"><div class="flashcard-q-label">答案</div><div class="flashcard-text" id="fc-back"></div></div>
        </div></div>`;
      }
      html += `<div class="fc-grade-row">
        <button class="fc-grade again" data-g="0">忘了</button>
        <button class="fc-grade hard" data-g="2">有点印象</button>
        <button class="fc-grade good" data-g="4">记住了</button>
      </div>
      <div style="text-align:center;margin-top:8px">
        <button class="btn btn-ghost" id="fc-mode-toggle" style="font-size:12px;padding:4px 12px">${reviewMode === "blank" ? "切换为翻转模式" : "切换为填空模式"}</button>
      </div>`;
    } else {
      html += `<div class="empty-state"><div class="empty-icon">🎉</div><p>今日复习完成</p><span>没有待复习的卡片</span></div>`;
    }
    // 列表
    html += `<h3 class="block-title" style="margin-top:18px">全部卡片(${all.length})</h3><div class="gen-list">` +
      (all.length ? all.slice(0, 20).map((c) => `<div class="gen-card"><div class="gen-card-head"><div class="gen-card-title"></div><div class="gen-card-actions"><button class="icon-btn btn-fc-del" data-id="${c.id}">🗑</button></div></div><div class="gen-card-body" style="margin-top:4px"></div></div>`).join("") : '<div class="muted">暂无卡片</div>') +
      `</div>`;
    root.innerHTML = html;
    // 填充文本
    if (due.length) {
      if (reviewMode === "blank" && due[0].blankText) {
        const checkBtn = $("fc-blank-check");
        const showBtn = $("fc-blank-show");
        if (checkBtn) checkBtn.addEventListener("click", () => {
          const input = $("fc-blank-input").value.trim().toLowerCase();
          const answer = (due[0].a || "").toLowerCase();
          const correct = input && (input === answer || answer.includes(input) || input.includes(answer));
          $("fc-blank-result").innerHTML = correct
            ? `<div style="color:var(--done);font-weight:700">✅ 正确!</div>`
            : `<div style="color:var(--warn)">❌ 不完全正确。答案:${escapeHtml(due[0].a)}</div>`;
        });
        if (showBtn) showBtn.addEventListener("click", () => {
          $("fc-blank-result").innerHTML = `<div style="color:var(--primary)">答案:${escapeHtml(due[0].a)}</div>`;
        });
      } else {
        $("fc-front").textContent = due[0].q;
        $("fc-back").textContent = due[0].a;
        $("fc-card").addEventListener("click", () => $("fc-card").classList.toggle("flipped"));
      }
      root.querySelectorAll(".fc-grade").forEach((b) => b.addEventListener("click", () => gradeFlashcard(due[0].id, parseInt(b.dataset.g, 10))));
      const modeBtn = $("fc-mode-toggle");
      if (modeBtn) modeBtn.addEventListener("click", () => {
        state.data.fcReviewMode = reviewMode === "blank" ? "flip" : "blank";
        saveData(); renderFlashcard();
      });
    }
    root.querySelectorAll(".gen-card").forEach((card) => {
      const del = card.querySelector(".btn-fc-del");
      if (del) {
        card.querySelector(".gen-card-title").textContent = cardContains(all, del.dataset.id, "q");
        card.querySelector(".gen-card-body").textContent = "→ " + cardContains(all, del.dataset.id, "a");
        del.addEventListener("click", () => { setMod("flashcard", getMod("flashcard").filter((x) => x.id !== del.dataset.id)); renderFlashcard(); });
      }
    });
    $("fc-add").addEventListener("click", () => {
      const q = $("fc-q").value.trim(), a = $("fc-a").value.trim();
      if (!q || !a) { toast("请填写问题和答案"); return; }
      const list = getMod("flashcard");
      list.push({ id: uid(), q, a, tag: $("fc-tag").value.trim(), ease: 2.5, interval: 0, reps: 0, nextReview: Date.now(), createdAt: Date.now() });
      setMod("flashcard", list);
      renderFlashcard(); toast("已添加卡片");
    });
    // 文件上传
    // 文件读取核心逻辑(供 change/drop/paste 复用)
    async function readFcFile(file) {
      if (!file) return;
      const statusEl = $("fc-file-status");
      statusEl.textContent = "📄 正在读取文件...";
      try {
        let text = "";
        const name = (file.name || "").toLowerCase();
        if (name.endsWith(".pdf")) {
          text = await extractPdfText(file);
        } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
          text = await extractDocxText(file);
        } else {
          text = await file.text();
        }
        if (!text.trim()) { statusEl.textContent = "⚠️ 未能提取文本,请检查文件"; return; }
        const preview = text.slice(0, 200) + (text.length > 200 ? "..." : "");
        statusEl.innerHTML = `✅ 已提取 ${text.length} 字符<br><span class="muted">${escapeHtml(preview)}</span>`;
        $("fc-src").value = text;
        toast("文件已读取,点击 AI 生成闪卡");
      } catch (err) {
        statusEl.textContent = "❌ 读取失败:" + err.message;
      }
    }
    // ① 原生 input change(label 点击已原生触发文件选择,无需 JS click())
    const fcFileInput = $("fc-file");
    if (fcFileInput) fcFileInput.addEventListener("change", (e) => readFcFile(e.target.files[0]));
    // ② 拖拽上传(桌面端增强;手机端用 label 点击)
    const dz = $("fc-dropzone");
    if (dz) {
      dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.style.borderColor = "var(--primary-deep)"; dz.style.background = "var(--primary)"; });
      dz.addEventListener("dragleave", () => { dz.style.borderColor = "var(--primary)"; dz.style.background = "var(--primary-soft)"; });
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        dz.style.borderColor = "var(--primary)"; dz.style.background = "var(--primary-soft)";
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) readFcFile(file);
      });
    }
    // ③ 全局粘贴:若剪贴板有文件且焦点不在输入框,则读取文件;否则放行让文本框正常粘贴
    if (!state._fcPasteBound) {
      state._fcPasteBound = true;
      document.addEventListener("paste", (e) => {
        const panel = $("mod-flashcard");
        if (!panel || !panel.closest(".panel.active")) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of items) {
          if (it.kind === "file") {
            const f = it.getAsFile();
            if (f) { e.preventDefault(); readFcFile(f); return; }
          }
        }
      });
    }
    // AI 生成闪卡
    $("fc-ai").addEventListener("click", async () => {
      const text = $("fc-src").value.trim();
      if (!text) { toast("请上传文档或粘贴文本"); return; }
      const btn = $("fc-ai"); btn.disabled = true; btn.textContent = "✨ AI 生成中…";
      toast("AI 分析文本,生成闪卡中…");
      try {
        const cards = await callAI("flashcard-gen", { text });
        const list = getMod("flashcard");
        (Array.isArray(cards) ? cards : []).forEach((c) => list.push({ id: uid(), q: c.q, a: c.a, tag: c.tag || "AI生成", ease: 2.5, interval: 0, reps: 0, nextReview: Date.now(), createdAt: Date.now() }));
        setMod("flashcard", list);
        $("fc-src").value = "";
        $("fc-file-status").textContent = "";
        renderFlashcard();
        toast(`AI 生成了 ${cards.length} 张闪卡`);
      } catch (err) {
        btn.disabled = false; btn.textContent = "✨ AI 生成闪卡";
        toast("AI 生成失败:" + err.message);
      }
    });
    // AI 生成填空题
    $("fc-ai-blank").addEventListener("click", async () => {
      const text = $("fc-src").value.trim();
      if (!text) { toast("请上传文档或粘贴文本"); return; }
      const btn = $("fc-ai-blank"); btn.disabled = true; btn.textContent = "📝 AI 生成中…";
      toast("AI 生成填空题中…");
      try {
        const blanks = await callAI("flashcard-blank", { text });
        const list = getMod("flashcard");
        (Array.isArray(blanks) ? blanks : []).forEach((c) => list.push({
          id: uid(), q: c.q, a: c.a, blankText: c.blankText || c.q,
          tag: "AI填空", ease: 2.5, interval: 0, reps: 0,
          nextReview: Date.now(), createdAt: Date.now(),
        }));
        setMod("flashcard", list);
        $("fc-src").value = "";
        $("fc-file-status").textContent = "";
        state.data.fcReviewMode = "blank"; saveData();
        renderFlashcard();
        toast(`AI 生成了 ${blanks.length} 道填空题,已切换为填空模式`);
      } catch (err) {
        btn.disabled = false; btn.textContent = "📝 AI 生成填空题";
        toast("AI 生成失败:" + err.message);
      }
    });
  }
  // PDF 文本提取
  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error("PDF 库未加载,请检查网络");
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return text;
  }
  // Word 文档文本提取
  async function extractDocxText(file) {
    if (!window.mammoth) throw new Error("Word 库未加载,请检查网络");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || "";
  }
  function cardContains(arr, id, key) {
    const c = arr.find((x) => x.id === id);
    return c ? c[key] : "";
  }
  function gradeFlashcard(id, grade) {
    const list = getMod("flashcard");
    const c = list.find((x) => x.id === id);
    if (!c) return;
    // SM-2 简化
    if (grade === 0) { c.reps = 0; c.interval = 1; c.ease = Math.max(1.3, c.ease - 0.2); }
    else {
      c.reps = (c.reps || 0) + 1;
      c.ease = c.ease + (0.1 - (4 - grade) * (0.08 + (4 - grade) * 0.02));
      if (c.ease < 1.3) c.ease = 1.3;
      if (c.reps === 1) c.interval = 1;
      else if (c.reps === 2) c.interval = 6;
      else c.interval = Math.round(c.interval * c.ease);
    }
    c.nextReview = Date.now() + c.interval * 86400000;
    if (!state.data.fcLog) state.data.fcLog = {};
    const k = todayStr();
    state.data.fcLog[k] = (state.data.fcLog[k] || 0) + 1;
    setMod("flashcard", list);
    saveData();
    renderFlashcard();
  }

  /* ============================================================
   * 背单词(骨架:词库 + 三轮 + 生词本)
   * ============================================================ */
  function initVocab() {
    const root = $("mod-vocab");
    if (!root) return;
    $("desc-vocab").textContent = "考研核心200词,艾宾浩斯三轮刷词复习";
    MODULE_RENDER.vocab = renderVocab;
    if (!state.data.vocabState) state.data.vocabState = { idx: 0, round: 1 };
    renderVocab();
  }
  const SAMPLE_VOCAB = [
    // ===== 考研核心词汇 A-B =====
    { w: "abandon", ph: "/əˈbændən/", t: "v. 放弃;抛弃", e: "He abandoned his plan." },
    { w: "abolish", ph: "/əˈbɒlɪʃ/", t: "v. 废除;废止", e: "The government abolished the old law." },
    { w: "absorb", ph: "/əbˈzɔːb/", t: "v. 吸收;吸引", e: "Plants absorb sunlight." },
    { w: "abstract", ph: "/ˈæbstrækt/", t: "adj. 抽象的;n. 摘要", e: "Beauty is an abstract concept." },
    { w: "academic", ph: "/ˌækəˈdemɪk/", t: "adj. 学术的;n. 学者", e: "She published an academic paper." },
    { w: "accelerate", ph: "/əkˈseləreɪt/", t: "v. 加速", e: "The car accelerated rapidly." },
    { w: "accomplish", ph: "/əˈkʌmplɪʃ/", t: "v. 完成;实现", e: "She accomplished her goal." },
    { w: "accumulate", ph: "/əˈkjuːmjəleɪt/", t: "v. 积累;积聚", e: "He accumulated wealth over years." },
    { w: "accurate", ph: "/ˈækjərət/", t: "adj. 精确的", e: "The clock is accurate." },
    { w: "acquire", ph: "/əˈkwaɪər/", t: "v. 获得;学到", e: "She acquired new skills." },
    { w: "adapt", ph: "/əˈdæpt/", t: "v. 适应;改编", e: "We adapted to the new environment." },
    { w: "adequate", ph: "/ˈædɪkwət/", t: "adj. 充足的;适当的", e: "We have adequate food." },
    { w: "adjust", ph: "/əˈdʒʌst/", t: "v. 调整;适应", e: "He adjusted the volume." },
    { w: "administer", ph: "/ədˈmɪnɪstər/", t: "v. 管理;执行", e: "She administers the department." },
    { w: "advocate", ph: "/ˈædvəkeɪt/", t: "v. 提倡;n. 倡导者", e: "He advocates healthy living." },
    { w: "aesthetic", ph: "/iːsˈθetɪk/", t: "adj. 审美的;美学的", e: "The building has aesthetic value." },
    { w: "aggressive", ph: "/əˈɡresɪv/", t: "adj. 侵略性的;有进取心的", e: "He is an aggressive salesman." },
    { w: "allocate", ph: "/ˈæləkeɪt/", t: "v. 分配;分派", e: "We allocated resources wisely." },
    { w: "alter", ph: "/ˈɔːltər/", t: "v. 改变;更改", e: "She altered her dress." },
    { w: "ambiguous", ph: "/æmˈbɪɡjuəs/", t: "adj. 模糊的;含糊的", e: "His answer was ambiguous." },
    { w: "amend", ph: "/əˈmend/", t: "v. 修改;修正", e: "They amended the constitution." },
    { w: "analyze", ph: "/ˈænəlaɪz/", t: "v. 分析", e: "Scientists analyze the data." },
    { w: "ancient", ph: "/ˈeɪnʃənt/", t: "adj. 古老的;古代的", e: "We visited ancient ruins." },
    { w: "anticipate", ph: "/ænˈtɪsɪpeɪt/", t: "v. 预期;期望", e: "We anticipate a good result." },
    { w: "arbitrary", ph: "/ˈɑːbɪtrəri/", t: "adj. 任意的;武断的", e: "His decision was arbitrary." },
    { w: "assemble", ph: "/əˈsembl/", t: "v. 集合;组装", e: "Workers assemble cars." },
    { w: "assess", ph: "/əˈses/", t: "v. 评估;评价", e: "We assess the situation." },
    { w: "assign", ph: "/əˈsaɪn/", t: "v. 分配;指派", e: "The teacher assigned homework." },
    { w: "assist", ph: "/əˈsɪst/", t: "v. 协助;帮助", e: "She assisted the elderly man." },
    { w: "assume", ph: "/əˈsjuːm/", t: "v. 假定;承担", e: "I assume he is right." },
    { w: "assure", ph: "/əˈʃʊər/", t: "v. 保证;使确信", e: "I assure you it's safe." },
    { w: "attach", ph: "/əˈtætʃ/", t: "v. 附加;附着", e: "Please attach the file." },
    { w: "attain", ph: "/əˈteɪn/", t: "v. 达到;获得", e: "He attained success." },
    { w: "attribute", ph: "/əˈtrɪbjuːt/", t: "v. 归因于;n. 属性", e: "She attributed her success to hard work." },
    { w: "authentic", ph: "/ɔːˈθentɪk/", t: "adj. 真实的;正宗的", e: "This is an authentic painting." },
    { w: "authority", ph: "/ɔːˈθɒrəti/", t: "n. 权威;当局", e: "The authority approved the plan." },
    { w: "available", ph: "/əˈveɪləbl/", t: "adj. 可用的;有空的", e: "Is this seat available?" },
    // ===== 考研核心词汇 B-C =====
    { w: "barrier", ph: "/ˈbæriər/", t: "n. 障碍;壁垒", e: "Language is a barrier." },
    { w: "benefit", ph: "/ˈbenɪfɪt/", t: "n. 益处;v. 受益", e: "Exercise benefits health." },
    { w: "boom", ph: "/buːm/", t: "v. 繁荣;n. 激增", e: "The economy is booming." },
    { w: "boost", ph: "/buːst/", t: "v. 促进;提升", e: "Coffee boosts energy." },
    { w: "bound", ph: "/baʊnd/", t: "adj. 必然的;受约束的", e: "It's bound to happen." },
    { w: "breed", ph: "/briːd/", t: "v. 繁殖;饲养;n. 品种", e: "Dogs breed quickly." },
    { w: "bulk", ph: "/bʌlk/", t: "n. 大量;体积", e: "We buy in bulk." },
    { w: "bureau", ph: "/ˈbjʊərəʊ/", t: "n. 局;办事处", e: "The bureau handles complaints." },
    { w: "capable", ph: "/ˈkeɪpəbl/", t: "adj. 有能力的", e: "She is capable of leading." },
    { w: "capacity", ph: "/kəˈpæsəti/", t: "n. 容量;能力", e: "The stadium has a capacity of 50,000." },
    { w: "category", ph: "/ˈkætəɡəri/", t: "n. 类别;范畴", e: "Books are sorted by category." },
    { w: "cease", ph: "/siːs/", t: "v. 停止;终止", e: "The rain ceased at noon." },
    { w: "challenge", ph: "/ˈtʃælɪndʒ/", t: "n. 挑战;v. 向…挑战", e: "She accepted the challenge." },
    { w: "characteristic", ph: "/ˌkærəktəˈrɪstɪk/", t: "n. 特征;adj. 典型的", e: "Kindness is her characteristic." },
    { w: "chronological", ph: "/ˌkrɒnəˈlɒdʒɪkl/", t: "adj. 按时间顺序的", e: "List events in chronological order." },
    { w: "circumstance", ph: "/ˈsɜːkəmstəns/", t: "n. 情况;环境", e: "Under no circumstance should you give up." },
    { w: "coincide", ph: "/ˌkəʊɪnˈsaɪd/", t: "v. 同时发生;一致", e: "Their views coincide." },
    { w: "collaborate", ph: "/kəˈlæbəreɪt/", t: "v. 合作;协作", e: "They collaborate on research." },
    { w: "collapse", ph: "/kəˈlæps/", t: "v. 倒塌;n. 崩溃", e: "The old building collapsed." },
    { w: "commemorate", ph: "/kəˈmeməreɪt/", t: "v. 纪念", e: "We commemorate the heroes." },
    { w: "commence", ph: "/kəˈmens/", t: "v. 开始", e: "The ceremony commences at 9." },
    { w: "compatible", ph: "/kəmˈpætəbl/", t: "adj. 兼容的;相容的", e: "The two systems are compatible." },
    { w: "compensate", ph: "/ˈkɒmpenseɪt/", t: "v. 补偿;赔偿", e: "They compensated for the loss." },
    { w: "competent", ph: "/ˈkɒmpɪtənt/", t: "adj. 胜任的;有能力的", e: "She is a competent manager." },
    { w: "compile", ph: "/kəmˈpaɪl/", t: "v. 编译;汇编", e: "He compiled a dictionary." },
    { w: "complement", ph: "/ˈkɒmplɪment/", t: "v. 补充;n. 补足物", e: "Wine complements the meal." },
    { w: "comprehensive", ph: "/ˌkɒmprɪˈhensɪv/", t: "adj. 全面的;综合的", e: "We need a comprehensive plan." },
    { w: "comprise", ph: "/kəmˈpraɪz/", t: "v. 包含;组成", e: "The team comprises ten members." },
    { w: "conceal", ph: "/kənˈsiːl/", t: "v. 隐藏;隐瞒", e: "He concealed the truth." },
    { w: "conceive", ph: "/kənˈsiːv/", t: "v. 构思;设想", e: "She conceived a brilliant idea." },
    { w: "conclude", ph: "/kənˈkluːd/", t: "v. 推断;结束", e: "We concluded the meeting." },
    { w: "concrete", ph: "/ˈkɒnkriːt/", t: "adj. 具体的;n. 混凝土", e: "Give me a concrete example." },
    { w: "conduct", ph: "/kənˈdʌkt/", t: "v. 进行;引导;n. 行为", e: "Scientists conduct experiments." },
    { w: "confine", ph: "/kənˈfaɪn/", t: "v. 限制;禁闭", e: "Please confine your talk to 5 minutes." },
    { w: "confirm", ph: "/kənˈfɜːm/", t: "v. 确认;证实", e: "Please confirm your reservation." },
    { w: "conflict", ph: "/ˈkɒnflɪkt/", t: "n. 冲突;矛盾", e: "There is a conflict of interest." },
    { w: "confront", ph: "/kənˈfrʌnt/", t: "v. 面对;对抗", e: "We must confront the problem." },
    { w: "conscience", ph: "/ˈkɒnʃəns/", t: "n. 良心;道德感", e: "He has a clear conscience." },
    { w: "consensus", ph: "/kənˈsensəs/", t: "n. 共识;一致", e: "They reached a consensus." },
    { w: "consequence", ph: "/ˈkɒnsɪkwəns/", t: "n. 后果;结果", e: "Actions have consequences." },
    { w: "constitute", ph: "/ˈkɒnstɪtjuːt/", t: "v. 构成;组成", e: "Twelve months constitute a year." },
    { w: "construct", ph: "/kənˈstrʌkt/", t: "v. 建造;构造", e: "They constructed a bridge." },
    { w: "consume", ph: "/kənˈsjuːm/", t: "v. 消耗;消费", e: "Cars consume fuel." },
    { w: "contemplate", ph: "/ˈkɒntəmpleɪt/", t: "v. 沉思;考虑", e: "She contemplated her future." },
    { w: "contemporary", ph: "/kənˈtemprəri/", t: "adj. 当代的;同时代的", e: "She likes contemporary art." },
    { w: "contradict", ph: "/ˌkɒntrəˈdɪkt/", t: "v. 反驳;矛盾", e: "His actions contradict his words." },
    { w: "contribute", ph: "/kənˈtrɪbjuːt/", t: "v. 贡献;捐献", e: "Everyone contributes to the project." },
    { w: "controversial", ph: "/ˌkɒntrəˈvɜːʃl/", t: "adj. 有争议的", e: "It's a controversial topic." },
    { w: "convention", ph: "/kənˈvenʃn/", t: "n. 惯例;大会", e: "It's a social convention." },
    { w: "convert", ph: "/kənˈvɜːt/", t: "v. 转换;改变", e: "They converted the room into a study." },
    { w: "convince", ph: "/kənˈvɪns/", t: "v. 说服;使确信", e: "She convinced me to try." },
    { w: "corporate", ph: "/ˈkɔːpərət/", t: "adj. 公司的;团体的", e: "Corporate culture matters." },
    { w: "correspond", ph: "/ˌkɒrəˈspɒnd/", t: "v. 符合;通信", e: "The data corresponds to our findings." },
    { w: "crucial", ph: "/ˈkruːʃl/", t: "adj. 至关重要的", e: "Sleep is crucial for health." },
    { w: "cultivate", ph: "/ˈkʌltɪveɪt/", t: "v. 培养;耕作", e: "She cultivates good habits." },
    // ===== 考研核心词汇 D-F =====
    { w: "declare", ph: "/dɪˈkleər/", t: "v. 宣布;声明", e: "They declared victory." },
    { w: "decline", ph: "/dɪˈklaɪn/", t: "v. 下降;拒绝", e: "Sales declined sharply." },
    { w: "deduce", ph: "/dɪˈdjuːs/", t: "v. 推论;演绎", e: "We deduced the answer from clues." },
    { w: "define", ph: "/dɪˈfaɪn/", t: "v. 定义;明确", e: "How do you define success?" },
    { w: "delay", ph: "/dɪˈleɪ/", t: "v./n. 延迟;耽搁", e: "The flight was delayed." },
    { w: "deliberate", ph: "/dɪˈlɪbərət/", t: "adj. 故意的;深思熟虑的", e: "It was a deliberate act." },
    { w: "deliver", ph: "/dɪˈlɪvər/", t: "v. 递送;发表", e: "She delivered a speech." },
    { w: "demonstrate", ph: "/ˈdemənstreɪt/", t: "v. 证明;示范", e: "He demonstrated the machine." },
    { w: "deny", ph: "/dɪˈnaɪ/", t: "v. 否认;拒绝", e: "He denied the accusation." },
    { w: "depict", ph: "/dɪˈpɪkt/", t: "v. 描绘;描述", e: "The painting depicts a battle." },
    { w: "derive", ph: "/dɪˈraɪv/", t: "v. 源于;获得", e: "The word derives from Latin." },
    { w: "destiny", ph: "/ˈdestəni/", t: "n. 命运;天命", e: "We control our own destiny." },
    { w: "detect", ph: "/dɪˈtekt/", t: "v. 发现;察觉", e: "The sensor detected smoke." },
    { w: "deteriorate", ph: "/dɪˈtɪəriəreɪt/", t: "v. 恶化;变坏", e: "His health deteriorated." },
    { w: "determine", ph: "/dɪˈtɜːmɪn/", t: "v. 决定;确定", e: "We determine the price." },
    { w: "devise", ph: "/dɪˈvaɪz/", t: "v. 设计;发明", e: "She devised a new method." },
    { w: "diminish", ph: "/dɪˈmɪnɪʃ/", t: "v. 减少;缩小", e: "His influence diminished." },
    { w: "discard", ph: "/dɪˈskɑːd/", t: "v. 丢弃;抛弃", e: "Discard the old files." },
    { w: "discipline", ph: "/ˈdɪsəplɪn/", t: "n. 纪律;学科;v. 训练", e: "Self-discipline is key." },
    { w: "disclose", ph: "/dɪsˈkləʊz/", t: "v. 揭露;透露", e: "He disclosed the secret." },
    { w: "distinguish", ph: "/dɪˈstɪŋɡwɪʃ/", t: "v. 区分;辨别", e: "Can you distinguish the twins?" },
    { w: "distribute", ph: "/dɪˈstrɪbjuːt/", t: "v. 分发;分配", e: "They distributed food to the poor." },
    { w: "diverse", ph: "/daɪˈvɜːs/", t: "adj. 多样的;不同的", e: "We have a diverse team." },
    { w: "dominate", ph: "/ˈdɒmɪneɪt/", t: "v. 支配;控制", e: "The company dominates the market." },
    { w: "draft", ph: "/drɑːft/", t: "n. 草稿;v. 起草", e: "She drafted a proposal." },
    { w: "dramatic", ph: "/drəˈmætɪk/", t: "adj. 戏剧性的;显著的", e: "There was a dramatic change." },
    { w: "duration", ph: "/djuˈreɪʃn/", t: "n. 持续时间", e: "The duration of the flight is 2 hours." },
    { w: "elaborate", ph: "/ɪˈlæbərət/", t: "adj. 精细的;v. 详细说明", e: "Can you elaborate on that?" },
    { w: "eliminate", ph: "/ɪˈlɪmɪneɪt/", t: "v. 消除;淘汰", e: "We eliminated the errors." },
    { w: "embrace", ph: "/ɪmˈbreɪs/", t: "v. 拥抱;接受", e: "Embrace new technology." },
    { w: "emerge", ph: "/ɪˈmɜːdʒ/", t: "v. 出现;浮现", e: "New ideas emerged." },
    { w: "emphasize", ph: "/ˈemfəsaɪz/", t: "v. 强调;着重", e: "She emphasized the importance." },
    { w: "endeavor", ph: "/ɪnˈdevər/", t: "n./v. 努力;尽力", e: "We endeavor to succeed." },
    { w: "enhance", ph: "/ɪnˈhɑːns/", t: "v. 增强;提高", e: "Music enhances the mood." },
    { w: "enormous", ph: "/ɪˈnɔːməs/", t: "adj. 巨大的", e: "The elephant is enormous." },
    { w: "ensure", ph: "/ɪnˈʃʊər/", t: "v. 确保;保证", e: "We ensure quality." },
    { w: "entitle", ph: "/ɪnˈtaɪtl/", t: "v. 授权;给…权利", e: "You are entitled to a refund." },
    { w: "equivalent", ph: "/ɪˈkwɪvələnt/", t: "adj. 等价的;n. 等价物", e: "One dollar is equivalent to 7 RMB." },
    { w: "erode", ph: "/ɪˈrəʊd/", t: "v. 侵蚀;腐蚀", e: "Wind erodes the rocks." },
    { w: "essential", ph: "/ɪˈsenʃl/", t: "adj. 必要的;本质的", e: "Water is essential for life." },
    { w: "establish", ph: "/ɪˈstæblɪʃ/", t: "v. 建立;确立", e: "They established a company." },
    { w: "evaluate", ph: "/ɪˈvæljueɪt/", t: "v. 评估;评价", e: "We evaluate the results." },
    { w: "evident", ph: "/ˈevɪdənt/", t: "adj. 明显的", e: "It is evident that he lied." },
    { w: "evolve", ph: "/ɪˈvɒlv/", t: "v. 进化;演变", e: "Technology evolves rapidly." },
    { w: "exaggerate", ph: "/ɪɡˈzædʒəreɪt/", t: "v. 夸大;夸张", e: "Don't exaggerate the problem." },
    { w: "exceed", ph: "/ɪkˈsiːd/", t: "v. 超过;超出", e: "The cost exceeded our budget." },
    { w: "exclude", ph: "/ɪkˈskluːd/", t: "v. 排除;排斥", e: "They excluded him from the team." },
    { w: "exhibit", ph: "/ɪɡˈzɪbɪt/", t: "v. 展览;显示", e: "She exhibited her paintings." },
    { w: "expand", ph: "/ɪkˈspænd/", t: "v. 扩大;扩展", e: "The company expanded overseas." },
    { w: "explicit", ph: "/ɪkˈsplɪsɪt/", t: "adj. 明确的;直白的", e: "She gave explicit instructions." },
    { w: "exploit", ph: "/ɪkˈsplɔɪt/", t: "v. 利用;开发;剥削", e: "We exploit renewable energy." },
    { w: "expose", ph: "/ɪkˈspəʊz/", t: "v. 暴露;揭露", e: "Don't expose skin to the sun." },
    { w: "extend", ph: "/ɪkˈstend/", t: "v. 延伸;扩大", e: "They extended the deadline." },
    { w: "extract", ph: "/ɪkˈstrækt/", t: "v. 提取;摘录", e: "They extract oil from the ground." },
    // ===== 考研核心词汇 F-H =====
    { w: "fabricate", ph: "/ˈfæbrɪkeɪt/", t: "v. 编造;制造", e: "He fabricated the story." },
    { w: "facilitate", ph: "/fəˈsɪlɪteɪt/", t: "v. 促进;使便利", e: "Technology facilitates learning." },
    { w: "factor", ph: "/ˈfæktər/", t: "n. 因素", e: "Money is a key factor." },
    { w: "fade", ph: "/feɪd/", t: "v. 褪色;消失", e: "The color faded in the sun." },
    { w: "feasible", ph: "/ˈfiːzəbl/", t: "adj. 可行的", e: "The plan is feasible." },
    { w: "feature", ph: "/ˈfiːtʃər/", t: "n. 特征;v. 以…为特色", e: "The phone features a new camera." },
    { w: "federal", ph: "/ˈfedərəl/", t: "adj. 联邦的", e: "The federal government decided." },
    { w: "fluctuate", ph: "/ˈflʌktʃueɪt/", t: "v. 波动;起伏", e: "Prices fluctuate daily." },
    { w: "focus", ph: "/ˈfəʊkəs/", t: "n. 焦点;v. 集中", e: "Focus on your studies." },
    { w: "formulate", ph: "/ˈfɔːmjəleɪt/", t: "v. 制定;系统阐述", e: "They formulated a strategy." },
    { w: "fragment", ph: "/ˈfræɡmənt/", t: "n. 碎片;v. 分裂", e: "The vase broke into fragments." },
    { w: "framework", ph: "/ˈfreɪmwɜːk/", t: "n. 框架;体系", e: "We need a legal framework." },
    { w: "function", ph: "/ˈfʌŋkʃn/", t: "n. 功能;v. 运行", e: "The heart functions well." },
    { w: "fundamental", ph: "/ˌfʌndəˈmentl/", t: "adj. 基本的;根本的", e: "Freedom is a fundamental right." },
    { w: "generate", ph: "/ˈdʒenəreɪt/", t: "v. 产生;生成", e: "Wind generates power." },
    { w: "genuine", ph: "/ˈdʒenjuɪn/", t: "adj. 真正的;真诚的", e: "She showed genuine concern." },
    { w: "guarantee", ph: "/ˌɡærənˈtiː/", t: "v./n. 保证;担保", e: "We guarantee satisfaction." },
    { w: "handle", ph: "/ˈhændl/", t: "v. 处理;n. 把手", e: "She handled the crisis." },
    { w: "highlight", ph: "/ˈhaɪlaɪt/", t: "v. 强调;突出", e: "The report highlights the issue." },
    { w: "hypothesis", ph: "/haɪˈpɒθəsɪs/", t: "n. 假设;假说", e: "The hypothesis was proven." },
    // ===== 考研核心词汇 I-N =====
    { w: "identical", ph: "/aɪˈdentɪkl/", t: "adj. 完全相同的", e: "The twins are identical." },
    { w: "identify", ph: "/aɪˈdentɪfaɪ/", t: "v. 识别;确认", e: "She identified the suspect." },
    { w: "ignite", ph: "/ɪɡˈnaɪt/", t: "v. 点燃;激发", e: "A spark ignited the fire." },
    { w: "illuminate", ph: "/ɪˈluːmɪneɪt/", t: "v. 照亮;阐明", e: "The lamp illuminates the room." },
    { w: "illustrate", ph: "/ˈɪləstreɪt/", t: "v. 说明;举例", e: "Let me illustrate with an example." },
    { w: "imitate", ph: "/ˈɪmɪteɪt/", t: "v. 模仿", e: "Children imitate their parents." },
    { w: "immense", ph: "/ɪˈmens/", t: "adj. 巨大的", e: "The ocean is immense." },
    { w: "impact", ph: "/ˈɪmpækt/", t: "n. 影响;v. 冲击", e: "Technology has a huge impact." },
    { w: "implement", ph: "/ˈɪmplɪment/", t: "v. 实施;n. 工具", e: "We implement the new policy." },
    { w: "imply", ph: "/ɪmˈplaɪ/", t: "v. 暗示;意味", e: "What do you imply?" },
    { w: "impose", ph: "/ɪmˈpəʊz/", t: "v. 强加;征收", e: "The government imposed taxes." },
    { w: "incentive", ph: "/ɪnˈsentɪv/", t: "n. 激励;刺激", e: "Money is a strong incentive." },
    { w: "incorporate", ph: "/ɪnˈkɔːpəreɪt/", t: "v. 包含;合并", e: "The plan incorporates new ideas." },
    { w: "indicate", ph: "/ˈɪndɪkeɪt/", t: "v. 表明;指示", e: "The data indicates growth." },
    { w: "induce", ph: "/ɪnˈdjuːs/", t: "v. 诱导;引起", e: "Stress can induce illness." },
    { w: "inevitable", ph: "/ɪnˈevɪtəbl/", t: "adj. 不可避免的", e: "Change is inevitable." },
    { w: "inferior", ph: "/ɪnˈfɪəriər/", t: "adj. 下级的;差的", e: "The product is inferior." },
    { w: "influence", ph: "/ˈɪnfluəns/", t: "n./v. 影响", e: "Parents influence children." },
    { w: "infrastructure", ph: "/ˈɪnfrəstrʌktʃər/", t: "n. 基础设施", e: "The country needs better infrastructure." },
    { w: "initiate", ph: "/ɪˈnɪʃieɪt/", t: "v. 开始;发起", e: "She initiated the project." },
    { w: "innovation", ph: "/ˌɪnəˈveɪʃn/", t: "n. 创新;改革", e: "Innovation drives progress." },
    { w: "input", ph: "/ˈɪnpʊt/", t: "n./v. 输入", e: "We need your input." },
    { w: "insert", ph: "/ɪnˈsɜːt/", t: "v. 插入", e: "Insert the key into the lock." },
    { w: "inspect", ph: "/ɪnˈspekt/", t: "v. 检查;视察", e: "They inspected the building." },
    { w: "inspire", ph: "/ɪnˈspaɪər/", t: "v. 鼓舞;启发", e: "She inspires her students." },
    { w: "institute", ph: "/ˈɪnstɪtjuːt/", t: "n. 机构;v. 建立", e: "He works at a research institute." },
    { w: "integrate", ph: "/ˈɪntɪɡreɪt/", t: "v. 整合;融入", e: "We integrate technology into education." },
    { w: "intense", ph: "/ɪnˈtens/", t: "adj. 强烈的;激烈的", e: "The competition is intense." },
    { w: "interact", ph: "/ˌɪntərˈækt/", t: "v. 互动;交流", e: "Students interact with each other." },
    { w: "interpret", ph: "/ɪnˈtɜːprɪt/", t: "v. 解释;口译", e: "She interprets for the visitors." },
    { w: "intervene", ph: "/ˌɪntəˈviːn/", t: "v. 干预;介入", e: "The government intervened." },
    { w: "intrinsic", ph: "/ɪnˈtrɪnzɪk/", t: "adj. 内在的;本质的", e: "The intrinsic value of art." },
    { w: "investigate", ph: "/ɪnˈvestɪɡeɪt/", t: "v. 调查;研究", e: "Police investigate the crime." },
    { w: "involve", ph: "/ɪnˈvɒlv/", t: "v. 包含;涉及", e: "The job involves travel." },
    { w: "isolate", ph: "/ˈaɪsəleɪt/", t: "v. 隔离;使孤立", e: "They isolated the virus." },
    { w: "justify", ph: "/ˈdʒʌstɪfaɪ/", t: "v. 证明…正当", e: "He justified his action." },
    { w: "launch", ph: "/lɔːntʃ/", t: "v. 发起;发射;n. 发布", e: "They launched a new product." },
    { w: "legitimate", ph: "/lɪˈdʒɪtɪmət/", t: "adj. 合法的;合理的", e: "It's a legitimate concern." },
    { w: "liability", ph: "/ˌlaɪəˈbɪləti/", t: "n. 责任;债务", e: "The company has no liability." },
    { w: "literacy", ph: "/ˈlɪtərəsi/", t: "n. 读写能力", e: "Digital literacy is important." },
    { w: "lucrative", ph: "/ˈluːkrətɪv/", t: "adj. 获利丰厚的", e: "It's a lucrative business." },
    { w: "maintain", ph: "/meɪnˈteɪn/", t: "v. 维持;保养", e: "We maintain the equipment." },
    { w: "manipulate", ph: "/məˈnɪpjuleɪt/", t: "v. 操纵;操作", e: "He manipulated the data." },
    { w: "mechanism", ph: "/ˈmekənɪzəm/", t: "n. 机制;机械装置", e: "The market mechanism works." },
    { w: "mediate", ph: "/ˈmiːdieɪt/", t: "v. 调解;斡旋", e: "She mediated the dispute." },
    { w: "modify", ph: "/ˈmɒdɪfaɪ/", t: "v. 修改;调整", e: "We need to modify the plan." },
    { w: "monitor", ph: "/ˈmɒnɪtər/", t: "v. 监控;n. 显示器", e: "Doctors monitor the patient." },
    { w: "motivate", ph: "/ˈməʊtɪveɪt/", t: "v. 激励;激发", e: "What motivates you?" },
    { w: "negotiate", ph: "/nɪˈɡəʊʃieɪt/", t: "v. 谈判;协商", e: "They negotiated a deal." },
    { w: "neutral", ph: "/ˈnjuːtrəl/", t: "adj. 中立的", e: "Switzerland is neutral." },
    { w: "norm", ph: "/nɔːm/", t: "n. 规范;标准", e: "It's against social norms." },
    { w: "notion", ph: "/ˈnəʊʃn/", t: "n. 概念;观念", e: "He has no notion of time." },
    // ===== 考研核心词汇 O-R =====
    { w: "objective", ph: "/əbˈdʒektɪv/", t: "n. 目标;adj. 客观的", e: "Our objective is clear." },
    { w: "obstacle", ph: "/ˈɒbstəkl/", t: "n. 障碍;阻碍", e: "Fear is a big obstacle." },
    { w: "obtain", ph: "/əbˈteɪn/", t: "v. 获得", e: "She obtained a degree." },
    { w: "occupy", ph: "/ˈɒkjupaɪ/", t: "v. 占据;使忙碌", e: "Reading occupies my time." },
    { w: "offset", ph: "/ˈɒfset/", t: "v. 抵消;补偿", e: "Gains offset the losses." },
    { w: "orient", ph: "/ˈɔːrient/", t: "v. 定向;适应", e: "She oriented herself in the city." },
    { w: "origin", ph: "/ˈɒrɪdʒɪn/", t: "n. 起源;出身", e: "The origin of the universe." },
    { w: "outcome", ph: "/ˈaʊtkʌm/", t: "n. 结果;成果", e: "The outcome was positive." },
    { w: "outline", ph: "/ˈaʊtlaɪn/", t: "n. 概要;v. 概述", e: "She outlined the plan." },
    { w: "overall", ph: "/ˌəʊvərˈɔːl/", t: "adj. 全面的;总的", e: "The overall result is good." },
    { w: "overlook", ph: "/ˌəʊvəˈlʊk/", t: "v. 忽略;俯瞰", e: "Don't overlook the details." },
    { w: "participate", ph: "/pɑːˈtɪsɪpeɪt/", t: "v. 参与;参加", e: "Everyone participated." },
    { w: "perceive", ph: "/pəˈsiːv/", t: "v. 察觉;理解", e: "She perceived a change." },
    { w: "persist", ph: "/pəˈsɪst/", t: "v. 坚持;持续", e: "He persisted despite difficulties." },
    { w: "phenomenon", ph: "/fəˈnɒmɪnən/", t: "n. 现象", e: "Rain is a natural phenomenon." },
    { w: "potential", ph: "/pəˈtenʃl/", t: "adj. 潜在的;n. 潜力", e: "She has great potential." },
    { w: "predominant", ph: "/prɪˈdɒmɪnənt/", t: "adj. 主要的;占优势的", e: "English is the predominant language." },
    { w: "preserve", ph: "/prɪˈzɜːv/", t: "v. 保存;保护", e: "We preserve ancient buildings." },
    { w: "prevail", ph: "/prɪˈveɪl/", t: "v. 盛行;获胜", e: "Justice will prevail." },
    { w: "primary", ph: "/ˈpraɪməri/", t: "adj. 首要的;初级的", e: "Safety is our primary concern." },
    { w: "principle", ph: "/ˈprɪnsəpl/", t: "n. 原则;原理", e: "He sticks to his principles." },
    { w: "priority", ph: "/praɪˈɒrəti/", t: "n. 优先;优先权", e: "Health is a top priority." },
    { w: "proceed", ph: "/prəˈsiːd/", t: "v. 继续进行", e: "Please proceed with caution." },
    { w: "promote", ph: "/prəˈməʊt/", t: "v. 促进;晋升", e: "She was promoted to manager." },
    { w: "propose", ph: "/prəˈpəʊz/", t: "v. 提议;求婚", e: "He proposed a new theory." },
    { w: "prospect", ph: "/ˈprɒspekt/", t: "n. 前景;预期", e: "Job prospects are good." },
    { w: "pursue", ph: "/pəˈsjuː/", t: "v. 追求;追赶", e: "She pursues her dreams." },
    { w: "qualify", ph: "/ˈkwɒlɪfaɪ/", t: "v. 使有资格", e: "She qualified for the team." },
    { w: "range", ph: "/reɪndʒ/", t: "n. 范围;v. 变化", e: "Prices range from $10 to $50." },
    { w: "rate", ph: "/reɪt/", t: "n. 比率;速度;v. 评价", e: "The birth rate is declining." },
    { w: "recognize", ph: "/ˈrekəɡnaɪz/", t: "v. 认出;承认", e: "I didn't recognize you." },
    { w: "recommend", ph: "/ˌrekəˈmend/", t: "v. 推荐;建议", e: "I recommend this book." },
    { w: "recover", ph: "/rɪˈkʌvər/", t: "v. 恢复;康复", e: "She recovered from the illness." },
    { w: "reflect", ph: "/rɪˈflekt/", t: "v. 反映;反思", e: "The mirror reflects light." },
    { w: "reform", ph: "/rɪˈfɔːm/", t: "n./v. 改革;改良", e: "Education needs reform." },
    { w: "regulate", ph: "/ˈreɡjuleɪt/", t: "v. 管理;调节", e: "The government regulates prices." },
    { w: "reinforce", ph: "/ˌriːɪnˈfɔːs/", t: "v. 加强;增援", e: "Praise reinforces good behavior." },
    { w: "release", ph: "/rɪˈliːs/", t: "v. 释放;发布", e: "They released a new album." },
    { w: "relevant", ph: "/ˈreləvənt/", t: "adj. 相关的", e: "This information is relevant." },
    { w: "reluctant", ph: "/rɪˈlʌktənt/", t: "adj. 勉强的;不情愿的", e: "She was reluctant to leave." },
    { w: "render", ph: "/ˈrendər/", t: "v. 使得;提供", e: "The bomb rendered the building useless." },
    { w: "replace", ph: "/rɪˈpleɪs/", t: "v. 替换;取代", e: "Machines replace human labor." },
    { w: "represent", ph: "/ˌreprɪˈzent/", t: "v. 代表;表示", e: "She represents our company." },
    { w: "resolve", ph: "/rɪˈzɒlv/", t: "v. 解决;决定", e: "We resolved the issue." },
    { w: "respond", ph: "/rɪˈspɒnd/", t: "v. 回应;反应", e: "She responded quickly." },
    { w: "restrict", ph: "/rɪˈstrɪkt/", t: "v. 限制;约束", e: "They restrict access." },
    { w: "retain", ph: "/rɪˈteɪn/", t: "v. 保留;保持", e: "She retains her accent." },
    { w: "reveal", ph: "/rɪˈviːl/", t: "v. 揭示;透露", e: "The study reveals new findings." },
    { w: "reverse", ph: "/rɪˈvɜːs/", t: "v. 反转;adj. 相反的", e: "They reversed the decision." },
    { w: "revolution", ph: "/ˌrevəˈluːʃn/", t: "n. 革命;变革", e: "The digital revolution." },
    // ===== 考研核心词汇 S-Z =====
    { w: "scenario", ph: "/səˈnɑːriəʊ/", t: "n. 场景;情景", e: "Consider the worst scenario." },
    { w: "schedule", ph: "/ˈʃedjuːl/", t: "n. 时间表;v. 安排", e: "Check the schedule." },
    { w: "secure", ph: "/sɪˈkjʊər/", t: "adj. 安全的;v. 获得", e: "She secured a job." },
    { w: "shift", ph: "/ʃɪft/", t: "n./v. 转移;改变", e: "There's a shift in policy." },
    { w: "significant", ph: "/sɪɡˈnɪfɪkənt/", t: "adj. 重要的;显著的", e: "There's a significant difference." },
    { w: "simulate", ph: "/ˈsɪmjuleɪt/", t: "v. 模拟;模仿", e: "The software simulates flight." },
    { w: "simultaneous", ph: "/ˌsɪmlˈteɪniəs/", t: "adj. 同时的", e: "Simultaneous translation." },
    { w: "sophisticated", ph: "/səˈfɪstɪkeɪtɪd/", t: "adj. 复杂的;精密的", e: "A sophisticated system." },
    { w: "specify", ph: "/ˈspesɪfaɪ/", t: "v. 明确;指定", e: "Please specify your requirements." },
    { w: "stable", ph: "/ˈsteɪbl/", t: "adj. 稳定的", e: "The economy is stable." },
    { w: "statistic", ph: "/stəˈtɪstɪk/", t: "n. 统计数据", e: "The statistics show growth." },
    { w: "strategy", ph: "/ˈstrætədʒi/", t: "n. 策略;战略", e: "We need a new strategy." },
    { w: "stress", ph: "/stres/", t: "n. 压力;v. 强调", e: "Stress affects health." },
    { w: "subsequent", ph: "/ˈsʌbsɪkwənt/", t: "adj. 随后的", e: "Subsequent events proved him right." },
    { w: "substance", ph: "/ˈsʌbstəns/", t: "n. 物质;实质", e: "Sugar is a harmful substance." },
    { w: "sufficient", ph: "/səˈfɪʃnt/", t: "adj. 充足的", e: "We have sufficient food." },
    { w: "summarize", ph: "/ˈsʌməraɪz/", t: "v. 总结;概述", e: "Please summarize the article." },
    { w: "supplement", ph: "/ˈsʌplɪment/", t: "n. 补充;v. 增补", e: "Vitamins supplement the diet." },
    { w: "survey", ph: "/ˈsɜːveɪ/", t: "n. 调查;v. 考察", e: "We conducted a survey." },
    { w: "survive", ph: "/səˈvaɪv/", t: "v. 生存;幸存", e: "Only three survived." },
    { w: "sustain", ph: "/səˈsteɪn/", t: "v. 维持;承受", e: "She sustained the injury." },
    { w: "tackle", ph: "/ˈtækl/", t: "v. 处理;应付", e: "We must tackle the problem." },
    { w: "target", ph: "/ˈtɑːɡɪt/", t: "n. 目标;v. 瞄准", e: "We hit our sales target." },
    { w: "tendency", ph: "/ˈtendənsi/", t: "n. 倾向;趋势", e: "There's a tendency to overspend." },
    { w: "terminate", ph: "/ˈtɜːmɪneɪt/", t: "v. 终止;结束", e: "They terminated the contract." },
    { w: "theory", ph: "/ˈθɪəri/", t: "n. 理论;学说", e: "In theory, it should work." },
    { w: "transfer", ph: "/trænsˈfɜːr/", t: "v. 转移;转让", e: "She transferred to another school." },
    { w: "transform", ph: "/trænsˈfɔːm/", t: "v. 转变;改造", e: "Technology transformed our lives." },
    { w: "transmit", ph: "/trænsˈmɪt/", t: "v. 传输;传播", e: "Mosquitoes transmit disease." },
    { w: "trend", ph: "/trend/", t: "n. 趋势;潮流", e: "The trend is upward." },
    { w: "trigger", ph: "/ˈtrɪɡər/", t: "v. 触发;引起", e: "Stress triggers headaches." },
    { w: "undergo", ph: "/ˌʌndəˈɡəʊ/", t: "v. 经历;遭受", e: "The company underwent changes." },
    { w: "underline", ph: "/ˌʌndəˈlaɪn/", t: "v. 强调;在…下划线", e: "She underlined the key word." },
    { w: "undertake", ph: "/ˌʌndəˈteɪk/", t: "v. 承担;从事", e: "He undertook the task." },
    { w: "unique", ph: "/juˈniːk/", t: "adj. 独特的", e: "Each person is unique." },
    { w: "upgrade", ph: "/ˌʌpˈɡreɪd/", t: "v. 升级", e: "We upgraded the software." },
    { w: "utilize", ph: "/ˈjuːtəlaɪz/", t: "v. 利用", e: "We utilize solar energy." },
    { w: "valid", ph: "/ˈvælɪd/", t: "adj. 有效的;合理的", e: "The ticket is valid." },
    { w: "vanish", ph: "/ˈvænɪʃ/", t: "v. 消失;突然不见", e: "The money vanished." },
    { w: "vary", ph: "/ˈveəri/", t: "v. 变化;不同", e: "Opinions vary on this topic." },
    { w: "verify", ph: "/ˈverɪfaɪ/", t: "v. 核实;证实", e: "Please verify the information." },
    { w: "violate", ph: "/ˈvaɪəleɪt/", t: "v. 违反;侵犯", e: "He violated the law." },
    { w: "virtual", ph: "/ˈvɜːtʃuəl/", t: "adj. 虚拟的;实际的", e: "Virtual reality is amazing." },
    { w: "volume", ph: "/ˈvɒljuːm/", t: "n. 体积;音量;卷", e: "Turn up the volume." },
    { w: "warrant", ph: "/ˈwɒrənt/", t: "v. 保证;n. 许可证", e: "The results warrant further study." },
    { w: "yield", ph: "/jiːld/", t: "v. 产出;屈服;n. 产量", e: "The tree yields apples." },
  ];
  function renderVocab() {
    const root = $("mod-vocab");
    const vs = state.data.vocabState;
    const total = SAMPLE_VOCAB.length;
    const cur = SAMPLE_VOCAB[vs.idx % total];
    const learned = getMod("vocabLearned");
    const hard = getMod("vocabHard");
    const round = vs.round || 1;
    let html = `<div class="mod-stats">
      <div class="mod-stat"><div class="mod-stat-label">今日轮次</div><div class="mod-stat-value">${round}/3</div></div>
      <div class="mod-stat"><div class="mod-stat-label">已学</div><div class="mod-stat-value">${learned.length}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">生词本</div><div class="mod-stat-value">${hard.length}</div></div>
    </div>`;
    const modeText = ["第一轮:新词学习(看释义记单词)", "第二轮:认词测试(只看词猜释义)", "第三轮:拼写填空(看释义拼单词)"][round - 1] || "第一轮";
    html += `<div class="vocab-card">
      <div><span class="vocab-word" id="vw"></span><span class="vocab-phon" id="vp"></span>
      <button class="icon-btn" id="v-speak" style="vertical-align:middle">🔊</button>
      <span class="ai-badge">第${vs.idx + 1}词 · ${modeText}</span></div>
      <div class="vocab-trans" id="vt"></div>
      <div class="vocab-example" id="ve"></div>`;
    // 第三轮:拼写输入框
    if (round === 3) {
      html += `<div style="margin-top:10px"><input type="text" id="v-spell" placeholder="根据上面释义,拼写英文单词..." style="width:100%;font-size:15px;padding:10px 12px"><div id="v-spell-result" style="margin-top:6px;font-size:13px"></div></div>`;
    }
    // 第二轮:默认隐藏释义,点按钮才显示
    if (round === 2) {
      html += `<div style="margin-top:8px"><button class="btn btn-ghost" id="v-reveal" style="padding:6px 14px">👁 显示释义</button></div>`;
    }
    html += `</div>`;
    html += `<div class="timer-controls" style="margin-bottom:14px">
      <button class="btn btn-ghost" id="v-hard">加入生词本</button>
      <button class="btn btn-primary" id="v-next">${round === 3 ? "下一个" : "认识,下一个"}</button>
    </div>`;
    html += `<div class="muted" style="font-size:12px">词库共 ${SAMPLE_VOCAB.length} 词,覆盖考研核心词汇 A-Z。三轮刷词:新词学习 → 认词测试 → 拼写填空。生词本自动收录不熟的词。</div>`;
    root.innerHTML = html;
    $("vw").textContent = cur.w; $("vp").textContent = cur.ph;
    // 第二轮默认隐藏释义/例句,第三轮隐藏单词本身(只显示音标)
    if (round === 2) {
      $("vt").textContent = "??? 看单词想想释义,点「显示释义」核对";
      $("vt").style.color = "var(--text-mute)";
      $("ve").textContent = "";
    } else if (round === 3) {
      $("vw").textContent = "???";
      $("vw").style.color = "var(--text-mute)";
      $("vt").textContent = cur.t;
      $("ve").textContent = "";
    } else {
      $("vt").textContent = cur.t; $("ve").textContent = cur.e;
    }
    $("v-speak").addEventListener("click", () => speak(cur.w));
    const revealBtn = $("v-reveal");
    if (revealBtn) revealBtn.addEventListener("click", () => {
      $("vt").textContent = cur.t; $("vt").style.color = "";
      $("ve").textContent = cur.e;
      revealBtn.textContent = "✓ 已显示释义";
      revealBtn.disabled = true;
    });
    const spellInput = $("v-spell");
    if (spellInput) {
      spellInput.addEventListener("input", () => {
        const val = spellInput.value.trim().toLowerCase();
        const target = cur.w.toLowerCase();
        const result = $("v-spell-result");
        if (!val) { result.textContent = ""; result.style.color = ""; return; }
        if (val === target) {
          result.textContent = "✅ 正确!"; result.style.color = "var(--done)";
        } else if (target.startsWith(val) || val.length < target.length) {
          result.textContent = "继续输入... (" + val.length + "/" + target.length + ")"; result.style.color = "var(--text-sub)";
        } else {
          result.textContent = "❌ 拼错,正确:" + cur.w; result.style.color = "var(--danger)";
        }
      });
      spellInput.addEventListener("keypress", (e) => { if (e.key === "Enter") $("v-next").click(); });
    }
    $("v-hard").addEventListener("click", () => {
      const h = getMod("vocabHard");
      if (!h.find((x) => x.w === cur.w)) { h.push({ ...cur, addedAt: Date.now() }); setMod("vocabHard", h); toast("已加入生词本"); }
      else toast("已在生词本中");
      nextVocab();
    });
    $("v-next").addEventListener("click", () => {
      const l = getMod("vocabLearned");
      if (!l.find((x) => x.w === cur.w)) { l.push({ ...cur, at: Date.now() }); setMod("vocabLearned", l); }
      nextVocab();
    });
  }
  function nextVocab() {
    const vs = state.data.vocabState;
    vs.idx++;
    if (vs.idx >= SAMPLE_VOCAB.length) { vs.idx = 0; vs.round = vs.round >= 3 ? 1 : vs.round + 1; }
    saveData(); renderVocab();
  }

  /* ============================================================
   * 英语口语(骨架:话题 + 评分占位)
   * ============================================================ */
  function initSpeaking() {
    const root = $("mod-speaking");
    if (!root) return;
    $("desc-speaking").textContent = "35个雅思话题 Part1/2/3,语音输入 + AI 评分";
    MODULE_RENDER.speaking = renderSpeaking;
    renderSpeaking();
  }
  const SPEAKING_TOPICS = [
    // ===== Part 1: 个人问答 =====
    { part: 1, q: "Describe a person you admire.", tip: "用一般现在时,描述性格品质和原因" },
    { part: 1, q: "Talk about your favorite hobby.", tip: "说明爱好是什么、何时开始、为什么喜欢" },
    { part: 1, q: "Describe a memorable trip.", tip: "用过去时,描述地点、经历和感受" },
    { part: 1, q: "Discuss the importance of education.", tip: "从个人和社会两个角度展开" },
    { part: 1, q: "Describe a goal you want to achieve.", tip: "用将来时,说明目标和计划" },
    { part: 1, q: "What do you do in your free time?", tip: "列举2-3个活动,说明原因" },
    { part: 1, q: "Tell me about your hometown.", tip: "描述地理位置、特色和文化" },
    { part: 1, q: "What kind of food do you like?", tip: "举例说明喜欢的食物及原因" },
    { part: 1, q: "Do you prefer reading books or watching movies?", tip: "选择一方,给出理由和例子" },
    { part: 1, q: "How do you usually spend your weekends?", tip: "描述周末的典型安排" },
    { part: 1, q: "What is your favorite season and why?", tip: "描述季节特点和个人感受" },
    { part: 1, q: "Do you like cooking? Why or why not?", tip: "表达观点并给出原因" },
    { part: 1, q: "What kind of music do you enjoy?", tip: "说明音乐类型、原因和感受" },
    { part: 1, q: "Describe your daily routine.", tip: "按时间顺序描述一天的活动" },
    { part: 1, q: "What subject did you like most in school?", tip: "用过去时,说明科目和原因" },
    // ===== Part 2: 个人陈述 =====
    { part: 2, q: "Describe a time when you faced a difficult challenge. You should say: what the challenge was, when it happened, how you dealt with it, and what you learned from it.", tip: "2分钟独白,用过去时,结构:背景→经过→结果→感悟" },
    { part: 2, q: "Describe a book that had a significant impact on you. You should say: what the book is about, when you read it, why it impacted you, and how it changed your thinking.", tip: "先概述内容,再谈个人感受和改变" },
    { part: 2, q: "Describe a person who has influenced you the most. You should say: who they are, how you know them, what they are like, and why they influenced you.", tip: "用具体事例说明对方的影响" },
    { part: 2, q: "Describe a place you would like to visit in the future. You should say: where it is, why you want to go there, what you would do there, and when you plan to go.", tip: "用条件句和将来时,描述期待和计划" },
    { part: 2, q: "Describe an important decision you made. You should say: what the decision was, when you made it, why you made it, and what the result was.", tip: "展现决策过程和反思" },
    { part: 2, q: "Describe a skill you would like to learn. You should say: what the skill is, why you want to learn it, how you would learn it, and how it would benefit you.", tip: "说明动机、计划和预期收益" },
    { part: 2, q: "Describe a memorable event in your life. You should say: what the event was, when it happened, who was there, and why it was memorable.", tip: "用感官细节让叙述更生动" },
    { part: 2, q: "Describe a piece of technology you find useful. You should say: what it is, how long you have used it, what you use it for, and why it is useful.", tip: "举例说明日常使用场景" },
    { part: 2, q: "Describe a time when you helped someone. You should say: who you helped, how you helped them, why you helped them, and how you felt about it.", tip: "用过去时,强调帮助的过程和感受" },
    { part: 2, q: "Describe a goal you set and tried hard to achieve. You should say: what the goal was, when you set it, what you did to achieve it, and whether you succeeded.", tip: "展现努力过程,无论成功与否" },
    { part: 2, q: "Describe an interesting conversation you had. You should say: who you talked with, what you talked about, when it happened, and why it was interesting.", tip: "转述对话内容,展现交流深度" },
    // ===== Part 3: 深度讨论 =====
    { part: 3, q: "Do you think technology has improved our lives? Why or why not?", tip: "正反论证,举例说明利弊" },
    { part: 3, q: "Should universities focus more on practical skills or theoretical knowledge?", tip: "比较两个方面,给出个人立场" },
    { part: 3, q: "How has social media changed the way people communicate?", tip: "对比过去和现在,分析影响" },
    { part: 3, q: "What are the advantages and disadvantages of working from home?", tip: "分别讨论利弊,给出平衡观点" },
    { part: 3, q: "Do you think advertising has a positive or negative effect on society?", tip: "分析正反两面,给出明确立场" },
    { part: 3, q: "How can schools better prepare students for the future?", tip: "提出建议,说明理由" },
    { part: 3, q: "Is it better to live in a big city or a small town? Why?", tip: "比较两种生活方式,给出偏好" },
    { part: 3, q: "What role does art play in modern society?", tip: "从文化和个人角度讨论艺术价值" },
    { part: 3, q: "Do you think people today are healthier than in the past?", tip: "对比不同时代,分析原因" },
    { part: 3, q: "How important is it to learn a foreign language?", tip: "从职业、文化、认知角度展开" },
  ];
  function renderSpeaking() {
    const root = $("mod-speaking");
    const idx = state.data.speakIdx || 0;
    const topicObj = SPEAKING_TOPICS[idx % SPEAKING_TOPICS.length];
    const topicQ = typeof topicObj === "string" ? topicObj : topicObj.q;
    const topicPart = typeof topicObj === "string" ? 2 : topicObj.part;
    const topicTip = typeof topicObj === "string" ? "" : topicObj.tip;
    const logs = getMod("speakingLog");
    let html = `<div class="vocab-card"><div class="vocab-word">今日话题</div>
      <div class="vocab-trans" style="margin-top:8px">${escapeHtml(topicQ)}</div>
      <div style="margin-top:8px"><button class="ai-badge">雅思 Part ${topicPart}</button></div>
      ${topicTip ? `<div class="muted" style="margin-top:8px;font-size:12px">💡 ${escapeHtml(topicTip)}</div>` : ""}</div>`;
    html += `<div class="gen-form"><label style="font-size:11px;color:var(--text-sub)">你的回答(可语音输入)</label>
      <textarea id="sp-input" rows="4" placeholder="用英文回答上述话题..."></textarea>
      <div class="gen-form-actions">
        <button class="btn btn-ghost" id="sp-mic">🎤 语音输入</button>
        <button class="btn btn-ghost" id="sp-prev">⬅ 上一个</button>
        <button class="btn btn-ghost" id="sp-next">下一个 ➡</button>
        <button class="btn btn-primary" id="sp-score">AI 评分</button>
      </div></div>`;
    html += `<div id="sp-result" style="margin-bottom:14px"></div>`;
    html += `<div class="muted" style="font-size:12px;margin-bottom:14px">话题库共 ${SPEAKING_TOPICS.length} 个,覆盖雅思 Part 1/2/3。点击「🎤 语音输入」用英文回答——手机端会调起系统录音器录音后由 AI 自动转写(需配置 AI Key),再点「AI 评分」获取四项评分及反馈。</div>`;
    html += `<h3 class="block-title">练习记录(${logs.length})</h3><div class="gen-list">` +
      (logs.length ? logs.slice(0, 10).map((l) => `<div class="gen-card"><div class="gen-card-meta"><span>${l.date}</span><span>总分 ${l.score}</span></div><div class="gen-card-body">${escapeHtml((l.topicQ||l.topic||"").slice(0, 60))}…</div></div>`).join("") : '<div class="muted">暂无记录</div>') + `</div>`;
    root.innerHTML = html;
    $("sp-score").addEventListener("click", async () => {
      const text = $("sp-input").value.trim();
      if (!text) { toast("请输入回答"); return; }
      $("sp-result").innerHTML = '<div class="muted">AI 评分中…</div>';
      const s = await callAI("speaking-feedback", { topic: topicQ, text });
      const total = Math.round((s.pronunciation + s.fluency + s.grammar + s.vocabulary) / 4);
      $("sp-result").innerHTML = `<div class="gen-card"><div class="gen-card-meta"><span>发音 ${s.pronunciation}</span><span>流利 ${s.fluency}</span><span>语法 ${s.grammar}</span><span>词汇 ${s.vocabulary}</span><span class="ai-badge">总分 ${total}</span></div><div class="gen-card-body">${escapeHtml(s.feedback)}</div></div>`;
      const logs = getMod("speakingLog");
      logs.unshift({ id: uid(), date: todayStr(), topic: topicQ, part: topicPart, text, score: total, at: Date.now() });
      setMod("speakingLog", logs);
      renderSpeaking();
      $("sp-input").value = text;
    });
    $("sp-mic").addEventListener("click", startSpeechRec);
    $("sp-prev").addEventListener("click", () => { state.data.speakIdx = Math.max(0, idx - 1); saveData(); renderSpeaking(); });
    $("sp-next").addEventListener("click", () => { state.data.speakIdx = idx + 1; saveData(); renderSpeaking(); });
  }
  let spRecState = null; // { mode: "native"|"recorder"|"file", rec, chunks, timer }
  // 判断当前页面是否为安全上下文(HTTPS/localhost)——非安全上下文下手机浏览器会隐藏 mediaDevices
  function isSecureCtx() {
    return window.isSecureContext || location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  }
  function startSpeechRec() {
    // 防止重复点击:正在录音则停止
    if (spRecState) {
      if (spRecState.mode === "native" && spRecState.rec) { try { spRecState.rec.stop(); } catch {} return; }
      if (spRecState.mode === "recorder" && spRecState.rec && spRecState.rec.state === "recording") { try { spRecState.rec.stop(); } catch {} return; }
    }
    const inputEl = $("sp-input");
    const micBtn = $("sp-mic");
    const setBtn = (txt, rec) => { if (micBtn) { micBtn.textContent = txt; micBtn.classList.toggle("recording", !!rec); } };

    // 方案 A:原生 SpeechRecognition(桌面 Chrome / 部分安卓 Chrome)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      try {
        const r = new SR();
        r.lang = "en-US";
        r.interimResults = true;
        r.continuous = false;
        setBtn("🔴 录音中…(说完停)", true);
        toast("🎤 开始录音,请用英文回答…");
        let finalText = "";
        r.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
          }
          if (inputEl && finalText) inputEl.value = finalText.trim();
        };
        const cleanup = () => { setBtn("🎤 语音输入", false); spRecState = null; };
        r.onerror = (ev) => {
          cleanup();
          if (ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") {
            toast("麦克风权限被拒或不可用,已切换为「录音文件上传」方式", "warn");
            // 自动降级到方案 C(文件录音)
            setTimeout(() => startSpeechRecViaFile(), 300);
          } else if (ev.error === "no-speech") {
            toast("未检测到语音,请重试", "warn");
          } else {
            toast("语音识别失败:" + (ev.error || "未知错误") + ",已切换为录音文件方式", "warn");
            setTimeout(() => startSpeechRecViaFile(), 300);
          }
        };
        r.onend = cleanup;
        r.start();
        spRecState = { mode: "native", rec: r };
        return;
      } catch (e) { /* 回落到方案 B/C */ }
    }

    // 方案 B:MediaRecorder(需安全上下文 + mediaDevices)
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    if (!hasMedia) {
      // 诊断:为什么没有 mediaDevices
      if (!isSecureCtx()) {
        toast("⚠️ 当前为非 HTTPS 页面,手机浏览器禁止访问麦克风。已为你切换为「录音文件上传」方式", "warn");
      } else {
        toast("浏览器不支持麦克风录音,已切换为「录音文件上传」方式", "warn");
      }
      // 方案 C:降级为文件上传录音(手机端最可靠,无需权限)
      startSpeechRecViaFile();
      return;
    }

    // 走方案 B
    const cfg = getAIConfig();
    if (!(cfg.apiKey && cfg.apiKey.trim())) {
      toast("未配置 AI:录音转写需要 AI Key。请到「复盘分析→AI 配置」填入支持 Whisper 的 Key", "warn");
      return;
    }
    setBtn("🔴 录音中…(再次点击结束)", true);
    toast("🎤 开始录音(最长 60 秒),再次点击按钮结束并转写…");
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        const chunks = [];
        const mr = new MediaRecorder(stream);
        const timer = setTimeout(() => { try { mr.stop(); } catch {} }, 60000);
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        mr.onstop = async () => {
          clearTimeout(timer);
          stream.getTracks().forEach((t) => t.stop());
          setBtn("⏳ AI 转写中…", false);
          const blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || "audio/webm" });
          const file = new File([blob], "speech.webm", { type: blob.type });
          toast("🎙 录音结束,正在用 AI 转写…");
          try {
            const text = await callAITranscribe(file);
            if (text && text.trim() && inputEl) {
              inputEl.value = (inputEl.value + " " + text.trim()).trim();
              toast("✅ 语音已转写并填入");
            } else {
              toast("转写结果为空,请重试", "warn");
            }
          } catch (err) {
            toast("AI 转写失败:" + err.message, "warn");
          } finally {
            setBtn("🎤 语音输入", false);
            spRecState = null;
          }
        };
        mr.start();
        spRecState = { mode: "recorder", rec: mr, chunks, timer };
      })
      .catch((err) => {
        setBtn("🎤 语音输入", false);
        spRecState = null;
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          toast("麦克风权限被拒。改用「录音文件上传」方式", "warn");
          startSpeechRecViaFile();
        } else {
          toast("无法访问麦克风:" + err.message + "。改用「录音文件上传」方式", "warn");
          startSpeechRecViaFile();
        }
      });
  }

  // 方案 C:用 <input type="file" accept="audio/*" capture> 调起手机系统录音器
  // 手机端最可靠:由系统原生录音,无需网页权限,录音后上传 AI 转写
  function startSpeechRecViaFile() {
    // 移除可能存在的旧 input
    const old = document.getElementById("sp-audio-input");
    if (old) old.remove();
    const inp = document.createElement("input");
    inp.type = "file";
    inp.id = "sp-audio-input";
    inp.accept = "audio/*";
    inp.setAttribute("capture", ""); // 触发手机端直接录音
    inp.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;overflow:hidden";
    document.body.appendChild(inp);
    toast("📲 请在弹出的录音器中录音,录完会自动转写");
    inp.addEventListener("change", async () => {
      const file = inp.files && inp.files[0];
      if (!file) { toast("未选择录音", "warn"); inp.remove(); return; }
      const inputEl = $("sp-input");
      const micBtn = $("sp-mic");
      // 录音完成后才检查 AI Key(录音本身不需要 AI)
      const cfg = getAIConfig();
      if (!(cfg.apiKey && cfg.apiKey.trim())) {
        toast("录音已保存,但未配置 AI 无法转写。请到「复盘分析→AI 配置」填入支持 Whisper 的 Key 后重试", "warn");
        inp.remove();
        return;
      }
      if (micBtn) { micBtn.textContent = "⏳ AI 转写中…"; micBtn.classList.add("recording"); }
      toast("🎙 录音已接收,正在用 AI 转写…");
      try {
        const text = await callAITranscribe(file);
        if (text && text.trim() && inputEl) {
          inputEl.value = (inputEl.value + " " + text.trim()).trim();
          toast("✅ 语音已转写并填入");
        } else {
          toast("转写结果为空,请重试", "warn");
        }
      } catch (err) {
        toast("AI 转写失败:" + err.message, "warn");
      } finally {
        if (micBtn) { micBtn.textContent = "🎤 语音输入"; micBtn.classList.remove("recording"); }
        inp.remove();
      }
    });
    // 触发录音器
    try { inp.click(); } catch (e) { toast("无法调起录音器,请手动输入", "warn"); }
  }

  /* ============================================================
   * 韩语学习(骨架:字母 + 课程进度)
   * ============================================================ */
  function initKorean() {
    const root = $("mod-korean");
    if (!root) return;
    $("desc-korean").textContent = "30课系统韩语:字母 → 对话 → 实用 → 进阶";
    MODULE_RENDER.korean = renderKorean;
    renderKorean();
  }
  const KOREAN_LESSONS = [
    // ===== 第一阶段:字母与发音 =====
    { t: "1. 辅音字母(자음)", body: "ㄱ(g/k) ㄴ(n) ㄷ(d/t) ㄹ(r/l) ㅁ(m) ㅂ(b/p) ㅅ(s) ㅇ(ng) ㅈ(j) ㅊ(ch) ㅋ(k) ㅌ(t) ㅍ(p) ㅎ(h)", tip: "14个基本辅音,按发音部位分组记忆" },
    { t: "2. 元音字母(모음)", body: "ㅏ(a) ㅑ(ya) ㅓ(eo) ㅕ(yeo) ㅗ(o) ㅛ(yo) ㅜ(u) ㅠ(yu) ㅡ(eu) ㅣ(i)", tip: "10个基本元音,分单元音和双元音" },
    { t: "3. 辅音变体", body: "ㄱ→ㄲ(쌍기역) ㄷ→ㄸ(쌍디귿) ㅂ→ㅃ(쌍비읍) ㅅ→ㅆ(쌍시옷) ㅈ→ㅉ(쌍지읒)", tip: "双辅音,发音更紧更重" },
    { t: "4. 双元音", body: "ㅐ(ae) ㅒ(yae) ㅔ(e) ㅖ(ye) ㅟ(wi) ㅞ(we) ㅙ(wae) ㅚ(oe) ㅢ(ui)", tip: "复合元音,由两个基本元音组合" },
    { t: "5. 基本拼读", body: "가(ga) 나(na) 다(da) 라(ra) 마(ma) 바(ba) 사(sa) 아(a) 자(ja) 차(cha) 카(ka) 타(ta) 파(pa) 하(ha)", tip: "辅音 + ㅏ 的拼读练习" },
    { t: "6. 元音拼读", body: "거(geo) 너(neo) 더(deo) 러(reo) 머(meo) 버(beo) 서(seo) 어(eo) 저(jeo) 처(cheo)", tip: "辅音 + ㅓ 的拼读" },
    { t: "7. 圆形元音", body: "고(go) 노(no) 도(do) 로(ro) 모(mo) 보(bo) 소(so) 오(o) 조(jo) 초(cho) 케(ke)", tip: "辅音 + ㅗ 的拼读" },
    { t: "8. 复合拼读", body: "과(gwa) 교(gyo) 구(gu) 뉴(nyu) 그(geu) 느(neu) 드(deu) 를(reul) 물(mul) 불(bul)", tip: "辅音 + 复合元音" },
    { t: "9. 收音(받침)", body: "ㄱ(k) ㄴ(n) ㄷ(t) ㄹ(l) ㅁ(m) ㅂ(p) ㅅ(t) ㅇ(ng) ㅈ(t) ㅊ(t) ㅋ(k) ㅌ(t) ㅍ(p) ㅎ(t)", tip: "收音在音节末尾,改变发音" },
    { t: "10. 双收音", body: "ㄳ(ks) ㄵ(nj) ㄶ(nh) ㄺ(lk) ㄻ(lm) ㄼ(lb) ㄽ(ls) ㄾ(lt) ㄿ(lp) ㅀ(lh) ㅄ(bs)", tip: "双收音,只发前一个音" },

    // ===== 第二阶段:日常对话 =====
    { t: "11. 问候语(敬语)", body: "안녕하세요 (annyeonghaseyo) 你好\n안녕히 가세요 (annyeonghi gaseyo) 再见(对方走)\n안녕히 계세요 (annyeonghi gyeseyo) 再见(我走)", tip: "敬语,对长辈/陌生人使用" },
    { t: "12. 问候语(非敬语)", body: "안녕 (annyeong) 你好/再见\n밥 먹었어? (bab meogeosseo?) 吃饭了吗?\n잘 지냈어! (jal jinaesseo!) 过得好!", tip: "非敬语,对朋友/晚辈使用" },
    { t: "13. 自我介绍", body: "저는 ___입니다 (jeoneun ___imnida) 我是___\n이름이 뭐예요? (ireumi mwoyeyo?) 你叫什么?\n만나서 반갑습니다 (mannaseo bangapseumnida) 见到你很高兴", tip: "正式自我介绍" },
    { t: "14. 礼貌用语", body: "감사합니다 (gamsahamnida) 谢谢\n천만에요 (cheonmaneyo) 不客气\n죄송합니다 (joesonghamnida) 对不起\n괜찮아요 (gwaenchanaeyo) 没关系", tip: "日常礼貌用语" },
    { t: "15. 数字表达", body: "하나(1) 둘(2) 셋(3) 넷(4) 다섯(5)\n일(1) 이(2) 삼(3) 사(4) 오(5)", tip: "固有数字 vs 汉字数字,使用场景不同" },
    { t: "16. 时间日期", body: "지금 몇 시예요? (jigeum myeot siyeyo?) 现在几点?\n오늘은 ___월 ___일이에요 (oneureun ___wol ___irieyo) 今天是X月X日\n요일: 월 화 수 목 금 토 일", tip: "时间表达:시(点) + 분(分)" },
    { t: "17. 否定表达", body: "안 ___해요 (an ___haeyo) 不做___\n못 ___해요 (mot ___haeyo) 不会做___\n없어요 (eopseoyo) 没有\n몰라요 (mollayo) 不知道", tip: "안表主观否定,못表能力否定" },
    { t: "18. 疑问表达", body: "무엇 (museot) 什么\n어디 (eodi) 哪里\n언제 (eonje) 什么时候\n어떻게 (eotteoke) 怎么\n왜 (wae) 为什么", tip: "5W1H 疑问词" },

    // ===== 第三阶段:实用对话 =====
    { t: "19. 问路", body: "여기가 어디예요? (yeogiga eodieseyo?) 这是哪里?\n___(으)로 가려면 어떻게 가요? (__ro garyeomyeon eotteoke gayo?) 去___怎么走?\n직진하세요 (jikjinaseyo) 直走\n좌회전하세요 (jwahoejeonhaseyo) 左转", tip: "方向+动词的问路表达" },
    { t: "20. 购物", body: "이거 얼마예요? (igeo eolmayeyo?) 这个多少钱?\n비싸요 (bissayo) 贵\n싸요 (ssayo) 便宜\n깎아주세요 (kkagjusepeyo) 请便宜点\n신용카드 되나요? (sinyongkadeu doenayo?) 可以刷卡吗?", tip: "购物常用句" },
    { t: "21. 点餐", body: "메뉴 좀 주세요 (menyu jom juseyo) 请给我菜单\n___ 주문할게요 (__ jumunhalgeyo) 我要点___\n잠깐만요 (jamkkanmanyo) 等一下\n계산해주세요 (gyesanhasepeyo) 结账\n맛있어요 (masisseoyo) 好吃", tip: "餐厅用语" },
    { t: "22. 电话用语", body: "여보세요 (yeoboseyo) 喂\n___(이)세요? (__iseyo?) 是___吗?\n잠시만요 (jamsimanyo) 稍等\n전화번호가 어떻게 되세요? (jeonhwabonhogaga eotteoke doseyo?) 电话号码是?\n끊을게요 (kkeuneulgeyo) 我挂了", tip: "电话开场白" },
    { t: "23. 约会邀约", body: "이번 주말에 뭐 해요? (ibeon jumalre mwo haeyo?) 这周末做什么?\n같이 ___ 하러 가요 (gachi ___ hareo gayo) 一起去做___吧\n시간 있어요? (sigan isseoyo?) 有时间吗?\n약속 잡아요 (yaksok jabayo) 约好哦", tip: "邀约与约定" },
    { t: "24. 情感表达", body: "사랑해요 (saranghaeyo) 我爱你\n좋아해요 (joahaeyo) 我喜欢你\n보고 싶어요 (bogo sipeoyo) 我想你\n걱정해요 (geokjeonghaeyo) 我担心\n기뻐요 (gippeyo) 我开心", tip: "情感表达词汇" },

    // ===== 第四阶段:进阶表达 =====
    { t: "25. 过去时", body: "했어요 (haesseoyo) 做了\n갔어요 (gasseoyo) 去了\n먹었어요 (meogeosseoyo) 吃了\n봤어요 (bwasseoyo) 看了\n만났어요 (mannasseoyo) 见了", tip: "动词过去式:词干+었어요/었어요" },
    { t: "26. 未来时", body: "할 거예요 (hal geoeyo) 要做\n갈 거예요 (gal geoeyo) 要去\n먹을 거예요 (meogeul geoeyo) 要吃\n할래요 (hallaeyo) 要做吗?\n갈래요 (gallaeyo) 要去吗?", tip: "-ㄹ 거예요 表计划,-ㄹ래요 表提议" },
    { t: "27. 进行时", body: "하고 있어요 (hago isseoyo) 正在做\n가고 있어요 (gago isseoyo) 正在去\n먹고 있어요 (meokgo isseoyo) 正在吃\n보고 있어요 (bogo isseoyo) 正在看", tip: "-고 있어요 进行时表达" },
    { t: "28. 连接词", body: "그리고 (geurigo) 而且\n하지만 (hajiman) 但是\n그래서 (geuraeseo) 所以\n먼저 (meonjeo) 首先\n다음에 (daeume) 然后\n마지막으로 (majimakgeuro) 最后", tip: "逻辑连接词" },
    { t: "29. 敬语升级", body: "하세요 (haseyo) 请做(敬语)\n계세요 (gyeseyo) 请在(敬语)\n잡수세요 (jabsuseyo) 请吃(敬语)\n주무세요 (jumuseyo) 请睡(敬语)\n드리겠습니다 (deurigetseumnida) 给您(敬语)", tip: "对长辈/客户的特殊敬语动词" },
    { t: "30. 韩语谚语", body: "세 살 버릇 여든까지 간다 (습관) 三岁看老\n가는 말이 고와야 오는 말이 곱다 (상호존중) 你敬我一尺我敬你一丈\n빈 수레가 요란하다 (내용없는사람) 空车响", tip: "常用谚语,体现韩国文化" },
  ];
  function renderKorean() {
    const root = $("mod-korean");
    const prog = state.data.koreanProg || 0;
    const aiOn = !!(getAIConfig().apiKey && getAIConfig().apiKey.trim());
    const chat = state.data.koreanChat || [];
    let html = `<div class="mod-stats"><div class="mod-stat"><div class="mod-stat-label">课程进度</div><div class="mod-stat-value">${prog}/${KOREAN_LESSONS.length}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">对话轮次</div><div class="mod-stat-value">${chat.filter((m)=>m.role==="user").length}</div></div></div>`;
    // AI 对话练习区
    html += `<div class="review-block" style="margin-bottom:14px">
      <div class="block-title-row"><h3 class="block-title">🤖 AI 韩语对话练习</h3>
        ${aiOn ? '<span class="ai-badge">AI 已启用</span>' : '<span class="muted" style="font-size:11px">离线模式</span>'}</div>
      <p class="muted" style="font-size:12px;margin-bottom:8px">用中文或韩语提问,AI 老师用韩语回复并附中文翻译与语法讲解。回车发送。</p>
      <div class="korean-chat" id="kr-chat" style="max-height:280px;overflow-y:auto;margin-bottom:8px">`;
    if (!chat.length) {
      html += `<div class="muted" style="padding:12px;text-align:center">还没有对话,试试问:"怎么用韩语说'今天天气很好'?"</div>`;
    } else {
      chat.forEach((m) => {
        const isUser = m.role === "user";
        html += `<div class="kr-msg${isUser?" kr-user":" kr-ai"}">
          <div class="kr-bubble">${escapeHtml(m.text).replace(/\n/g,"<br>")}</div>
          ${!isUser && m.kr ? `<button class="icon-btn btn-kr-speak" data-text="${escapeHtml(m.kr)}" style="width:24px;height:24px;font-size:11px" title="朗读韩语">🔊</button>` : ""}
        </div>`;
      });
    }
    html += `</div>
      <div class="gen-form-row"><input type="text" id="kr-input" placeholder="输入中文或韩语..." style="flex:1">
      <button class="btn btn-primary" id="kr-send">发送</button>
      <button class="btn btn-ghost" id="kr-clear" title="清空对话">🗑</button></div>
    </div>`;
    KOREAN_LESSONS.forEach((l, i) => {
      const done = i < prog;
      const bodyHtml = l.body.replace(/\n/g, "<br>");
      html += `<div class="gen-card${done ? " done" : ""}"><div class="gen-card-head"><div class="gen-card-title">${l.t}</div>
        <div class="gen-card-actions">${done ? "✓" : `<button class="btn btn-ghost" style="padding:4px 10px" data-k="${i}">标记完成</button>`}</div></div>
        <div class="gen-card-body">${bodyHtml}</div><div class="muted" style="margin-top:6px;font-size:12px">💡 ${l.tip}</div></div>`;
    });
    html += `<div class="muted" style="font-size:12px;margin-top:12px">共 30 课,分 4 个阶段:字母发音 → 日常对话 → 实用场景 → 进阶语法。</div>`;
    root.innerHTML = html;
    // 滚到底部
    const chatBox = $("kr-chat");
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    root.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => {
      state.data.koreanProg = parseInt(b.dataset.k, 10) + 1; saveData(); renderKorean();
    }));
    // 朗读韩语回复
    root.querySelectorAll(".btn-kr-speak").forEach((b) => b.addEventListener("click", () => speak(b.dataset.text, "ko-KR")));
    // 清空对话
    const clrBtn = $("kr-clear");
    if (clrBtn) clrBtn.addEventListener("click", () => {
      if (!chat.length) return;
      if (!confirm("清空所有对话记录?")) return;
      state.data.koreanChat = []; saveData(); renderKorean();
    });
    // 发送对话
    const sendBtn = $("kr-send");
    const inputEl = $("kr-input");
    const sendKorean = async () => {
      const input = inputEl.value.trim();
      if (!input) return;
      if (!state.data.koreanChat) state.data.koreanChat = [];
      state.data.koreanChat.push({ role: "user", text: input });
      saveData(); renderKorean();
      // 显示"思考中"
      const box = $("kr-chat");
      if (box) {
        const thinking = document.createElement("div");
        thinking.className = "kr-msg kr-ai";
        thinking.innerHTML = `<div class="kr-bubble muted">🤖 思考中…</div>`;
        box.appendChild(thinking); box.scrollTop = box.scrollHeight;
      }
      const hist = state.data.koreanChat.filter((m) => m.role === "user" || m.role === "assistant").slice(-8, -1);
      const reply = await callAI("korean-chat", { input, history: hist });
      const replyStr = typeof reply === "string" ? reply : JSON.stringify(reply);
      // 提取韩语部分用于朗读
      const krMatch = replyStr.match(/【韩语】([\s\S]*?)(?=【中文】|$)/);
      state.data.koreanChat.push({ role: "assistant", text: replyStr, kr: krMatch ? krMatch[1].trim() : "" });
      saveData(); renderKorean();
    };
    if (sendBtn) sendBtn.addEventListener("click", sendKorean);
    if (inputEl) inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") sendKorean(); });
  }

  /* ============================================================
   * 生活照片日记
   * ============================================================ */
  function initPhotoDiary() {
    const root = $("mod-photodiary");
    if (!root) return;
    $("desc-photodiary").textContent = "上传照片 + 文字记录,AI 自动小结(占位)";
    MODULE_RENDER.photodiary = renderPhotoDiary;
    renderPhotoDiary();
  }
  function renderPhotoDiary() {
    const root = $("mod-photodiary");
    const items = getMod("photodiary");
    let html = `<div class="gen-form">
      <div style="margin-bottom:8px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-sub);margin-bottom:6px;">📷 添加照片(三种方式任选):</div>
        <input type="file" id="pd-file" accept="image/*" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden">
        <label id="pd-dropzone" for="pd-file" style="display:block;margin-top:10px;padding:24px 16px;border:2px dashed var(--primary);border-radius:14px;background:var(--primary-soft);text-align:center;transition:all 0.15s;cursor:pointer;">
          <div style="font-size:32px;line-height:1;margin-bottom:6px;">📥</div>
          <div style="font-size:14px;font-weight:700;color:var(--primary-deep);">点击此处选择照片</div>
          <div style="font-size:12px;color:var(--text-sub);margin-top:4px;">💡 手机:直接点击上方区域从相册选图;电脑:可拖图或 Ctrl+V 粘贴</div>
        </label>
      </div>
      <div id="pd-file-info" class="muted" style="font-size:12px;margin-bottom:8px;"></div>
      <input type="text" id="pd-note" placeholder="为这组照片加一句话记录...">
      <div class="gen-form-actions"><button class="btn btn-primary" id="pd-add">+ 上传记录</button></div>
    </div>`;
    html += `<div class="mod-stats"><div class="mod-stat"><div class="mod-stat-label">照片记录</div><div class="mod-stat-value">${items.length}</div></div></div>`;
    // AI 生活小结
    html += `<div class="review-block" style="margin-bottom:14px">
      <div class="block-title-row"><h3 class="block-title">🤖 AI 生活小结</h3>
        <button class="btn btn-primary" id="pd-ai-sum" style="padding:6px 14px">生成今日小结</button></div>
      <div class="auto-summary" id="pd-summary"><p class="muted">基于今日照片日记的文字记录,AI 自动生成温暖的生活小结…</p></div>
    </div>`;
    html += `<div class="photo-diary-grid">`;
    if (!items.length) html += '<div class="muted" style="grid-column:1/-1">还没有照片 — 截图后按 Ctrl+V 粘贴,或拖图进来,即可上传第一张</div>';
    items.forEach((it) => {
      html += `<div class="pd-item"><img class="pd-img" src="${it.photos[0]}" data-view="${it.photos[0]}"><div class="pd-info"><div>${it.date}</div><div class="pd-note">${escapeHtml(it.note || "")}</div>
        <button class="icon-btn btn-pd-del" data-id="${it.id}" style="width:24px;height:24px;font-size:11px;margin-top:4px">🗑</button></div></div>`;
    });
    html += `</div>`;
    root.innerHTML = html;
    // 选择照片后显示数量 (原生 file 自己触发,无需 JS 点击)
    const pdFileInput = $("pd-file");
    const pdInfo = $("pd-file-info");
    if (pdFileInput) {
      pdFileInput.addEventListener("change", () => {
        const files = pdFileInput.files;
        if (files && files.length) {
          const sizeKB = Math.round(Array.from(files).reduce((s, f) => s + f.size, 0) / 1024);
          pdInfo.textContent = `✅ 已选 ${files.length} 张 (${sizeKB}KB) — 点击「+ 上传记录」保存`;
          pdInfo.style.color = "var(--done)";
        } else {
          pdInfo.textContent = "";
        }
      });
    }
    // 拖拽 + 粘贴上传(绕过文件选择器被拦截的问题)
    const dropzone = $("pd-dropzone");
    let pendingPhotos = [];
    const applyPhotos = (photos) => {
      pendingPhotos = photos;
      const sizeKB = Math.round(photos.reduce((s, p) => s + (p.size || 0), 0) / 1024);
      pdInfo.textContent = `✅ 已准备 ${photos.length} 张 (${sizeKB}KB) — 点击「+ 上传记录」保存`;
      pdInfo.style.color = "var(--done)";
    };
    const handleImageFiles = (files) => {
      const imgs = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
      if (!imgs.length) { toast("未检测到图片(请粘贴/拖入 JPG/PNG 等图片)", "warn"); return; }
      const photos = [];
      let done = 0;
      imgs.forEach((f) => compressImage(f, (d) => { if (d) photos.push({ data: d, size: f.size }); done++; if (done === imgs.length) applyPhotos(photos); }));
    };
    if (dropzone) {
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.style.background = "var(--primary-soft)";
        dropzone.style.borderColor = "var(--primary-deep)";
        dropzone.style.transform = "scale(1.01)";
      });
      dropzone.addEventListener("dragleave", (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.style.background = "var(--primary-soft)";
        dropzone.style.borderColor = "var(--primary)";
        dropzone.style.transform = "scale(1)";
      });
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.style.background = "var(--primary-soft)";
        dropzone.style.borderColor = "var(--primary)";
        dropzone.style.transform = "scale(1)";
        handleImageFiles(e.dataTransfer.files);
      });
      // 粘贴上传:label 聚焦时监听 paste(桌面端增强;手机端用 label 点击)
      dropzone.addEventListener("paste", (e) => {
        if (!e.clipboardData) return;
        const files = [];
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const it = e.clipboardData.items[i];
          if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); }
        }
        if (files.length) { e.preventDefault(); handleImageFiles(files); }
      });
    }
    // 全局粘贴兜底:只要照片日记面板处于激活状态,Ctrl+V 就能上传(无需先聚焦)
    const pdPasteGlobal = (e) => {
      if (!document.getElementById("mod-photodiary")) return;
      const panel = document.querySelector(".panel.active");
      if (!panel || !panel.contains(document.getElementById("mod-photodiary"))) return;
      // 如果用户正在输入框里粘贴文字,不要拦截
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea") return;
      if (!e.clipboardData) return;
      const files = [];
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const it = e.clipboardData.items[i];
        if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); }
      }
      if (files.length) { e.preventDefault(); handleImageFiles(files); }
    };
    document.addEventListener("paste", pdPasteGlobal);
    $("pd-add").addEventListener("click", () => {
      // 优先用拖拽准备的图片,其次用 file input 选的
      if (pendingPhotos.length) {
        const note = $("pd-note").value.trim();
        const list = getMod("photodiary");
        list.unshift({ id: uid(), date: todayStr(), note, photos: pendingPhotos.map((p) => p.data), at: Date.now() });
        setMod("photodiary", list); pendingPhotos = []; renderPhotoDiary(); toast("已上传", "done");
        return;
      }
      const files = pdFileInput ? pdFileInput.files : null;
      if (!files || !files.length) { toast("请先选择图片或把图片拖到拖拽区域", "warn"); return; }
      const note = $("pd-note").value.trim();
      const photos = [];
      let done = 0;
      $("pd-add").disabled = true; $("pd-add").textContent = "压缩上传中…";
      const total = files.length;
      Array.from(files).forEach((f) => compressImage(f, (d) => { if (d) photos.push(d); done++; if (done === total) {
        const list = getMod("photodiary");
        list.unshift({ id: uid(), date: todayStr(), note, photos, at: Date.now() });
        setMod("photodiary", list); renderPhotoDiary(); toast("已上传", "done");
      } }));
    });
    root.querySelectorAll(".pd-img").forEach((img) => img.addEventListener("click", () => viewPhoto(img.dataset.view)));
    root.querySelectorAll(".btn-pd-del").forEach((b) => b.addEventListener("click", () => {
      setMod("photodiary", getMod("photodiary").filter((x) => x.id !== b.dataset.id)); renderPhotoDiary();
    }));
    // AI 生活小结
    const pdAiBtn = $("pd-ai-sum");
    if (pdAiBtn) pdAiBtn.addEventListener("click", async () => {
      const all = getMod("photodiary");
      const today = todayStr();
      const todayEntries = all.filter((e) => e.date === today);
      const entries = (todayEntries.length ? todayEntries : all.slice(0, 5)).map((e) => ({ date: e.date, note: e.note || "" }));
      if (!entries.length) { toast("请先上传至少一条照片日记"); return; }
      pdAiBtn.disabled = true; pdAiBtn.textContent = "🤖 生成中…";
      const wrap = $("pd-summary");
      if (wrap) wrap.innerHTML = `<p class="muted">🤖 AI 正在回忆今日点滴…</p>`;
      const aiOn = !!(getAIConfig().apiKey && getAIConfig().apiKey.trim());
      const txt = await callAI("photodiary-summary", { entries });
      if (wrap) wrap.innerHTML = `<div class="summary-section highlight${aiOn?"":" warn"}">
        <h4>${aiOn?"✨ AI 生活小结":"📝 小结(离线)"}</h4>
        <p style="line-height:1.7;margin-top:6px">${escapeHtml(typeof txt === "string" ? txt : JSON.stringify(txt))}</p></div>`;
      pdAiBtn.disabled = false; pdAiBtn.textContent = "重新生成";
      toast(aiOn ? "AI 小结已生成" : "已生成离线小结,接入 AI 后更精彩");
    });
  }

  /* ============================================================
   * 释放法冥想
   * ============================================================ */
  function initMeditation() {
    const root = $("mod-meditation");
    if (!root) return;
    $("desc-meditation").textContent = "莱斯特释放法:觉察→允许→释放→轻松";
    MODULE_RENDER.meditation = renderMeditation;
    renderMeditation();
  }
  function renderMeditation() {
    const root = $("mod-meditation");
    const logs = getMod("meditationLog");
    const totalMin = logs.reduce((s, l) => s + (l.duration || 0), 0);
    let html = `<div class="meditation-stage">
      <div class="meditation-circle"></div>
      <div style="font-size:18px;font-weight:700">释放法冥想</div>
      <div style="font-size:13px;opacity:.8;margin-top:6px">觉察情绪 → 允许存在 → 选择释放 → 感受轻松</div>
    </div>`;
    html += `<div class="gen-form">
      <div class="gen-form-row"><label style="font-size:11px;color:var(--text-sub)">冥想前情绪(1-10)<input type="range" id="md-before" min="1" max="10" value="5"></label>
      <label style="font-size:11px;color:var(--text-sub)">冥想后情绪(1-10)<input type="range" id="md-after" min="1" max="10" value="7"></label></div>
      <div class="gen-form-row"><select id="md-theme"><option>释放焦虑</option><option>释放愤怒</option><option>释放自我怀疑</option><option>释放想要控制</option><option>释放想要认可</option></select>
      <select id="md-dur"><option value="5">5 分钟</option><option value="10">10 分钟</option><option value="20">20 分钟</option></select></div>
      <div class="gen-form-actions"><button class="btn btn-primary" id="md-done">完成冥想打卡</button></div>
    </div>`;
    html += `<div class="mod-stats"><div class="mod-stat"><div class="mod-stat-label">累计冥想</div><div class="mod-stat-value">${totalMin}min</div></div>
      <div class="mod-stat"><div class="mod-stat-label">打卡次数</div><div class="mod-stat-value">${logs.length}</div></div></div>`;
    html += `<h3 class="block-title">最近记录</h3><div class="gen-list">` +
      (logs.length ? logs.slice(0, 6).map((l) => `<div class="gen-card"><div class="gen-card-meta"><span>${l.date}</span><span>${l.theme}</span><span>${l.duration}min</span><span>情绪 ${l.before}→${l.after}</span></div></div>`).join("") : '<div class="muted">暂无记录</div>') + `</div>`;
    root.innerHTML = html;
    $("md-done").addEventListener("click", () => {
      const log = { id: uid(), date: todayStr(), theme: $("md-theme").value, duration: parseInt($("md-dur").value, 10), before: parseInt($("md-before").value, 10), after: parseInt($("md-after").value, 10), at: Date.now() };
      const list = getMod("meditationLog"); list.unshift(log); setMod("meditationLog", list);
      toast(`打卡成功,情绪 ${log.before}→${log.after}`); renderMeditation();
    });
  }

  /* ============================================================
   * 塔罗占卜(22 大阿卡纳 + 黄历 + 状态分析 + 学习模式推荐)
   * ============================================================ */
  function initTarot() {
    const root = $("mod-tarot");
    if (!root) return;
    $("desc-tarot").textContent = "每日占卜 · 牌意×黄历×复盘数据 → 推荐今日学习模式";
    MODULE_RENDER.tarot = renderTarot;
    renderTarot();
  }
  // 22 大阿卡纳:正位/逆位牌意 + 学习倾向
  const TAROT_DECK = [
    { n: "愚者", icon: "🃏", up: "新的开始、纯真、自由出发", rev: "冲动、鲁莽、未做准备", learn: "explore" },
    { n: "魔术师", icon: "🪄", up: "创造力、行动力、掌控资源", rev: "操控、能力未发挥", learn: "create" },
    { n: "女祭司", icon: "🌙", up: "直觉、潜意识、内在智慧", rev: "压抑直觉、信息缺失", learn: "deep" },
    { n: "皇后", icon: "👑", up: "丰盛、滋养、创造生长", rev: "过度依赖、停滞", learn: "create" },
    { n: "皇帝", icon: "⚔️", up: "权威、结构、建立秩序", rev: "专制、僵化", learn: "structure" },
    { n: "教皇", icon: "⛪", up: "传统、教导、精神指引", rev: "反传统、非常规", learn: "deep" },
    { n: "恋人", icon: "❤️", up: "选择、关系、价值契合", rev: "失衡、错误选择", learn: "explore" },
    { n: "战车", icon: "🛡️", up: "意志、胜利、克服困难", rev: "失控、方向不明", learn: "practice" },
    { n: "力量", icon: "🦁", up: "勇气、耐心、内在力量", rev: "自我怀疑、缺乏信心", learn: "light" },
    { n: "隐士", icon: "🔦", up: "内省、独处、寻求答案", rev: "孤立、退缩", learn: "deep" },
    { n: "命运之轮", icon: "🎡", up: "转折、机遇、循环上升", rev: "逆境、错失良机", learn: "light" },
    { n: "正义", icon: "⚖️", up: "平衡、因果、公正判断", rev: "失衡、不公", learn: "structure" },
    { n: "倒吊人", icon: "🙃", up: "暂停、换视角、牺牲", rev: "无谓牺牲、停滞", learn: "light" },
    { n: "死神", icon: "💀", up: "结束、蜕变、重生", rev: "抗拒改变、停滞", learn: "explore" },
    { n: "节制", icon: "🕊️", up: "平衡、调和、耐心整合", rev: "失衡、过度", learn: "light" },
    { n: "恶魔", icon: "😈", up: "束缚、欲望、物质执着", rev: "释放、挣脱束缚", learn: "light" },
    { n: "塔", icon: "🗼", up: "突变、崩塌、打破旧结构", rev: "避免灾难、缓变", learn: "light" },
    { n: "星星", icon: "⭐", up: "希望、灵感、信念之光", rev: "失望、失去信心", learn: "create" },
    { n: "月亮", icon: "🌕", up: "幻觉、不安、潜意识涌现", rev: "释放恐惧、真相浮现", learn: "light" },
    { n: "太阳", icon: "☀️", up: "成功、快乐、活力充沛", rev: "暂时的阴霾、过度乐观", learn: "create" },
    { n: "审判", icon: "📯", up: "觉醒、重整、内在召唤", rev: "自我怀疑、犹豫", learn: "deep" },
    { n: "世界", icon: "🌍", up: "完成、圆满、成就达成", rev: "未完成、停滞收尾", learn: "create" },
  ];
  // 学习模式映射
  const LEARN_MODES = {
    deep: { name: "深度阅读", icon: "📖", desc: "适合攻克难点、系统性学习,效率高" },
    light: { name: "轻松复习", icon: "🌿", desc: "状态波动,适合温故知新、低强度任务" },
    create: { name: "创作输出", icon: "✍️", desc: "能量充沛,适合产出内容、整理输出" },
    practice: { name: "技能练习", icon: "🎯", desc: "适合动手实操、刷题、重复训练" },
    structure: { name: "结构化整理", icon: "🗂️", desc: "适合建立框架、整理笔记与计划" },
    explore: { name: "探索新知", icon: "🧭", desc: "适合开拓新方向、低压力尝试" },
  };

  /* ---------- 黄历引擎(本地计算) ---------- */
  const TIANGAN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
  const DIZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
  const SHENGXIAO = ["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"];
  const WUXING_GAN = ["木","木","火","火","土","土","金","金","水","水"];
  // 建除十二神 宜忌
  const JIANCHU = [
    { name: "建", yi: "上任、祈福、出行", ji: "动土、开仓" },
    { name: "除", yi: "治病、清扫、解除", ji: "嫁娶、安葬" },
    { name: "满", yi: "祈福、移徙、进人口", ji: "安葬、破土" },
    { name: "平", yi: "修造、动土、平整", ji: "开渠、掘井" },
    { name: "定", yi: "纳采、立券、定约", ji: "诉讼、出行" },
    { name: "执", yi: "捕捉、狩猎、执拾", ji: "开市、开仓" },
    { name: "破", yi: "破屋、坏垣", ji: "诸事不宜" },
    { name: "危", yi: "祈福、安床、祭祀", ji: "登高、出行" },
    { name: "成", yi: "开业、入学、结婚", ji: "诉讼" },
    { name: "收", yi: "纳财、收获、捕捉", ji: "出行、安葬" },
    { name: "开", yi: "开业、迁居、求名", ji: "安葬、破土" },
    { name: "闭", yi: "筑堤、安葬、埋藏", ji: "开市、求医" },
  ];
  function julianDayNum(y, m, d) {
    if (m <= 2) { y--; m += 12; }
    const a = Math.floor(y / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524;
  }
  function getAlmanac(dateStr) {
    const d = isValidDateStr(dateStr) ? new Date(dateStr + "T00:00:00") : new Date();
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    const jdn = julianDayNum(y, m, day);
    const ganIdx = (jdn + 9) % 10;
    const zhiIdx = (jdn + 1) % 12;
    const monthZhi = m % 12; // 月支(近似,正月建寅)
    const jcIdx = ((zhiIdx - monthZhi) % 12 + 12) % 12;
    const jc = JIANCHU[jcIdx];
    const chongIdx = (zhiIdx + 6) % 12;
    // 三合局煞方:申子辰煞南,寅午戌煞北,巳酉丑煞东,亥卯未煞西
    const shaSet = [[8,0,4],[2,6,10],[5,9,1],[11,3,7]]; // 南/北/东/西对应的zhibranches
    let sha = "中";
    shaSet.forEach((set, i) => { if (set.includes(zhiIdx)) sha = ["南","北","东","西"][i]; });
    const week = ["日","一","二","三","四","五","六"][d.getDay()];
    return {
      date: dateStr, week,
      ganzhi: TIANGAN[ganIdx] + DIZHI[zhiIdx],
      ganIdx, zhiIdx,
      shengxiao: SHENGXIAO[zhiIdx],
      wuxing: WUXING_GAN[ganIdx] + "日",
      jianchu: jc.name, yi: jc.yi, ji: jc.ji,
      chong: "冲" + DIZHI[chongIdx] + "(" + SHENGXIAO[chongIdx] + ")",
      sha: "煞" + sha,
    };
  }

  function renderTarot() {
    const root = $("mod-tarot");
    const history = getMod("tarotLog");
    const alm = getAlmanac(todayStr());
    let html = `<div class="tarot-stage">
      <div class="tarot-stars"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span></div>
      <div class="tarot-title">✨ 今日塔罗占卜 ✨</div>
      <div class="tarot-sub">三牌阵 · 过去 · 现在 · 未来</div>
      <div class="almanac-bar">
        <span>📅 ${fmtDateCN(todayStr())}</span>
        <span>${alm.ganzhi}年</span>
        <span>属${alm.shengxiao}</span>
        <span>${alm.wuxing}</span>
        <span class="alm-jc">${alm.jianchu}日</span>
      </div>
      <div class="almanac-yiji">
        <div class="yi">宜:${alm.yi}</div>
        <div class="ji">忌:${alm.ji}</div>
        <div class="muted" style="font-size:10px">${alm.chong} · ${alm.sha}</div>
      </div>
      <div class="tarot-cards" id="tarot-cards"></div>
      <div class="tarot-actions">
        <button class="btn btn-primary" id="t-draw">🎴 抽取今日牌阵</button>
        <button class="btn btn-ghost" id="t-ask">❓ 提问占卜</button>
      </div>
    </div>`;
    html += `<div id="t-reading"></div>`;
    html += `<div id="t-mode" style="margin-top:14px"></div>`;
    html += `<h3 class="block-title" style="margin-top:20px">📜 占卜历史</h3><div class="gen-list">` +
      (history.length ? history.slice(0, 5).map((h) => `<div class="gen-card tarot-history-card"><div class="gen-card-meta"><span>${h.date}</span><span>${h.cards.map((c) => c.n + (c.rev ? "逆" : "")).join(" / ")}</span>${h.mode ? `<span class="ai-badge">${LEARN_MODES[h.mode] ? LEARN_MODES[h.mode].icon + LEARN_MODES[h.mode].name : h.mode}</span>` : ""}</div>${h.question ? `<div class="gen-card-body" style="font-size:12px">问:${escapeHtml(h.question)}</div>` : ""}<div class="gen-card-body">${escapeHtml(h.reading.slice(0, 120))}…</div></div>`).join("") : '<div class="muted">暂无历史,抽取今日牌阵开始</div>') + `</div>`;
    root.innerHTML = html;
    $("t-draw").addEventListener("click", () => drawTarot(false));
    $("t-ask").addEventListener("click", () => {
      const q = prompt("输入你想占卜的问题:");
      if (q && q.trim()) drawTarot(true, q.trim());
    });
  }

  async function drawTarot(isAsk, question) {
    const positions = ["过去", "现在", "未来"];
    const drawn = [];
    const pool = [...TAROT_DECK];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const card = pool.splice(idx, 1)[0];
      const rev = Math.random() < 0.35;
      drawn.push({ n: card.n, icon: card.icon, m: rev ? card.rev : card.up, learn: card.learn, pos: positions[i], rev });
    }
    const wrap = $("tarot-cards");
    // 翻牌动画:先扣牌背,再逐张翻开
    wrap.innerHTML = drawn.map((c, i) =>
      `<div class="tarot-card dealing" style="animation-delay:${i * 0.25}s" data-i="${i}"><div class="tarot-card-inner"><div class="tarot-back">🔮</div></div></div>`
    ).join("");
    $("t-reading").innerHTML = '<div class="muted" style="text-align:center">✦ 牌灵解读中 ✦</div>';
    $("t-mode").innerHTML = "";
    const alm = getAlmanac(todayStr());
    const review = collectDayData(todayStr());
    const result = await callAI("tarot-reading", { cards: drawn, almanac: alm, review, question: question || "" });

    // 逐张翻面
    drawn.forEach((c, i) => {
      setTimeout(() => {
        const el = wrap.querySelector(`.tarot-card[data-i="${i}"]`);
        if (!el) return;
        el.classList.remove("dealing");
        el.classList.add("flipped");
        if (c.rev) el.classList.add("rev");
        el.innerHTML = `<div class="tarot-card-inner"><div class="tarot-face"><div class="tarot-card-icon">${c.icon}</div><div class="tarot-card-name">${c.n}${c.rev ? " 逆" : ""}</div><div class="tarot-card-pos">${c.pos}</div></div></div>`;
      }, 600 + i * 300);
    });

    // 渲染解读结果
    let mode, readingText, modeReason, actionPlan, caution, learningState;
    if (result && result._ai) {
      // AI 返回的结构化结果
      mode = result.learningMode || inferLearnMode(drawn, alm, review);
      learningState = result.learningState || "";
      modeReason = result.learningReason || "";
      actionPlan = result.actionPlan || "";
      caution = result.caution || "";
      const dims = result.dimensions || {};
      readingText = [
        "【整体运势 · 牌意×黄历】",
        result.overall || "",
        "",
        "【三维度】",
        `事业学业:${dims.career || ""}`,
        `感情人际:${dims.love || ""}`,
        `身心健康:${dims.health || ""}`,
        "",
        "【心理状态】",
        result.psyche || "",
      ].join("\n");
    } else {
      // 离线模式返回的是文本
      mode = inferLearnMode(drawn, alm, review);
      readingText = result;
      learningState = "";
      modeReason = "";
      actionPlan = "";
      caution = "";
    }

    $("t-reading").innerHTML = `<div class="tarot-reading">${escapeHtml(readingText).replace(/\n/g, "<br>")}</div>`;

    // 学习状态评估 + 学习模式推荐卡
    const lm = LEARN_MODES[mode] || LEARN_MODES.light;
    let modeHtml = `<div class="learn-mode-card">
      <div class="learn-mode-head"><span class="learn-mode-icon">${lm.icon}</span>
      <div><div class="learn-mode-name">今日推荐学习模式:${lm.name}</div>
      <div class="muted" style="font-size:12px">${lm.desc}</div></div></div>`;
    if (learningState) {
      modeHtml += `<div style="margin-top:12px;padding:10px 12px;background:var(--bg-soft);border-radius:8px;font-size:13px;line-height:1.7"><b>📊 今日学习状态评估</b><br>${escapeHtml(learningState)}</div>`;
    }
    if (modeReason) {
      modeHtml += `<div style="margin-top:10px;padding:10px 12px;background:var(--primary-soft);border-radius:8px;font-size:13px;line-height:1.7"><b>🎯 推荐依据(牌意×黄历)</b><br>${escapeHtml(modeReason)}</div>`;
    }
    if (actionPlan) {
      modeHtml += `<div style="margin-top:10px;padding:10px 12px;background:var(--done-soft);border-radius:8px;font-size:13px;line-height:1.8"><b>📋 今日实操建议</b><br>${escapeHtml(actionPlan)}</div>`;
    }
    if (caution) {
      modeHtml += `<div style="margin-top:10px;padding:10px 12px;background:var(--warn-soft);border-radius:8px;font-size:13px;line-height:1.7">⚠️ <b>注意事项</b><br>${escapeHtml(caution)}</div>`;
    }
    if (!result._ai) {
      modeHtml += `<div class="muted" style="font-size:11px;margin-top:8px">综合牌意、黄历(建除:${alm.jianchu})与你的复盘数据(任务完成率 ${review.taskRate}%)推荐。接入 AI 后将给出更深入个性化的解读。</div>`;
    }
    modeHtml += `</div>`;
    $("t-mode").innerHTML = modeHtml;

    const list = getMod("tarotLog");
    list.unshift({ id: uid(), date: todayStr(), cards: drawn, reading: readingText, mode, question: question || "", at: Date.now() });
    setMod("tarotLog", list.slice(0, 30));
    toast("占卜完成");
  }

  // 根据牌阵+黄历+复盘推断学习模式(离线/AI兜底)
  function inferLearnMode(cards, alm, review) {
    const present = cards.find((c) => c.pos === "现在") || cards[1];
    let mode = present ? present.learn : "light";
    // 逆位倾向轻松/低强度
    if (present && present.rev && ["deep", "create", "practice", "structure"].includes(mode)) mode = "light";
    // 任务完成率低 → 避免深度,倾向轻松或结构化整理
    if (review.taskRate < 40 && mode === "deep") mode = "structure";
    // 黄历建除影响
    if (alm.jianchu === "成" && (mode === "light" || mode === "explore")) mode = "create"; // 成日宜开业入学
    if (alm.jianchu === "破") mode = "light"; // 破日诸事不宜 → 轻松复习
    if (alm.jianchu === "定") mode = "structure"; // 定日宜立约 → 结构化
    // 冥想次数少或情绪记录低 → 倾向轻松模式
    if (review.meditation === 0) mode = "light";
    return mode;
  }

  // 离线塔罗解读(无 API key 时):结合牌意+黄历+复盘数据
  function offlineTarotReading(cards, alm, review) {
    const a = alm || getAlmanac(todayStr());
    const r = review || {};
    const lines = [];
    // 整体运势:牌意 × 黄历
    lines.push("【整体运势 · 牌意×黄历】");
    lines.push(`今日${a.ganzhi}日,${a.wuxing},${a.jianchu}日。宜${a.yi};忌${a.ji}。${a.chong},${a.sha}。`);
    const present = cards.find((c) => c.pos === "现在") || cards[1];
    const future = cards.find((c) => c.pos === "未来") || cards[2];
    const jcInfluence = a.jianchu === "破" ? "破日宜破旧立新,不宜强求安稳" :
      a.jianchu === "成" ? "成日宜开业入学,万事可成" :
      a.jianchu === "定" ? "定日宜立约定约,适合规划" :
      a.jianchu === "建" ? "建日宜上任祈福,开创之力强" : `${a.jianchu}日,${a.yi}`;
    lines.push(`黄历${jcInfluence}。结合牌阵:`);
    cards.forEach((c) => {
      lines.push(`【${c.pos}】${c.n}${c.rev ? "(逆位)" : ""}:${c.rev ? "需注意 " : ""}${c.m}。` +
        (c.pos === "过去" ? "过去的经历塑造了当下的你。" : c.pos === "现在" ? "这是你此刻正面对的能量。" : "未来的走向将沿着此能量发展。"));
    });
    // 三维度
    lines.push("\n【三维度】");
    lines.push(`事业学业:${present.rev ? "当下需调整节奏,避免冒进" : "顺势而为,专注当下任务"}。${a.jianchu === "成" ? "成日利学业,宜入学求知。" : a.jianchu === "破" ? "破日不宜开新项目,宜收尾。" : ""}`);
    lines.push(`感情:${cards.some((c) => c.n === "恋人") ? "关系是今日重点" : "保持平衡与沟通"}。`);
    lines.push(`健康:${present.rev ? "注意情绪与作息" : "状态尚可"}。${a.wuxing.includes("火") ? "火日注意心血管与情绪。" : a.wuxing.includes("水") ? "水日注意肾与泌尿。" : a.wuxing.includes("木") ? "木日注意肝胆与情绪疏导。" : ""}`);
    // 心理状态
    lines.push("\n【心理状态】");
    if (r.taskRate != null) {
      if (r.taskRate >= 70) lines.push(`任务完成率 ${r.taskRate}%,执行力强,状态积极。`);
      else if (r.taskRate >= 40) lines.push(`任务完成率 ${r.taskRate}%,稳步推进中。`);
      else lines.push(`任务完成率偏低(${r.taskRate}%),可能疲惫或分心。`);
    }
    if (r.meditation) lines.push("冥想记录显示今日有内在觉察。");
    if (present && present.rev) lines.push("「现在」位逆位牌提示内心有阻力或犹疑。");
    // 学习状态 + 推荐理由
    lines.push("\n【学习模式推荐】");
    const mode = inferLearnMode(cards, a, r);
    const lm = LEARN_MODES[mode] || LEARN_MODES.light;
    lines.push(`${lm.icon} 推荐:${lm.name} —— ${lm.desc}`);
    lines.push(`依据:黄历${a.jianchu}日${a.jianchu === "破" ? "宜静不宜动" : "宜" + a.yi.split("、")[0]};牌阵「现在」${present ? present.n + (present.rev ? "逆位" : "") : ""};复盘完成率${r.taskRate != null ? r.taskRate + "%" : "未知"}。`);
    lines.push("(接入 AI 后将获得更深入个性化的牌意×黄历综合解读。)");
    return lines.join("\n");
  }

  /* ============================================================
   * 每日新闻播客(真实 RSS 抓取 + 双语 + TTS 播报 + 每日缓存)
   * ============================================================ */
  // RSS 源(经 rss2json 代理,支持浏览器跨域)
  const NEWS_SOURCES = [
    { tag: "国际", cat: "国际", feed: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "en" },
    { tag: "科技", cat: "科技", feed: "https://www.theverge.com/rss/index.xml", lang: "en" },
    { tag: "财经", cat: "财经", feed: "https://feeds.content.dowjones.io/public/rss/SB10001424053111904265604576568501414121800", lang: "en" },
    { tag: "社会", cat: "社会", feed: "https://rss.nytimes.com/services/xml/rss/nyt/US.xml", lang: "en" },
    { tag: "娱乐", cat: "娱乐", feed: "https://www.hollywoodreporter.com/tv/tv-news/feed/", lang: "en" },
  ];
  const NEWS_CACHE_KEY = "workbench_news_cache";

  function getNewsCache() {
    try { return JSON.parse(localStorage.getItem(NEWS_CACHE_KEY)) || {}; }
    catch { return {}; }
  }
  function setNewsCache(cache) { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(cache)); }

  function initNews() {
    const root = $("mod-news");
    if (!root) return;
    $("desc-news").textContent = "真实 RSS 抓取 · 双语播客 · 每日自动更新";
    MODULE_RENDER.news = renderNews;
    renderNews();
    // 进入模块时若缓存非今日,自动后台刷新
    const cache = getNewsCache();
    if (cache.date !== todayStr()) setTimeout(() => fetchNews(true), 300);
  }

  /* ============ 免费翻译(无 key 兜底) ============
   * 优先 MyMemory(CORS 友好,免费),失败则用内置词典 + 百度翻译 Web API
   */
  const TECH_DICT = {
    "apple": "苹果", "google": "谷歌", "microsoft": "微软", "amazon": "亚马逊",
    "tesla": "特斯拉", "spacex": "太空探索", "netflix": "奈飞", "disney": "迪士尼",
    "iphone": "iPhone", "ipad": "iPad", "macbook": "MacBook", "imac": "iMac",
    "samsung": "三星", "xiaomi": "小米", "huawei": "华为", "oppo": "OPPO", "vivo": "vivo",
    "intel": "英特尔", "amd": "AMD", "nvidia": "英伟达", "qualcomm": "高通",
    "ai": "人工智能", "artificial intelligence": "人工智能", "machine learning": "机器学习",
    "blockchain": "区块链", "bitcoin": "比特币", "crypto": "加密货币", "nft": "NFT",
    "ev": "电动车", "electric vehicle": "电动车", "self-driving": "自动驾驶",
    "smartphone": "智能手机", "laptop": "笔记本电脑", "tablet": "平板电脑",
    "cyberattack": "网络攻击", "cybersecurity": "网络安全", "hack": "黑客",
    "data breach": "数据泄露", "privacy": "隐私", "security": "安全",
    "climate change": "气候变化", "global warming": "全球变暖", "carbon": "碳",
    "renewable": "可再生", "solar": "太阳能", "wind": "风能",
    "election": "选举", "president": "总统", "senate": "参议院", "congress": "国会",
    "war": "战争", "conflict": "冲突", "diplomacy": "外交", "summit": "峰会",
    "pandemic": "大流行", "vaccine": "疫苗", "clinical trial": "临床试验",
    "breakthrough": "突破", "innovation": "创新", "launch": "发布", "release": "发布",
    "exclusive": "独家", "reveal": "揭露", "report": "报道",
    "million": "百万", "billion": "十亿", "trillion": "万亿",
    "record": "纪录", "historic": "历史性的", "landmark": "里程碑",
    "partnership": "合作", "collaboration": "协作", "acquisition": "收购",
    "merger": "合并", "ipo": "IPO", "valuation": "估值",
    "streaming": "流媒体", "podcast": "播客", "broadcast": "广播",
    "film": "电影", "movie": "电影", "series": "剧集", "episode": "剧集",
    "actor": "演员", "actress": "女演员", "director": "导演", "producer": "制片人",
    "music": "音乐", "concert": "演唱会", "album": "专辑", "artist": "艺术家",
    "sport": "体育", "game": "比赛", "match": "比赛", "tournament": "锦标赛",
    "olympics": "奥运会", "championship": "锦标赛", "league": "联赛",
    "club": "俱乐部", "team": "球队", "player": "球员", "coach": "教练",
  };
  function dictLookup(text) {
    if (!text) return "";
    let result = text;
    let replaced = 0;
    for (const [en, zh] of Object.entries(TECH_DICT)) {
      const re = new RegExp("\\b" + en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
      result = result.replace(re, () => { replaced++; return zh; });
    }
    // 没有任何匹配 → 返回空串,让调用方走其他兜底(避免把英文原样当翻译)
    return replaced > 0 ? result : "";
  }
  async function freeTranslate(text, from, to) {
    if (!text || !text.trim()) return "";
    from = from || "en";
    to = to || "zh-CN";
    const tryMyMemory = async () => {
      try {
        const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text.slice(0, 480)) +
                    "&langpair=" + encodeURIComponent(from + "|" + to);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) return null;
        const j = await r.json();
        if (j && j.responseData && j.responseData.translatedText) {
          const t = j.responseData.translatedText;
          // MyMemory 限流时返回警告文本,跳过
          if (t.includes("MYMEMORY WARNING") || t.includes("AVAILABLE FREE TRANSLATIONS")) return null;
          return t;
        }
        return null;
      } catch { return null; }
    };
    // 主用 MyMemory,失败则用内置词典
    const result = await tryMyMemory();
    if (result) return result;
    // 词典兜底
    return dictLookup(text.slice(0, 480));
  }

  async function fetchNews(silent) {
    const list = $("n-list");
    if (list) list.innerHTML = `<div class="muted" style="padding:20px;text-align:center">📡 抓取全球新闻中…</div>`;
    const items = [];
    await Promise.all(NEWS_SOURCES.map(async (src) => {
      try {
        const url = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(src.feed);
        const r = await fetch(url);
        const j = await r.json();
        (j.items || []).slice(0, 2).forEach((it) => {
          // 去标签
          const desc = (it.description || "").replace(/<[^>]+>/g, "").trim().slice(0, 200);
          items.push({
            id: uid(),
            tag: src.tag,
            title: (it.title || "").trim(),
            en: desc || (it.title || ""),
            link: it.link || "",
            pub: it.pubDate || "",
            lang: src.lang,
          });
        });
      } catch (e) { console.warn("[news] 抓取失败", src.tag, e.message); }
    }));
    if (!items.length) {
      if (list) list.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><p>抓取失败</p><span>网络或 RSS 代理受限,请稍后重试,或检查 AI 配置</span></div>`;
      if (!silent) toast("新闻抓取失败,请稍后重试");
      return;
    }
    // 自动免费翻译(并发,最多 4 路)
    if (!silent) toast("正在翻译中文摘要…");
    const topItems = items.slice(0, 12);
    const translateOne = async (it) => {
      try {
        const titleZh = await freeTranslate(it.title, "en", "zh-CN");
        const enZh = await freeTranslate((it.en || "").slice(0, 300), "en", "zh-CN");
        it.zh = enZh || titleZh || "";
        it.titleZh = titleZh || "";
      } catch {}
    };
    // 最多 4 路并发
    const chunks = [];
    for (let i = 0; i < topItems.length; i += 4) chunks.push(topItems.slice(i, i + 4));
    for (const chunk of chunks) {
      await Promise.all(chunk.map(translateOne));
    }
    const cache = { date: todayStr(), items: topItems, at: Date.now() };
    setNewsCache(cache);
    if (!silent) toast(`已更新 ${cache.items.length} 条新闻`);
    renderNewsList(cache.items);
  }

  /* ============ 新闻播客:播报状态 + 控制面板 ============ */
  const podcastState = {
    playing: false,
    queue: [],
    index: 0,
    itemRefs: [],     // 每条 queue 对应新闻 id(用于高亮卡片)
    stopFlag: false,
  };

  function renderNews() {
    const root = $("mod-news");
    const cache = getNewsCache();
    const saved = getMod("newsSaved");
    const aiOn = !!(getAIConfig().apiKey && getAIConfig().apiKey.trim());
    let html = `<div class="news-toolbar">
      <div class="news-toolbar-info">
        <span class="news-badge">📡 双语播客</span>
        ${cache.date === todayStr() ? `<span class="muted">今日已更新 · ${cache.items.length}条</span>` : `<span style="color:var(--warn)">待更新</span>`}
        ${aiOn ? '<span class="ai-badge">AI 翻译已启用</span>' : '<span class="muted" style="font-size:11px">免费翻译已启用</span>'}
      </div>
      <div class="news-toolbar-actions">
        <button class="btn btn-primary" id="n-fetch">🔄 刷新新闻</button>
      </div>
    </div>
    <!-- 播报控制条 -->
    <div class="news-player" id="n-player">
      <div class="np-left">
        <div class="np-wave"><span></span><span></span><span></span><span></span></div>
        <div class="np-info">
          <div class="np-title" id="np-title">🔈 准备播报 — 点下方「🔊 播报全部」或每条新闻旁的小喇叭</div>
          <div class="np-sub" id="np-sub">支持中文女声 / 英文男声,可暂停、下一条、调节语速 · <span id="np-mode">检测语音引擎中…</span></div>
        </div>
      </div>
      <div class="np-right">
        <label style="font-size:12px;color:var(--text-sub);display:flex;align-items:center;gap:6px;">
          语速
          <input type="range" id="np-rate" min="0.6" max="1.4" step="0.05" value="0.95" style="width:110px;">
          <span id="np-rate-v" style="min-width:32px;text-align:right;font-variant-numeric:tabular-nums">0.95x</span>
        </label>
        <button class="icon-btn" id="np-prev" title="上一条">⏮</button>
        <button class="icon-btn np-play" id="np-play" title="播放/暂停">▶</button>
        <button class="icon-btn" id="np-next" title="下一条">⏭</button>
        <button class="btn btn-ghost" id="np-all" style="padding:6px 12px">🔊 播报全部</button>
        <button class="icon-btn" id="np-stop" title="停止">⏹</button>
      </div>
    </div>`;
    html += `<div id="n-list"></div>`;
    html += `<h3 class="block-title" style="margin-top:18px">⭐ 收藏(${saved.length})</h3><div class="gen-list">` +
      (saved.length ? saved.slice(0, 10).map((s) => `<div class="gen-card"><div class="gen-card-meta"><span class="ai-badge">${s.tag}</span><span>${s.date}</span></div><div class="gen-card-body">${escapeHtml(s.title || s.zh || "")}</div>
      <button class="icon-btn btn-n-rm" data-id="${s.id}" style="margin-top:6px" title="移除">🗑</button></div>`).join("") : '<div class="muted">暂无收藏</div>') + `</div>`;
    root.innerHTML = html;
    renderNewsList(cache.date === todayStr() ? (cache.items || []) : []);
    $("n-fetch").addEventListener("click", () => fetchNews(false));
    // 播报控制
    const items = cache.date === todayStr() ? (cache.items || []) : [];
    bindNewsPlayer(items);
    root.querySelectorAll(".btn-n-rm").forEach((b) => b.addEventListener("click", () => {
      setMod("newsSaved", getMod("newsSaved").filter((x) => x.id !== b.dataset.id)); renderNews();
    }));
  }

  function bindNewsPlayer(items) {
    const rateInput = $("np-rate");
    const rateVal = $("np-rate-v");
    const rate = { v: 0.95 };
    // 显示当前 TTS 模式(本地/在线)
    const updateModeLabel = () => {
      const el = $("np-mode");
      if (!el) return;
      if (TTS.mode === "online") el.innerHTML = '<span style="color:var(--done)">☁ 在线 TTS(百度/有道/Google)</span>';
      else if (TTS.mode === "local") el.innerHTML = '<span style="color:var(--done)">🖥 本地语音引擎</span>';
      else el.textContent = "检测中…";
    };
    updateModeLabel();
    // TTS.init 是异步的,1 秒后再刷新一次标签
    setTimeout(updateModeLabel, 1000);
    setTimeout(updateModeLabel, 2500);
    if (rateInput) {
      rateInput.addEventListener("input", () => {
        rate.v = parseFloat(rateInput.value);
        if (rateVal) rateVal.textContent = rate.v.toFixed(2) + "x";
      });
    }
    const setTitle = (t, s) => {
      const el = $("np-title"); if (el) el.innerHTML = t;
      const el2 = $("np-sub"); if (el2) el2.innerHTML = s || "";
    };
    const setPlaying = (isPlaying) => {
      const player = $("n-player");
      const btn = $("np-play");
      if (!player) return;
      player.classList.toggle("playing", !!isPlaying);
      if (btn) btn.textContent = (isPlaying === "pause") ? "▶" : (isPlaying ? "⏸" : "▶");
    };
    const highlightCard = (itemId) => {
      document.querySelectorAll(".news-card").forEach((c) => c.classList.remove("n-speaking"));
      if (!itemId) return;
      const c = document.querySelector(`.news-card[data-id="${itemId}"]`);
      if (c) { c.classList.add("n-speaking"); c.scrollIntoView({ behavior: "smooth", block: "center" }); }
    };
    // 播客队列 + 逐条播报
    const buildQueue = (fromItems) => {
      const q = [];
      const refs = [];
      q.push({ text: "Here is today's global news digest. 接下来为您播报今日全球要闻。", lang: "zh-CN" });
      refs.push(null);
      fromItems.slice(0, 8).forEach((it, i) => {
        const zhTitle = it.titleZh || it.title;
        q.push({ text: `第 ${i + 1} 条,${it.tag}新闻。标题:${zhTitle}。`, lang: "zh-CN" }); refs.push(it.id);
        q.push({ text: `${it.title}. ${(it.en || it.title).slice(0, 300)}`, lang: "en-US" }); refs.push(it.id);
        if (it.zh) { q.push({ text: it.zh.slice(0, 300), lang: "zh-CN" }); refs.push(it.id); }
      });
      q.push({ text: "以上就是今日新闻播报。感谢收听,祝学习顺利。", lang: "zh-CN" }); refs.push(null);
      return { q, refs };
    };
    const playQueueAt = (i) => {
      if (podcastState.stopFlag) { podcastState.playing = false; setPlaying(false); setTitle("🔈 已停止","点击「🔊 播报全部」重新开始"); return; }
      if (i >= podcastState.queue.length) {
        podcastState.playing = false; setPlaying(false);
        setTitle(`✅ 播报结束 (共 ${podcastState.queue.length} 段)`, "可点「🔊 播报全部」重新收听");
        highlightCard(null); return;
      }
      podcastState.index = i;
      const seg = podcastState.queue[i];
      const refId = podcastState.itemRefs[i];
      const pct = Math.round(((i + 1) / podcastState.queue.length) * 100);
      const tag = seg.lang.toLowerCase().startsWith("zh") ? "中文" : "EN";
      setTitle(`🔊 (${i + 1}/${podcastState.queue.length} · ${pct}%) [${tag}] ${seg.text.slice(0, 70)}${seg.text.length > 70 ? "…" : ""}`, `语速 ${rate.v.toFixed(2)}x · ${seg.lang}`);
      highlightCard(refId);
      setPlaying(true);
      TTS.speak(seg.text, seg.lang, {
        rate: rate.v,
        onstart: () => {},
        onend: () => {
          if (podcastState.stopFlag) { podcastState.playing = false; setPlaying(false); setTitle("🔈 已停止","点击「🔊 播报全部」重新开始"); highlightCard(null); return; }
          playQueueAt(i + 1);
        },
        onerror: (e) => {
          console.warn("[news-podcast]", e && e.error);
          playQueueAt(i + 1);
        },
      });
    };
    $("np-all").addEventListener("click", () => {
      if (!items || !items.length) { toast("请先点「🔄 刷新新闻」抓取今日要闻"); return; }
      if (!window.speechSynthesis && !window.Audio) { toast("当前浏览器不支持任何语音播报方式"); return; }
      podcastState.stopFlag = false;
      TTS.cancel();
      const { q, refs } = buildQueue(items);
      podcastState.queue = q;
      podcastState.itemRefs = refs;
      podcastState.index = 0;
      podcastState.playing = true;
      toast(`准备播报 ${q.length} 段内容…`);
      // 等 150ms 再播,避免 toast 语音和播报冲突
      setTimeout(() => playQueueAt(0), 150);
    });
    $("np-play").addEventListener("click", () => {
      if (!window.speechSynthesis && !window.Audio) { toast("当前浏览器不支持语音播报"); return; }
      if (!podcastState.queue.length) {
        // 还没开始播,走"播报全部"
        if (!items || !items.length) { toast("请先刷新新闻"); return; }
        $("np-all").click(); return;
      }
      if (TTS.paused) { TTS.resume(); setPlaying(true); }
      else if (podcastState.playing) { TTS.pause(); setPlaying("pause"); }
      else { podcastState.stopFlag = false; playQueueAt(podcastState.index); }
    });
    $("np-prev").addEventListener("click", () => {
      if (!podcastState.queue.length) return;
      podcastState.stopFlag = true;
      TTS.cancel();
      setTimeout(() => {
        podcastState.stopFlag = false;
        playQueueAt(Math.max(0, podcastState.index - 1));
      }, 100);
    });
    $("np-next").addEventListener("click", () => {
      if (!podcastState.queue.length) return;
      podcastState.stopFlag = true;
      TTS.cancel();
      setTimeout(() => {
        podcastState.stopFlag = false;
        playQueueAt(Math.min(podcastState.queue.length - 1, podcastState.index + 1));
      }, 100);
    });
    $("np-stop").addEventListener("click", () => {
      podcastState.stopFlag = true;
      TTS.cancel();
      podcastState.playing = false;
      setPlaying(false);
      highlightCard(null);
      setTitle("🔈 已停止", "点击「🔊 播报全部」重新开始");
      toast("已停止播报");
    });
  }

  function renderNewsList(items) {
    const list = $("n-list");
    if (!list) return;
    if (!items || !items.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📰</div><p>暂无新闻</p><span>点击「🔄 刷新新闻」抓取今日全球要闻,然后即可播报收听</span></div>`;
      return;
    }
    list.innerHTML = items.map((it) =>
      `<div class="gen-card news-card" data-id="${it.id}"><div class="gen-card-head">
        <div><div class="gen-card-title">${escapeHtml(it.title)}${it.titleZh ? `<div style="font-size:12px;color:var(--text-sub);margin-top:2px">${escapeHtml(it.titleZh)}</div>` : ""}</div>
        <div class="gen-card-meta"><span class="ai-badge">${it.tag}</span>${it.pub ? `<span>${escapeHtml(it.pub.slice(0,16))}</span>` : ""}</div></div>
        <div class="gen-card-actions">
          <button class="icon-btn btn-n-speak" data-id="${it.id}" data-title="${escapeHtml(it.title)}" data-en="${escapeHtml(it.en)}" data-zh="${escapeHtml(it.zh || "")}" title="播报本条">🔊</button>
          <button class="icon-btn btn-n-save" data-id="${it.id}" title="收藏">⭐</button>
          ${it.link ? `<a class="icon-btn" href="${escapeHtml(it.link)}" target="_blank" rel="noopener" title="原文" style="display:grid;place-items:center;text-decoration:none">↗</a>` : ""}
        </div>
      </div>
      <div class="gen-card-body news-bilingual">
        <div class="news-en"><b>EN</b> ${escapeHtml(it.en)}</div>
        ${it.zh ? `<div class="news-zh"><b>中</b> ${escapeHtml(it.zh)}</div>` : '<div class="muted news-zh" style="font-size:11px">中文翻译加载中或网络受限</div>'}
      </div></div>`
    ).join("");
    list.querySelectorAll(".btn-n-speak").forEach((b) => b.addEventListener("click", () => {
      // 单条播报:中文标题 + 英文正文(有中文摘要也播)
      if (!window.speechSynthesis && !window.Audio) { toast("当前浏览器不支持语音播报"); return; }
      const title = b.dataset.title || "";
      const en = b.dataset.en || "";
      const zh = b.dataset.zh || "";
      // 高亮这张卡
      document.querySelectorAll(".news-card").forEach((c) => c.classList.remove("n-speaking"));
      const card = document.querySelector(`.news-card[data-id="${b.dataset.id}"]`);
      if (card) card.classList.add("n-speaking");
      // 更新播放器标题 & 开始播放
      const rateInput = $("np-rate");
      const rv = rateInput ? parseFloat(rateInput.value) : 0.95;
      const tEl = $("np-title"), sEl = $("np-sub");
      if (tEl) tEl.innerHTML = `🔊 单条播报 · ${title.slice(0, 40)}…`;
      if (sEl) sEl.innerHTML = `语速 ${rv.toFixed(2)}x`;
      const player = $("n-player"); if (player) player.classList.add("playing");
      const pb = $("np-play"); if (pb) pb.textContent = "⏸";
      TTS.cancel();
      const queue = [
        { text: `${title}。`, lang: "zh-CN" },
        { text: `${en.slice(0, 400)}`, lang: "en-US" },
      ];
      if (zh) queue.push({ text: zh.slice(0, 400), lang: "zh-CN" });
      let idx = 0;
      const play = () => {
        if (idx >= queue.length) {
          document.querySelectorAll(".news-card").forEach((c) => c.classList.remove("n-speaking"));
          if (player) player.classList.remove("playing");
          if (pb) pb.textContent = "▶";
          if (tEl) tEl.innerHTML = "🔈 已结束单条播报";
          return;
        }
        TTS.speak(queue[idx].text, queue[idx].lang, {
          rate: rv,
          onend: () => { idx++; play(); },
          onerror: () => { idx++; play(); },
        });
      };
      setTimeout(play, 100);
    }));
    list.querySelectorAll(".btn-n-save").forEach((b) => b.addEventListener("click", async () => {
      const it = items.find((x) => x.id === b.dataset.id);
      if (!it) return;
      let zh = it.zh || "";
      if (!zh && getAIConfig().apiKey) {
        toast("AI 翻译中…");
        const sum = await callAI("news-summary", { items: [{ title: it.title, en: it.en }] });
        zh = typeof sum === "string" ? sum.slice(0, 200) : "";
      }
      const arr = getMod("newsSaved");
      arr.unshift({ id: uid(), date: todayStr(), tag: it.tag, title: it.title, zh, en: it.en, at: Date.now() });
      setMod("newsSaved", arr); toast("已收藏"); renderNews();
    }));
  }


  /* ============================================================
   * 存钱计划
   * ============================================================ */
  function initSaving() {
    const root = $("mod-saving");
    if (!root) return;
    $("desc-saving").textContent = "设定目标,打卡存钱,可视化进度";
    MODULE_RENDER.saving = renderSaving;
    if (!state.data.savingGoal) state.data.savingGoal = { total: 10000, deadline: addDays(todayStr(), 180), deposited: 0 };
    renderSaving();
  }
  function renderSaving() {
    const root = $("mod-saving");
    const g = state.data.savingGoal;
    const pct = g.total ? Math.min(100, Math.round((g.deposited / g.total) * 100)) : 0;
    const left = g.total - g.deposited;
    const days = Math.max(0, Math.round((new Date(g.deadline) - new Date(todayStr())) / 86400000));
    let html = `<div class="mod-stats">
      <div class="mod-stat"><div class="mod-stat-label">目标</div><div class="mod-stat-value">¥${g.total}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">已存</div><div class="mod-stat-value">¥${g.deposited}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">差额</div><div class="mod-stat-value">¥${left}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">剩余天数</div><div class="mod-stat-value">${days}</div></div>
    </div>`;
    html += `<div class="gen-card"><div class="gen-card-title">进度 ${pct}%</div>
      <div class="progress-bar" style="margin:10px 0"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
    html += `<div class="gen-form">
      <div class="gen-form-row"><input type="number" id="sv-total" value="${g.total}" placeholder="目标金额">
      <input type="date" id="sv-deadline" value="${g.deadline}"></div>
      <div class="gen-form-row"><input type="number" id="sv-add" placeholder="本次存入金额" min="0">
      <button class="btn btn-primary" id="sv-deposit">存入</button></div>
      <div class="gen-form-actions"><button class="btn btn-ghost" id="sv-update">更新目标</button></div>
    </div>`;
    const logs = getMod("savingLog");
    html += `<h3 class="block-title">存入记录</h3><div class="gen-list">` +
      (logs.length ? logs.slice(0, 10).map((l) => `<div class="gen-card"><div class="gen-card-meta"><span>${l.date}</span><span>+¥${l.amount}</span></div></div>`).join("") : '<div class="muted">暂无记录</div>') + `</div>`;
    root.innerHTML = html;
    $("sv-deposit").addEventListener("click", () => {
      const amt = parseFloat($("sv-add").value) || 0;
      if (amt <= 0) { toast("请输入金额"); return; }
      g.deposited += amt;
      const logs = getMod("savingLog");
      logs.unshift({ id: uid(), date: todayStr(), amount: amt, at: Date.now() });
      setMod("savingLog", logs); saveData(); renderSaving(); toast(`已存入 ¥${amt}`);
    });
    $("sv-update").addEventListener("click", () => {
      g.total = parseFloat($("sv-total").value) || g.total;
      g.deadline = $("sv-deadline").value || g.deadline;
      saveData(); renderSaving(); toast("目标已更新");
    });
  }

  /* ============================================================
   * 每日记账
   * ============================================================ */
  function initFinance() {
    const root = $("mod-finance");
    if (!root) return;
    $("desc-finance").textContent = "快速记账,月度收支汇总";
    MODULE_RENDER.finance = renderFinance;
    renderFinance();
  }
  function renderFinance() {
    const root = $("mod-finance");
    const logs = getMod("financeLog");
    const month = todayStr().slice(0, 7);
    const monthLogs = logs.filter((l) => l.date.startsWith(month));
    const expense = monthLogs.filter((l) => l.type === "expense").reduce((s, l) => s + l.amount, 0);
    const income = monthLogs.filter((l) => l.type === "income").reduce((s, l) => s + l.amount, 0);
    let html = `<div class="mod-stats">
      <div class="mod-stat"><div class="mod-stat-label">本月支出</div><div class="mod-stat-value" style="color:var(--danger)">¥${expense}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">本月收入</div><div class="mod-stat-value" style="color:var(--done)">¥${income}</div></div>
      <div class="mod-stat"><div class="mod-stat-label">结余</div><div class="mod-stat-value">¥${income - expense}</div></div>
    </div>`;
    html += `<div class="gen-form">
      <div class="gen-form-row"><select id="fi-type"><option value="expense">支出</option><option value="income">收入</option></select>
      <input type="number" id="fi-amount" placeholder="金额" min="0"></div>
      <div class="gen-form-row"><select id="fi-cat"><option>餐饮</option><option>购物</option><option>交通</option><option>娱乐</option><option>学习</option><option>医疗</option><option>其他</option></select>
      <input type="text" id="fi-note" placeholder="备注"></div>
      <div class="gen-form-actions"><button class="btn btn-primary" id="fi-add">+ 记一笔</button></div>
    </div>`;
    html += `<h3 class="block-title">最近记录</h3><div class="gen-list">` +
      (logs.length ? logs.slice(0, 15).map((l) => `<div class="gen-card"><div class="gen-card-meta"><span>${l.date}</span><span>${l.type === "expense" ? "支出" : "收入"}</span><span>${l.cat}</span><span style="color:${l.type === "expense" ? "var(--danger)" : "var(--done)"}">${l.type === "expense" ? "-" : "+"}¥${l.amount}</span></div>${l.note ? `<div class="gen-card-body">${escapeHtml(l.note)}</div>` : ""}</div>`).join("") : '<div class="muted">暂无记录</div>') + `</div>`;
    root.innerHTML = html;
    $("fi-add").addEventListener("click", () => {
      const amt = parseFloat($("fi-amount").value) || 0;
      if (amt <= 0) { toast("请输入金额"); return; }
      const list = getMod("financeLog");
      list.unshift({ id: uid(), date: todayStr(), type: $("fi-type").value, amount: amt, cat: $("fi-cat").value, note: $("fi-note").value.trim(), at: Date.now() });
      setMod("financeLog", list); renderFinance(); toast("已记录");
    });
  }

  /* ============================================================
   * 设置(数据导出/导入/AI key 占位)
   * ============================================================ */
  function initSettings() {
    const root = $("mod-settings");
    if (!root) return;
    $("desc-settings").textContent = "数据管理、AI 配置、主题";
    MODULE_RENDER.settings = renderSettings;
    renderSettings();
  }
  function renderSettings() {
    const root = $("mod-settings");
    const cfg = getAIConfig();
    const size = new Blob([JSON.stringify(state.data)]).size;
    let html = `<div class="review-block">
      <h3 class="block-title">📊 数据统计</h3>
      <div class="summary-kv">
        <span>数据大小:<b>${(size / 1024).toFixed(1)} KB</b></span>
        <span>任务天数:<b>${Object.keys(state.data.tasks || {}).length}</b></span>
        <span>模块数:<b>${Object.keys(state.data.modules || {}).length}</b></span>
      </div>
    </div>`;
    html += `<div class="review-block"><h3 class="block-title">💾 数据导出 / 导入</h3>
      <div class="timer-controls">
        <button class="btn btn-primary" id="set-export">导出全部数据(JSON)</button>
        <label class="btn btn-ghost" style="cursor:pointer">导入数据<input type="file" id="set-import" accept=".json" style="display:none"></label>
        <button class="btn btn-ghost" id="set-clear" style="color:var(--danger)">清空全部数据</button>
      </div></div>`;
    html += `<div class="review-block"><h3 class="block-title">🤖 AI 配置 ${cfg.apiKey ? '<span class="ai-badge">已启用</span>' : '<span class="muted" style="font-size:12px">未配置(离线模式)</span>'}</h3>
      <p class="muted">配置后,闪卡生成/塔罗解读/口语评分/复盘总结/新闻翻译将调用真实 AI;未配置则使用离线规则。</p>
      <div class="gen-form-row"><select id="set-aimodel">
        <option value="gpt-4o-mini" ${cfg.model==="gpt-4o-mini"?"selected":""}>OpenAI GPT-4o mini</option>
        <option value="gpt-4o" ${cfg.model==="gpt-4o"?"selected":""}>OpenAI GPT-4o</option>
        <option value="claude-3-5-sonnet" ${cfg.model==="claude-3-5-sonnet"?"selected":""}>Claude 3.5 Sonnet(需兼容端点)</option>
        <option value="deepseek-chat" ${cfg.model==="deepseek-chat"?"selected":""}>DeepSeek Chat</option>
        <option value="qwen-plus" ${cfg.model==="qwen-plus"?"selected":""}>通义千问</option>
      </select>
      <input type="password" id="set-apikey" placeholder="API Key(仅保存在本地)" value="${escapeHtml(cfg.apiKey||"")}"></div>
      <div class="gen-form-row"><input type="text" id="set-baseurl" placeholder="API Base URL(可选,默认 OpenAI 官方)" value="${escapeHtml(cfg.baseUrl||"")}">
      <input type="text" id="set-apikey2" placeholder="再次输入 API Key 确认(留空表示不修改)"></div>
      <div class="gen-form-row"><input type="text" id="set-audiomodel" placeholder="音频转写模型(可选,默认 whisper-1)" value="${escapeHtml(cfg.audioModel||"")}">
      <span class="muted" style="font-size:12px;align-self:center">用于英语字幕模块的音视频转写</span></div>
      <div class="gen-form-actions"><button class="btn btn-primary" id="set-aisave">💾 保存并启用 AI</button>
      ${cfg.apiKey ? '<button class="btn btn-ghost" id="set-aidisable" style="color:var(--danger)">关闭 AI</button>' : ""}</div>
      <p class="muted" style="font-size:12px;margin-top:8px">⚠ 说明:API Key 仅保存在浏览器本地,不上传任何服务器。调用时由浏览器直连对应服务商,请确保信任该环境。DeepSeek/通义千问需填写对应的 Base URL。</p>
      ${state.data.aiUsage ? `<p class="muted" style="font-size:12px">累计调用:${state.data.aiUsage.calls} 次 · Token:${state.data.aiUsage.tokens}</p>` : ""}
    </div>`;
    html += `<div class="review-block"><h3 class="block-title">🎨 主题</h3>
      <button class="btn btn-ghost" id="set-theme">切换明暗主题</button></div>`;
    root.innerHTML = html;
    $("set-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `workbench-backup-${todayStr()}.json`;
      a.click();
      toast("已导出");
    });
    $("set-import").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          state.data = JSON.parse(r.result);
          saveData(); toast("导入成功,刷新生效"); setTimeout(() => location.reload(), 800);
        } catch { toast("导入失败:文件格式错误"); }
      };
      r.readAsText(f);
    });
    $("set-clear").addEventListener("click", () => {
      if (!confirm("确定清空全部数据?此操作不可恢复,建议先导出备份!")) return;
      if (!confirm("再次确认:真的要清空所有数据吗?")) return;
      localStorage.removeItem(STORE_KEY);
      location.reload();
    });
    $("set-aisave").addEventListener("click", () => {
      const key = $("set-apikey").value.trim();
      const key2 = $("set-apikey2").value.trim();
      // 输入了新 key 但没在确认框重复输入 → 拦截(防止误填)
      if (key && !key2) { toast("请在下方「确认 API Key」框中再次输入以确认"); return; }
      if (key && key !== key2) { toast("两次输入的 API Key 不一致"); return; }
      const model = $("set-aimodel").value;
      const baseUrl = $("set-baseurl").value.trim();
      const audioModel = $("set-audiomodel").value.trim();
      setAIConfig({ apiKey: key, model, baseUrl, audioModel });
      toast(key ? "AI 配置已保存,已启用真实 AI" : "已清空配置,切换为离线模式");
      renderSettings();
    });
    const disBtn = $("set-aidisable");
    if (disBtn) disBtn.addEventListener("click", () => {
      setAIConfig({ apiKey: "", model: "", baseUrl: "" });
      toast("已关闭 AI,切换为离线模式");
      renderSettings();
    });
    $("set-theme").addEventListener("click", () => $("themeToggle").click());
  }

  /* ============================================================
   * 复盘枢纽:汇聚各模块当日数据
   * ============================================================ */
  function collectDayData(date) {
    const tasks = getTasks(date);
    const taskDone = tasks.filter((t) => t.status === "done").length;
    const fcLog = (state.data.fcLog || {})[date] || 0;
    const speakLogs = (getMod("speakingLog") || []).filter((l) => l.date === date);
    const medLogs = (getMod("meditationLog") || []).filter((l) => l.date === date);
    const finLogs = (getMod("financeLog") || []).filter((l) => l.date === date);
    const expense = finLogs.filter((l) => l.type === "expense").reduce((s, l) => s + l.amount, 0);
    const pdLogs = (getMod("photodiary") || []).filter((l) => l.date === date);
    const tarotLogs = (getMod("tarotLog") || []).filter((l) => l.date === date);
    const vocabLearned = (getMod("vocabLearned") || []).filter((l) => (l.at && new Date(l.at).toISOString().slice(0, 10) === date)).length;
    return {
      taskTotal: tasks.length, taskDone,
      taskRate: tasks.length ? Math.round((taskDone / tasks.length) * 100) : 0,
      flashcard: fcLog,
      vocab: vocabLearned,
      speaking: speakLogs.length,
      meditation: medLogs.length, meditationMin: medLogs.reduce((s, l) => s + l.duration, 0),
      finance: finLogs.length, expense,
      photo: pdLogs.length,
      tarot: tarotLogs.length,
      korean: state.data.koreanProg || 0,
    };
  }

  function renderDailyReviewHub() {
    // 在复盘面板顶部插入"当日数据汇聚"卡片(若不存在)
    const panel = $("panel-review");
    if (!panel || $("dailyHub")) return;
    const header = panel.querySelector(".panel-header");
    const hub = document.createElement("div");
    hub.id = "dailyHub";
    hub.className = "review-block";
    header.after(hub);
    refreshDailyHub();
  }
  function refreshDailyHub() {
    const hub = $("dailyHub");
    if (!hub) return;
    const d = collectDayData(state.viewDate);
    const items = [
      ["📋 计划完成", `${d.taskDone}/${d.taskTotal} (${d.taskRate}%)`],
      ["🃏 闪卡复习", d.flashcard],
      ["📖 背单词", d.vocab],
      ["🗣️ 口语练习", d.speaking],
      ["🇰🇷 韩语进度", d.korean],
      ["🧘 冥想", d.meditation ? `${d.meditation}次/${d.meditationMin}min` : 0],
      ["🔮 塔罗", d.tarot],
      ["🧾 今日支出", `¥${d.expense}`],
      ["📷 照片日记", d.photo],
    ];
    hub.innerHTML = `<h3 class="block-title">📊 当日全模块数据汇聚(${fmtDateCN(state.viewDate)})</h3>
      <div class="review-stats" style="grid-template-columns:repeat(3,1fr)">` +
      items.map(([k, v]) => `<div class="rstat-card"><div class="rstat-label">${k}</div><div class="rstat-value" style="font-size:16px">${v}</div></div>`).join("") +
      `</div>
      <button class="btn btn-primary" id="hub-ai" style="margin-top:10px">🤖 AI 生成当日成长评语</button>
      <div id="hub-ai-result" style="margin-top:10px"></div>`;
    $("hub-ai").addEventListener("click", async () => {
      $("hub-ai-result").innerHTML = '<div class="muted">AI 分析中…</div>';
      const summary = await callAI("review-summary", { data: d, date: state.viewDate });
      $("hub-ai-result").innerHTML = `<div class="gen-card"><div class="gen-card-body">${escapeHtml(summary)}</div></div>`;
    });
  }

  /* ============================================================
   * 请求通知权限
   * ============================================================ */
  function requestNotify() {
    try {
      if (Notification && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch {}
  }

  /* ---------- 备忘录提醒检查 ---------- */
  function checkMemoReminders() {
    const memos = getMod("memo");
    if (!memos.length) return;
    const today = todayStr();
    const due = memos.filter((m) => m.remind && isValidDateStr(m.remind) && m.remind <= today && !m._remindedShown);
    if (!due.length) return;
    // 标记已提醒(避免重复弹通知)
    due.forEach((m) => { m._remindedShown = true; });
    saveData();
    const titles = due.map((m) => m.title || "(无标题)").slice(0, 3).join("、");
    toast(`🔔 备忘提醒:${titles}${due.length > 3 ? ` 等 ${due.length} 条` : ""}`, "warn");
    try {
      if (Notification && Notification.permission === "granted") {
        new Notification("🔔 备忘录提醒", { body: `今日有 ${due.length} 条待办:${titles}` });
      }
    } catch {}
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  function init() {
    initTheme();
    buildNav();
    renderSidebarToday();
    initTasks();
    initTimer();
    initTimerLink();
    initCountdown();
    initReview();
    initEnglish();
    buildPanels();
    renderDailyReviewHub();
    requestNotify();
    refreshTimerTaskLink();
    initMobileDrawer();
    initPWA();
    applyHashNav();
    // 备忘录提醒:启动后 2s 检查一次,之后每小时检查一次
    setTimeout(checkMemoReminders, 2000);
    setInterval(checkMemoReminders, 3600000);
  }

  /* ---------- PWA 安装按钮 + 快捷方式 URL hash ---------- */
  function initPWA() {
    const btn = $("installBtn");
    const mbtn = $("mobileInstallBtn");
    const showBtns = () => {
      if (btn) btn.style.display = "block";
      if (mbtn) mbtn.style.display = "block";
    };
    const hideBtns = () => {
      if (btn) btn.style.display = "none";
      if (mbtn) mbtn.style.display = "none";
    };
    const isStandalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true; // iOS

    // 已经作为 PWA 启动,隐藏安装按钮
    if (isStandalone()) { hideBtns(); }

    // beforeinstallprompt 已触发:显示按钮
    if (window.__pwaDeferredPrompt) showBtns();
    document.addEventListener("pwa-installable", showBtns);
    document.addEventListener("pwa-installed", () => {
      hideBtns();
      toast("🎉 已成功安装为 APP!");
    });

    const doInstall = async () => {
      if (window.__pwaDeferredPrompt) {
        try {
          window.__pwaDeferredPrompt.prompt();
          const { outcome } = await window.__pwaDeferredPrompt.userChoice;
          if (outcome === "accepted") hideBtns();
        } catch (e) { toast("安装提示被浏览器拦截", "warn"); }
      } else {
        // iOS Safari 或未支持 beforeinstallprompt 的浏览器:给出手动安装指引
        const ua = navigator.userAgent || "";
        const isIOS = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        if (isIOS && isSafari) {
          toast("iOS Safari:点底部 ⇪ 分享 → 「添加到主屏幕」", "warn", 5000);
        } else {
          toast("浏览器暂不支持一键安装,请在菜单中选择「安装应用/添加到主屏幕」", "warn", 5000);
        }
      }
    };
    if (btn) btn.addEventListener("click", doInstall);
    if (mbtn) mbtn.addEventListener("click", doInstall);
  }

  /* ---------- 支持 PWA 快捷方式通过 URL hash 直接跳模块,例如 #korean → 韩语对话 ---------- */
  function applyHashNav() {
    const go = () => {
      const h = (location.hash || "").replace(/^#/, "");
      if (!h) return;
      // 支持的模块名映射(hash → 导航 tab 名)
      const map = {
        tasks:"tasks",timer:"timer",countdown:"countdown",review:"review",
        english:"english",flashcard:"flashcard",vocab:"vocab",speaking:"english",
        photodiary:"photodiary",korean:"korean",memo:"memo",fitness:"fitness",
        content:"content",notes:"notes",genki:"genki",aicoach:"aicoach",cards:"cards",
        tarot:"tarot",almanac:"almanac"
      };
      const tab = map[h.toLowerCase()];
      if (tab) switchTab(tab);
    };
    go();
    window.addEventListener("hashchange", go);
  }

  /* ---------- 移动端抽屉菜单 ---------- */
  function initMobileDrawer() {
    const sidebar = $("sidebar");
    const menuBtn = $("mobileMenuBtn");
    const overlay = $("mobileOverlay");
    const MOBILE_BP = 860;

    const isMobile = () => window.innerWidth <= MOBILE_BP;

    const openDrawer = () => {
      sidebar.classList.add("open");
      overlay.classList.add("show");
    };
    const closeDrawer = () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("show");
    };

    if (menuBtn) menuBtn.addEventListener("click", () => {
      if (sidebar.classList.contains("open")) closeDrawer();
      else openDrawer();
    });
    if (overlay) overlay.addEventListener("click", closeDrawer);

    // ESC 键关闭抽屉
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) closeDrawer();
    });

    // 窗口大小变化时自动处理
    window.addEventListener("resize", () => {
      if (!isMobile()) closeDrawer();
    });

    // 点击导航项后自动关闭(移动端)
    const origSwitchTab = switchTab;
    window.switchTab = function(tab) {
      origSwitchTab(tab);
      if (isMobile()) closeDrawer();
      const item = document.querySelector(`.nav-item[data-tab="${tab}"] .nav-label`);
      if (item) $("mobileTitle").textContent = item.textContent;
    };
  }

  document.addEventListener("DOMContentLoaded", init);

  /* ---------- 异步加载可选 CDN 库(PDF/Word 解析),不阻塞主页面 ---------- */
  function loadCdnLib(url, globalName, timeoutMs) {
    return new Promise((resolve) => {
      if (window[globalName]) { resolve(true); return; }
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      let done = false;
      const finish = (ok) => {
        if (done) return; done = true;
        resolve(ok && !!window[globalName]);
      };
      s.onload = () => finish(true);
      s.onerror = () => finish(false);
      document.head.appendChild(s);
      if (timeoutMs) setTimeout(() => finish(false), timeoutMs);
    });
  }
  // 页面渲染后 1.5s 再加载 PDF/Word 库,避免阻塞主页面
  window.addEventListener("load", () => {
    setTimeout(() => {
      loadCdnLib("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js", "pdfjsLib", 8000).then((ok) => {
        if (!ok) console.warn("[cdn] pdfjs-dist load failed or skipped (non-fatal)");
        else if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      });
      loadCdnLib("https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js", "mammoth", 8000).then((ok) => {
        if (!ok) console.warn("[cdn] mammoth load failed or skipped (non-fatal)");
      });
    }, 1500);
  });
})();
