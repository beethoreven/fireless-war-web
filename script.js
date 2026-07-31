const API_BASE = "https://fireless-war-backend.onrender.com";

const datePicker = document.getElementById("date-picker");
const hourPicker = document.getElementById("hour-picker");
const minutePicker = document.getElementById("minute-picker");
const fieldYear = document.getElementById("field-year");
const fieldMonth = document.getElementById("field-month");
const fieldDay = document.getElementById("field-day");
const fieldHour = document.getElementById("field-hour");
const fieldMinute = document.getElementById("field-minute");
const fieldEmail = document.getElementById("field-email");
const btnReadRecord = document.getElementById("btn-read-record");

const toastEl = document.getElementById("toast");
const dialogOverlay = document.getElementById("dialog-overlay");
const dialogMessage = document.getElementById("dialog-message");
const dialogYesBtn = document.getElementById("dialog-yes");
const dialogNoBtn = document.getElementById("dialog-no");

let toastTimer = null;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function pad4(n) {
  return String(n).padStart(4, "0");
}

function showToast(message, type) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = "toast visible" + (type ? ` toast--${type}` : "");
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 2800);
}

function setLoading(isLoading) {
  btnReadRecord.disabled = isLoading;
  btnReadRecord.textContent = isLoading ? "讀取中…" : "讀取記錄表";
}

function populateTimeSelect(selectEl, max) {
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "--";
  selectEl.appendChild(blank);
  for (let i = 0; i <= max; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = pad2(i);
    selectEl.appendChild(option);
  }
}

populateTimeSelect(hourPicker, 23);
populateTimeSelect(minutePicker, 59);

// 挑好日期/時/分後,把數字帶進下方手動欄位;實際送出仍然只看手動欄位的值
datePicker.addEventListener("change", () => {
  if (!datePicker.value) return;
  const [y, m, d] = datePicker.value.split("-");
  fieldYear.value = Number(y);
  fieldMonth.value = Number(m);
  fieldDay.value = Number(d);
});

hourPicker.addEventListener("change", () => {
  if (hourPicker.value === "") return;
  fieldHour.value = Number(hourPicker.value);
});

minutePicker.addEventListener("change", () => {
  if (minutePicker.value === "") return;
  fieldMinute.value = Number(minutePicker.value);
});

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function readManualDatetime() {
  return {
    year: fieldYear.value.trim(),
    month: fieldMonth.value.trim(),
    day: fieldDay.value.trim(),
    hour: fieldHour.value.trim(),
    minute: fieldMinute.value.trim(),
  };
}

function validateDatetime(raw) {
  if (!raw.year || !raw.month || !raw.day || !raw.hour || !raw.minute) {
    return { ok: false, error: "缺少日期時間參數" };
  }

  const year = Number(raw.year);
  const month = Number(raw.month);
  const day = Number(raw.day);
  const hour = Number(raw.hour);
  const minute = Number(raw.minute);

  const isValid =
    Number.isInteger(year) && year >= 1970 && year <= 9999 &&
    Number.isInteger(month) && month >= 1 && month <= 12 &&
    Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month) &&
    Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
    Number.isInteger(minute) && minute >= 0 && minute <= 59;

  if (!isValid) {
    return { ok: false, error: "日期時間格式錯誤" };
  }

  return { ok: true, value: { year, month, day, hour, minute } };
}

function validateEmail(raw) {
  const email = raw.trim();
  if (!email) {
    return { ok: false, error: "缺少 Email 參數" };
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return { ok: false, error: "Email 格式驗證失敗" };
  }
  return { ok: true, value: email };
}

function toDatetimeParam(dt) {
  return `${pad4(dt.year)}_${pad2(dt.month)}_${pad2(dt.day)}_${pad2(dt.hour)}_${pad2(dt.minute)}`;
}

function hideDialog() {
  dialogOverlay.classList.remove("visible");
}

