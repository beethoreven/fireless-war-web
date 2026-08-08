const API_BASE = "https://fireless-war-backend.onrender.com";

// Render 免費方案閒置約 15 分鐘會休眠。GitHub Actions 的排程 keep-alive
// 無法保證真的每 10 分鐘執行(GitHub 自己的 schedule 觸發時間常常延遲數小時),
// 所以只要這個分頁還開著,就自己每 5 分鐘打一次 /status,確保遊戲進行中途
// 不會被 Render 判定閒置——不需要登入,/status 本來就是為了這個用途設計的公開端點。
// 一開始就先打一次(不等第一個 5 分鐘),盡量提早把可能還在睡的後端叫醒。
function pingKeepAlive() {
  fetch(`${API_BASE}/status`).catch(() => {});
}
pingKeepAlive();
setInterval(pingKeepAlive, 5 * 60 * 1000);

const datePicker = document.getElementById("date-picker");
const hourPicker = document.getElementById("hour-picker");
const minutePicker = document.getElementById("minute-picker");
const fieldYear = document.getElementById("field-year");
const fieldMonth = document.getElementById("field-month");
const fieldDay = document.getElementById("field-day");
const fieldHour = document.getElementById("field-hour");
const fieldMinute = document.getElementById("field-minute");
const btnReadRecord = document.getElementById("btn-read-record");

const toastEl = document.getElementById("toast");
const dialogOverlay = document.getElementById("dialog-overlay");
const dialogMessage = document.getElementById("dialog-message");
const dialogYesBtn = document.getElementById("dialog-yes");
const dialogNoBtn = document.getElementById("dialog-no");

let toastTimer = null;

// ===== Google 登入 =====

const GOOGLE_CLIENT_ID = "665970888301-g3mjmlrba8aosq5j8jlkgqbukmp3u76p.apps.googleusercontent.com";

const topBarEl = document.getElementById("top-bar");
const googleSigninBtnEl = document.getElementById("google-signin-button");
const accountSlotEl = document.getElementById("account-slot");
const accountLabelEl = document.getElementById("account-label");
const accountDropdownEl = document.getElementById("account-dropdown");
const btnSignOut = document.getElementById("btn-sign-out");

let currentIdToken = null;
let currentAuthorized = false;

function authHeaders() {
  return currentIdToken ? { Authorization: `Bearer ${currentIdToken}` } : {};
}

function updateReadButtonLock() {
  // 這裡鎖住的是「按鈕看起來能不能按」,真正擋掉未授權存取的是後端每支 API
  // 自己驗證 token——就算有人用 devtools 把 disabled 拔掉,後端一樣會擋。
  btnReadRecord.disabled = !currentAuthorized;
}

function showSignedOutUI() {
  currentIdToken = null;
  currentAuthorized = false;
  googleSigninBtnEl.hidden = false;
  accountSlotEl.hidden = true;
  accountDropdownEl.hidden = true;
  updateReadButtonLock();
}

function showSignedInUI(email) {
  googleSigninBtnEl.hidden = true;
  accountSlotEl.hidden = false;
  accountLabelEl.textContent = email ? email.split("@")[0] : "帳號";
}

async function checkAuthStatus() {
  if (!currentIdToken) return;
  try {
    const res = await fetch(`${API_BASE}/auth/status`, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200) {
      currentAuthorized = !!data.authorized;
      showSignedInUI(data.email);
      if (!currentAuthorized) {
        showToast("此帳號尚未獲得授權", "error");
      }
    } else {
      // token 過期或無效,視同沒登入,回到登入前的狀態
      showSignedOutUI();
      showToast("登入已過期，請重新登入", "error");
    }
  } catch (err) {
    // 網路層級的失敗(例如連不上後端、CORS 被擋)——一併切回登出畫面,
    // 不要讓帳號徽章停在「看起來還登入著」但按鈕被鎖住、沒有持續提示的不一致狀態。
    // 如果只是暫時的網路問題,45 分鐘那個靜默重新登入或下次重新整理會自動救回來。
    showSignedOutUI();
    showToast("無法確認登入狀態，請檢查網路連線後重新整理", "error");
  }
  updateReadButtonLock();
}