function showNotFoundDialog(dt, datetimeParam, email) {
  dialogMessage.textContent =
    `無法找到${dt.year}年${pad2(dt.month)}月${pad2(dt.day)}日${pad2(dt.hour)}:${pad2(dt.minute)}的遊戲紀錄，請問是否新建`;
  dialogOverlay.classList.add("visible");

  dialogYesBtn.onclick = () => {
    hideDialog();
    createRecord(datetimeParam, email);
  };
  dialogNoBtn.onclick = () => {
    hideDialog();
  };
}

async function fetchRecord(dt, datetimeParam, email) {
  setLoading(true);
  try {
    const res = await fetch(
      `${API_BASE}/record?datetime=${encodeURIComponent(datetimeParam)}&email=${encodeURIComponent(email)}`
    );

    if (res.status === 200) {
      const data = await res.json();
      lastUsedEmail = email;
      await enterPage2(data.spreadsheet_id);
    } else if (res.status === 404) {
      showNotFoundDialog(dt, datetimeParam, email);
    } else if (res.status === 401) {
      showToast("Email 未獲授權", "error");
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "讀取時發生錯誤，請稍後再試", "error");
    }
  } catch (err) {
    showToast("連線失敗，請確認網路連線或稍後再試", "error");
  } finally {
    setLoading(false);
  }
}

async function createRecord(datetimeParam, email) {
  setLoading(true);
  try {
    const res = await fetch(
      `${API_BASE}/record?datetime=${encodeURIComponent(datetimeParam)}&email=${encodeURIComponent(email)}`,
      { method: "POST" }
    );

    if (res.status === 201) {
      showToast("創建成功", "success");
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "建立時發生錯誤，請稍後再試", "error");
    }
  } catch (err) {
    showToast("連線失敗，請確認網路連線或稍後再試", "error");
  } finally {
    setLoading(false);
  }
}

btnReadRecord.addEventListener("click", () => {
  const dtResult = validateDatetime(readManualDatetime());
  if (!dtResult.ok) {
    showToast(dtResult.error, "error");
    return;
  }

  const emailResult = validateEmail(fieldEmail.value);
  if (!emailResult.ok) {
    showToast(emailResult.error, "error");
    return;
  }

  const datetimeParam = toDatetimeParam(dtResult.value);
  fetchRecord(dtResult.value, datetimeParam, emailResult.value);
});

// ===== 頁面二 =====

const ROUND_OPTIONS = [
  { label: "第一天財報", day: "1st", type: "Morning" },
  { label: "第一天預期", day: "1st", type: "Report" },
  { label: "第二天財報", day: "2nd", type: "Morning" },
  { label: "第二天預期", day: "2nd", type: "Report" },
  { label: "第三天財報", day: "3rd", type: "Morning" },
  { label: "第三天預期", day: "3rd", type: "Report" },
  { label: "第四天財報", day: "4th", type: "Morning" },
  { label: "第四天預期", day: "4th", type: "Report" },
  { label: "第五天財報", day: "5th", type: "Morning" },
  { label: "第五天預期", day: "5th", type: "Report" },
  { label: "第六天財報", day: "6th", type: "Morning" },
  { label: "第六天預期", day: "6th", type: "Report" },
  { label: "第七天財報", day: "7th", type: "Morning" },
  { label: "第七天預期", day: "7th", type: "Report" },
  { label: "最終結算", day: "Final", type: "Report" },
];

const BUSINESS_ORDER = ["general_business", "finance", "sex", "drug", "arms"];

const BUSINESS_LABELS_DEFAULT = {
  general_business: "正當事業",
  finance: "闇金",
  sex: "色情",
  drug: "毒品",
  arms: "軍火",
};

const BUSINESS_LABELS_ONIWARA_OUT = {
  general_business: "正當事業",
  finance: "金融",
  sex: "餐酒",
  drug: "藥妝",
  arms: "軍火",
};

const BUSINESS_COLORS_DEFAULT = {
  general_business: "#ffffff",
  finance: "#f5d442",
  sex: "#9b59b6",
  drug: "#2b2b2b",
  arms: "#2ecc71",
};

const BUSINESS_COLORS_ONIWARA_OUT = {
  general_business: "#ffffff",
  finance: "#ffffff",
  sex: "#ffffff",
  drug: "#ffffff",
  arms: "#2ecc71",
};

const PANEL_SLUGS = ["oniwara", "mike", "kinugawa", "kouno", "ph003"];

const page1El = document.querySelector(".page1");
const page2El = document.getElementById("page2");
const chartGridEl = document.querySelector(".chart-grid");
const loadingOverlayEl = document.getElementById("loading-overlay");
const switchZoneEl = document.getElementById("switch-zone");
const roundLabelDisplayEl = document.getElementById("round-label-display");
const scrollerEl = document.getElementById("scroller");
const scrollerPrevBtn = document.getElementById("scroller-prev");
const scrollerNextBtn = document.getElementById("scroller-next");
const btnRoundRead = document.getElementById("btn-round-read");
const legalBusinessValueEl = document.getElementById("legal-business-value");
const illegalBusinessValueEl = document.getElementById("illegal-business-value");
const warningBannerEl = document.getElementById("warning-banner");

let lastUsedEmail = "";
let currentSpreadsheetId = null;
let scrollerIndex = 0;
const chartInstances = {};

function showLoading() {
  loadingOverlayEl.hidden = false;
}

function hideLoading() {
  loadingOverlayEl.hidden = true;
}

function fadeOut(el) {
  return new Promise((resolve) => {
    el.classList.add("fade-out");
    setTimeout(() => {
      el.hidden = true;
      el.classList.remove("fade-out");
      resolve();
    }, 350);
  });
}

function fadeIn(el) {
  el.hidden = false;
  el.style.opacity = "0";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.opacity = "";
      el.classList.add("fade-in");
    });
  });
  setTimeout(() => el.classList.remove("fade-in"), 400);
}

function buildScroller() {
  scrollerEl.innerHTML = "";
  ROUND_OPTIONS.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "switch-zone__option";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => setScrollerIndex(idx));
    scrollerEl.appendChild(btn);
  });
}

function setScrollerIndex(idx) {
  scrollerIndex = Math.max(0, Math.min(ROUND_OPTIONS.length - 1, idx));
  const options = scrollerEl.querySelectorAll(".switch-zone__option");
  options.forEach((el, i) => {
    el.classList.toggle("is-selected", i === scrollerIndex);
  });
  const selectedEl = options[scrollerIndex];
  if (selectedEl) {
    selectedEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
}

scrollerPrevBtn.addEventListener("click", () => setScrollerIndex(scrollerIndex - 1));
scrollerNextBtn.addEventListener("click", () => setScrollerIndex(scrollerIndex + 1));

function renderPanel(slug, entry, type, oniwaraOut) {
  const panel = document.querySelector(`.chart-panel[data-slug="${slug}"]`);
  if (!panel || !entry) return;

  panel.querySelector(".chart-panel__org-name").textContent = entry.organization || "-";

  const useOniwaraLabels = slug === "oniwara" && oniwaraOut;
  const labels = useOniwaraLabels ? BUSINESS_LABELS_ONIWARA_OUT : BUSINESS_LABELS_DEFAULT;
  const colors = useOniwaraLabels ? BUSINESS_COLORS_ONIWARA_OUT : BUSINESS_COLORS_DEFAULT;

  const chartLabels = BUSINESS_ORDER.map((key) => labels[key]);
  const chartColors = BUSINESS_ORDER.map((key) => colors[key]);
  const chartValues = BUSINESS_ORDER.map((key) => entry[key]);

  const canvas = panel.querySelector("canvas");
  if (chartInstances[slug]) {
    chartInstances[slug].destroy();
  }
  chartInstances[slug] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: chartLabels,
      datasets: [
        {
          data: chartValues,
          backgroundColor: chartColors,
          borderColor: "rgba(255, 255, 255, 0.4)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0,
          max: 25,
          ticks: { color: "#f3e8dc", stepSize: 5 },
          grid: { color: "rgba(255, 255, 255, 0.08)" },
        },
        x: {
          ticks: { color: "#f3e8dc", font: { size: 10 } },
          grid: { display: false },
        },
      },
    },
  });

  const numberEls = panel.querySelectorAll(".chart-panel__number");
  const numberFields =
    type === "Morning"
      ? [
          { label: "", key: null },
          { label: "持有金錢", key: "owned_money" },
          { label: "當前積分", key: "current_integral" },
        ]
      : [
          { label: "應得收入", key: "expected_income" },
          { label: "應持金錢", key: "expected_money" },
          { label: "預期積分", key: "expected_integral" },
        ];

  numberFields.forEach((field, idx) => {
    const numberEl = numberEls[idx];
    const labelEl = numberEl.querySelector(".chart-panel__number-label");
    const valueEl = numberEl.querySelector(".chart-panel__number-value");
    const value = field.key ? entry[field.key] : null;
    if (value === null || value === undefined) {
      labelEl.textContent = "";
      valueEl.textContent = "";
    } else {
      labelEl.textContent = field.label;
      valueEl.textContent = value;
    }
  });
}