function handleCredentialResponse(response) {
  currentIdToken = response.credential;
  checkAuthStatus();
}

// 除錯用:google.accounts.id.prompt() 預設失敗時完全不會有任何畫面或錯誤訊息,
// 只能靠這個 notification callback 才知道它到底有沒有跑、為什麼沒跑。
// 診斷完問題後這段可以整個移除。
function logPromptNotification(notification) {
  if (notification.isNotDisplayed()) {
    console.warn("[GIS] 靜默登入完全沒有顯示，原因:", notification.getNotDisplayedReason());
  } else if (notification.isSkippedMoment()) {
    console.warn("[GIS] 靜默登入被跳過，原因:", notification.getSkippedReason());
  } else if (notification.isDismissedMoment()) {
    console.warn("[GIS] 靜默登入被關閉，原因:", notification.getDismissedReason());
  } else {
    console.log("[GIS] 靜默登入 moment 正常進行中");
  }
}

function initGoogleSignIn() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: true,
  });
  google.accounts.id.renderButton(googleSigninBtnEl, {
    theme: "filled_black",
    size: "medium",
    shape: "pill",
    text: "signin",
  });
  // 瀏覽器如果還留著 Google 的登入狀態,嘗試靜默登入,
  // 不需要使用者手動點——這是「重新整理就能解決,不用重新登入」的關鍵。
  google.accounts.id.prompt(logPromptNotification);
}

initGoogleSignIn();

// ID Token 大約 1 小時過期,但一場遊戲可能長達 6 小時,
// 每 45 分鐘嘗試一次靜默重新登入,盡量不要讓使用者玩到一半突然被登出。
setInterval(() => {
  if (currentIdToken) {
    google.accounts.id.prompt(logPromptNotification);
  }
}, 45 * 60 * 1000);

accountSlotEl.addEventListener("click", () => {
  accountDropdownEl.hidden = !accountDropdownEl.hidden;
});

document.addEventListener("click", (e) => {
  if (!accountSlotEl.contains(e.target)) {
    accountDropdownEl.hidden = true;
  }
});

btnSignOut.addEventListener("click", () => {
  google.accounts.id.disableAutoSelect();
  showSignedOutUI();
});

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

function setLoading(isLoading, loadingText = "讀取中…") {
  btnReadRecord.disabled = isLoading || !currentAuthorized;
  btnReadRecord.textContent = isLoading ? loadingText : "讀取記錄表";
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

function toDatetimeParam(dt) {
  return `${pad4(dt.year)}_${pad2(dt.month)}_${pad2(dt.day)}_${pad2(dt.hour)}_${pad2(dt.minute)}`;
}

function hideDialog() {
  dialogOverlay.classList.remove("visible");
}

function showNotFoundDialog(dt, datetimeParam) {
  dialogMessage.textContent =
    `無法找到${dt.year}年${pad2(dt.month)}月${pad2(dt.day)}日${pad2(dt.hour)}:${pad2(dt.minute)}的遊戲紀錄，請問是否新建`;
  dialogOverlay.classList.add("visible");

  dialogYesBtn.onclick = () => {
    hideDialog();
    createRecord(datetimeParam);
  };
  dialogNoBtn.onclick = () => {
    hideDialog();
  };
}

async function fetchRecord(dt, datetimeParam) {
  setLoading(true);
  try {
    const res = await fetch(
      `${API_BASE}/record?datetime=${encodeURIComponent(datetimeParam)}`,
      { headers: authHeaders() }
    );

    if (res.status === 200) {
      const data = await res.json();
      await enterPage2(data.spreadsheet_id);
    } else if (res.status === 404) {
      showNotFoundDialog(dt, datetimeParam);
    } else if (res.status === 401) {
      showToast("未登入或此帳號未獲授權", "error");
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

async function createRecord(datetimeParam) {
  setLoading(true, "創建中…");
  try {
    const res = await fetch(
      `${API_BASE}/record?datetime=${encodeURIComponent(datetimeParam)}`,
      { method: "POST", headers: authHeaders() }
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

  const datetimeParam = toDatetimeParam(dtResult.value);
  fetchRecord(dtResult.value, datetimeParam);
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

// 在每個長條正上方顯示當前數值(純白色文字)
Chart.register(ChartDataLabels);

const page1El = document.querySelector(".page1");
const page2El = document.getElementById("page2");
const page3El = document.getElementById("page3");
const btnStartGame = document.getElementById("btn-start-game");
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
const hotBusinessRowEl = document.getElementById("hot-business-row");
const hotBusinessValueEl = document.getElementById("hot-business-value");
const warningBannerEl = document.getElementById("warning-banner");

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

const WHEEL_ITEM_WIDTH = 140;

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

function updateScrollerSelectedClass() {
  const options = scrollerEl.querySelectorAll(".switch-zone__option");
  options.forEach((el, i) => {
    el.classList.toggle("is-selected", i === scrollerIndex);
  });
}

// 點選項/按箭頭 => 用程式捲到定位(平滑捲動)
function setScrollerIndex(idx) {
  scrollerIndex = Math.max(0, Math.min(ROUND_OPTIONS.length - 1, idx));
  updateScrollerSelectedClass();
  scrollerEl.scrollTo({ left: scrollerIndex * WHEEL_ITEM_WIDTH, behavior: "smooth" });
}

// 使用者直接滑/捲動滾輪 => 停下來後,同步目前捲到哪一格,不要再觸發程式化捲動
// (原生 scroll-snap 已經處理好吸附定位,這裡只是讓資料狀態跟畫面對齊)
let wheelScrollSettleTimer = null;
scrollerEl.addEventListener("scroll", () => {
  clearTimeout(wheelScrollSettleTimer);
  wheelScrollSettleTimer = setTimeout(() => {
    const nearestIdx = Math.round(scrollerEl.scrollLeft / WHEEL_ITEM_WIDTH);
    scrollerIndex = Math.max(0, Math.min(ROUND_OPTIONS.length - 1, nearestIdx));
    updateScrollerSelectedClass();
  }, 120);
});

scrollerPrevBtn.addEventListener("click", () => setScrollerIndex(scrollerIndex - 1));
scrollerNextBtn.addEventListener("click", () => setScrollerIndex(scrollerIndex + 1));

function getIconPath(slug, mikeOut, kounoSingle) {
  switch (slug) {
    case "oniwara":
      return "logo_icon/oniwara-logo.png";
    case "mike":
      return mikeOut ? "logo_icon/isao-logo.png" : "logo_icon/hyena-logo.png";
    case "kinugawa":
      return "logo_icon/yamoguchi-logo.png";
    case "kouno":
      return kounoSingle ? "logo_icon/kouno-logo.png" : "logo_icon/huntreak-logo.png";
    case "ph003":
      return "logo_icon/huntreak-logo.png";
  }
}

function renderPanel(slug, entry, type, oniwaraOut, mikeOut, kounoSingle) {
  const panel = document.querySelector(`.chart-panel[data-slug="${slug}"]`);
  if (!panel || !entry) return;

  panel.querySelector(".chart-panel__org-name").textContent = entry.organization || "-";

  const iconPath = getIconPath(slug, mikeOut, kounoSingle);
  const iconEl = panel.querySelector(".chart-panel__icon");
  iconEl.style.backgroundImage = iconPath ? `url('${iconPath}')` : "";

  const useOniwaraLabels = slug === "oniwara" && oniwaraOut;
  const labels = useOniwaraLabels ? BUSINESS_LABELS_ONIWARA_OUT : BUSINESS_LABELS_DEFAULT;
  const colors = useOniwaraLabels ? BUSINESS_COLORS_ONIWARA_OUT : BUSINESS_COLORS_DEFAULT;

  const chartLabels = BUSINESS_ORDER.map((key) => labels[key]);
  const chartColors = BUSINESS_ORDER.map((key) => colors[key]);
  const chartValues = BUSINESS_ORDER.map((key) => entry[key]);
  // 黑色長條在深色底圖上會消失,只有黑色的那條需要邊框讓它看得見,其他長條不要邊框
  const chartBorderColors = chartColors.map((color) => (color === "#2b2b2b" ? "rgba(255, 255, 255, 0.4)" : "transparent"));
  const chartBorderWidths = chartColors.map((color) => (color === "#2b2b2b" ? 1 : 0));

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
          borderColor: chartBorderColors,
          borderWidth: chartBorderWidths,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          color: "#fff",
          anchor: "end",
          align: "top",
          font: { weight: "bold", size: 16 },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 25,
          ticks: { color: "#f3e8dc", stepSize: 5 },
          grid: { color: "rgba(255, 255, 255, 0.08)" },
        },
        x: {
          ticks: { color: "#f3e8dc", font: { size: 20 } },
          grid: { display: false },
        },
      },
    },
  });

  const numberEls = panel.querySelectorAll(".chart-panel__number");
  // money:true 的欄位代表遊戲裡的「百萬」單位,顯示時數字後面要加 M
  const numberFields =
    type === "Morning"
      ? [
          { label: "", key: null, money: false },
          { label: "持有金錢", key: "owned_money", money: true },
          { label: "當前積分", key: "current_integral", money: false },
        ]
      : [
          { label: "應得收入", key: "expected_income", money: true },
          { label: "應持金錢", key: "expected_money", money: true },
          { label: "預期積分", key: "expected_integral", money: false },
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
      valueEl.textContent = field.money ? `${value}M` : value;
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
    renderPanel(slug, data.business_level[slug], data.type, data.oniwara_out, data.mike_out, data.kouno_single);
  });

  legalBusinessValueEl.textContent = data.legal_business;
  illegalBusinessValueEl.textContent = data.illegal_business;

  if (data.kiyoshiro_escape) {
    hotBusinessRowEl.hidden = false;
    hotBusinessValueEl.textContent = BUSINESS_LABELS_DEFAULT[data.hot_business] || "-";
  } else {
    hotBusinessRowEl.hidden = true;
    hotBusinessValueEl.textContent = "-";
  }

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
    `&spreadsheet_id=${encodeURIComponent(currentSpreadsheetId)}`;

  let res;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch (err) {
    // fetch() 本身失敗時(連線逾時、CORS 被擋、離線等),err.message 是瀏覽器自己
    // 產生的英文文字(例如 "Failed to fetch"),不能直接顯示給使用者,一律換成
    // 固定的中文訊息——呼叫端(enterPage3/btnRoundRead)是直接把 err.message 拿去
    // 顯示在 toast 上的,所以這裡丟出去的 Error 一定要保證訊息本身是中文。
    throw new Error("連線失敗,請確認網路連線或稍後再試");
  }

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
  topBarEl.hidden = true; // 帳號/登入按鈕只在首頁出現
  page2El.hidden = false;
  fadeIn(page2El);
}

btnStartGame.addEventListener("click", () => {
  enterPage3();
});

async function enterPage3() {
  await fadeOut(page2El);
  showLoading();

  try {
    const data = await loadRound("1st", "Morning");
    buildScroller();
    setScrollerIndex(0);
    // 圖表要在容器還是 hidden 的狀態下建立,讓 Chart.js 拿到的初始量測是「不存在版面」
    // 而不是「還沒穩定的版面」;等下面解除 hidden 時,Chart.js 的 ResizeObserver
    // 會偵測到容器變成可見、量到正確尺寸,自動重繪。順序顛倒(先顯示才建圖表)
    // 曾經在正式環境重現過量測到錯誤尺寸、整頁被撐爆需要捲動的問題。
    renderRoundData(data);
    switchZoneEl.hidden = false;
    page3El.hidden = false;
    fadeIn(page3El);
  } catch (err) {
    showToast(err.message || "讀取失敗，請稍後再試", "error");
    fadeIn(page2El); // 讀取失敗退回介紹頁重試,而不是打回第一頁重新讀取記錄表
  } finally {
    hideLoading();
  }
}