function evaluateWarning(legal, illegal, brokenTarget) {
  if (illegal > legal + brokenTarget) {
    return { level: "severe", text: "⚠ 城市經濟崩壞" };
  }
  if (illegal > legal) {
    return { level: "moderate", text: "⚠ 事業結構崩壞" };
  }
  return null;
}

function renderRoundData(data) {
  PANEL_SLUGS.forEach((slug) => {
    renderPanel(slug, data.business_level[slug], data.type, data.oniwara_out);
  });

  legalBusinessValueEl.textContent = data.legal_business;
  illegalBusinessValueEl.textContent = data.illegal_business;

  const warning = evaluateWarning(data.legal_business, data.illegal_business, data.broken_target);
  if (warning) {
    warningBannerEl.hidden = false;
    warningBannerEl.textContent = warning.text;
    warningBannerEl.className = `warning-banner warning-banner--${warning.level}`;
  } else {
    warningBannerEl.hidden = true;
    warningBannerEl.textContent = "";
    warningBannerEl.className = "warning-banner";
  }

  roundLabelDisplayEl.textContent = data.round_label;
}

async function loadRound(day, type) {
  const url =
    `${API_BASE}/round?day=${encodeURIComponent(day)}&type=${encodeURIComponent(type)}` +
    `&spreadsheet_id=${encodeURIComponent(currentSpreadsheetId)}&email=${encodeURIComponent(lastUsedEmail)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `讀取失敗(${res.status})`);
  }
  return res.json();
}

let lastRoundReadClickAt = 0;

btnRoundRead.addEventListener("click", async () => {
  // 5 秒內重複按,靜默忽略(不顯示任何提示、按鈕外觀不變),避免短時間內連續打 API
  const now = Date.now();
  if (now - lastRoundReadClickAt < 5000) {
    return;
  }
  lastRoundReadClickAt = now;

  const opt = ROUND_OPTIONS[scrollerIndex];
  btnRoundRead.disabled = true;
  await fadeOut(chartGridEl);
  showLoading();
  try {
    const data = await loadRound(opt.day, opt.type);
    renderRoundData(data);
  } catch (err) {
    showToast(err.message || "讀取失敗，請稍後再試", "error");
  } finally {
    hideLoading();
    fadeIn(chartGridEl);
    btnRoundRead.disabled = false;
  }
});

async function enterPage2(spreadsheetId) {
  currentSpreadsheetId = spreadsheetId;

  await fadeOut(page1El);
  showLoading();

  try {
    const data = await loadRound("1st", "Morning");
    buildScroller();
    setScrollerIndex(0);
    switchZoneEl.hidden = false;
    page2El.hidden = false;
    renderRoundData(data);
    fadeIn(page2El);
  } catch (err) {
    showToast(err.message || "讀取失敗，請稍後再試", "error");
    fadeIn(page1El);
  } finally {
    hideLoading();
  }
}
