// ===== Demo 版本專用的前端。=====
//
// 跟正式版 (../script.js) 的差異,只有這些:
//   - 不檢查白名單,任何登入的 Google 帳號都能查詢/建立/讀取場次,用
//     後端用 require_login 取代 require_gm,其餘流程一樣。
//   - 打 /demo-record、/demo-round 而不是 /record、/round——複製的是
//     FirelessWar_Demo 而不是正式版 Template,角色對照表也換成通用的
//     Character A~E(由後端的 DEMO_CHARACTER_SLUGS 決定,前端不用知道這件事)。
//   - 不打 /auth/status(它回的是白名單授權結果),也就沒有正式版那套
//     「暫時驗不了 vs. 真的沒授權」的重試機制——demo 不檢查白名單,
//     拿到 Google ID Token 就等於授權成功。
//   - 圖表面板不設圖示,不使用正式版角色專屬的美術素材;組織變化只靠
//     Sheet 裡的組織名稱呈現。
//   - 429 有自己的英文提示:後端全站共用的 429 handler 回的是中文訊息。
//
// 其餘(靜默登入與 45 分鐘續期、日期時間選取/查詢/建立場次、圖表渲染、
// 合法/非法事業計算、風頭事業顯示、回合切換 UI)都照抄正式版的邏輯,
// 只把文字換成英文。改這份檔案前先跟 ../script.js 對照,不要自己簡化。

const SERVICE_BASE = "https://router-backend-3hl2.onrender.com";
const API_BASE = `${SERVICE_BASE}/fireless-war`;

// 跟正式版一樣的 keep-alive 考量:demo 用的是同一個 Render 服務,
// /health 是公開端點,打它不需要登入,純粹讓後端不要因為閒置而休眠;
// 不讀回應,所以用 no-cors(/health 不回 CORS 標頭)。
function pingKeepAlive() {
  fetch(`${SERVICE_BASE}/health`, { mode: "no-cors" }).catch(() => {});
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

function showToast(message, type) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = "toast visible" + (type ? ` toast--${type}` : "");
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 2800);
}

// ===== Google 登入 =====

const GOOGLE_CLIENT_ID = "665970888301-g3mjmlrba8aosq5j8jlkgqbukmp3u76p.apps.googleusercontent.com";

const topBarEl = document.getElementById("top-bar");
const demoBannerEl = document.getElementById("demo-banner");
const googleSigninBtnEl = document.getElementById("google-signin-button");
const accountSlotEl = document.getElementById("account-slot");
const accountLabelEl = document.getElementById("account-label");
const accountDropdownEl = document.getElementById("account-dropdown");
const btnSignOut = document.getElementById("btn-sign-out");

let currentIdToken = null;
let currentAuthorized = false;
let recordRequestInFlight = false; // "Load Record" 的查詢/建立請求進行中
let onHomePage = true; // 進到第二頁之後就是 false,不會再回到首頁

function authHeaders() {
  return currentIdToken ? { Authorization: `Bearer ${currentIdToken}` } : {};
}

// 跟正式版一樣:請求進行中也要鎖,避免 45 分鐘續期剛好在讀取途中完成時
// 把讀取中的按鈕提早解鎖。
function updateReadButtonLock() {
  btnReadRecord.disabled = recordRequestInFlight || !currentAuthorized;
}

// 跟正式版一樣:登入列平常只在首頁出現,第二、三頁只有真的登出時才顯示,
// 讓 token 失效的使用者可以原地重新登入。
function syncTopBar() {
  topBarEl.hidden = !onHomePage && currentIdToken !== null;
}

function showSignedOutUI() {
  currentIdToken = null;
  currentAuthorized = false;
  googleSigninBtnEl.hidden = false;
  accountSlotEl.hidden = true;
  accountDropdownEl.hidden = true;
  updateReadButtonLock();
  syncTopBar();
}

function showSignedInUI(email) {
  googleSigninBtnEl.hidden = true;
  accountSlotEl.hidden = false;
  accountLabelEl.textContent = email ? email.split("@")[0] : "Account";
}

// 只是為了「登入列要不要顯示帳號」這個顯示用途,解 Google ID Token 的 payload
// (JWT 中段 base64url),不涉及任何驗證——真正的驗證永遠在後端做。
function parseEmailFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email || null;
  } catch (err) {
    return null;
  }
}

// Demo 不檢查白名單,所以不像正式版那樣還要再打一支 /auth/status 確認
// 「這個帳號有沒有被授權」——Google 登入成功、拿到 ID Token 就直接解鎖
// 「讀取記錄表」按鈕即可,真正的驗證永遠在後端的 require_login 做,
// 前端這裡鎖不鎖只是體驗,不是安全邊界。
function handleCredentialResponse(response) {
  currentIdToken = response.credential;
  currentAuthorized = true;
  showSignedInUI(parseEmailFromToken(currentIdToken));
  updateReadButtonLock();
  syncTopBar(); // 在第二、三頁重新登入後,把登入列收回去
}

function logPromptNotification(notification) {
  if (notification.isNotDisplayed()) {
    console.warn("[GIS] silent sign-in not displayed:", notification.getNotDisplayedReason());
  } else if (notification.isSkippedMoment()) {
    console.warn("[GIS] silent sign-in skipped:", notification.getSkippedReason());
  } else if (notification.isDismissedMoment()) {
    console.warn("[GIS] silent sign-in dismissed:", notification.getDismissedReason());
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
  google.accounts.id.prompt(logPromptNotification);
}

initGoogleSignIn();

// ID Token 大約 1 小時過期,跟正式版一樣每 45 分鐘靜默續期一次。
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

// ===== 日期時間選取/查詢/建立場次(照抄正式版 script.js 的邏輯) =====

function pad2(n) {
  return String(n).padStart(2, "0");
}

function pad4(n) {
  return String(n).padStart(4, "0");
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

// ===== 日期選擇器:自己畫的月曆 =====
// 原生 <input type="date"> 跳出來的月曆是 Chrome 自己畫的,在 Windows 上中文字
// 會壞掉,網頁的字體、深色、語言設定都碰不到它(2026-11-02 在 Windows 上逐一
// 試過,全部一樣壞)。寫法參照 boo-king-king 的 js/calendar.js;這裡每一天都
// 可以選,所以沒有它那套「開放日期」的載入。
const CAL_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CAL_PLACEHOLDER = "YYYY/MM/DD";
const CAL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const calTitleText = (year, month) => `${CAL_MONTH_NAMES[month - 1]} ${year}`;

const dateTrigger = document.getElementById("date-trigger");
const calPanel = document.getElementById("cal-panel");
const calTitle = document.getElementById("cal-title");
const calGrid = document.getElementById("cal-grid");

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1; // 1-12
let calSelected = null; // { year, month, day }

function renderCalendar() {
  calTitle.textContent = calTitleText(calYear, calMonth);
  calGrid.replaceChildren();

  for (const w of CAL_WEEKDAYS) {
    const dow = document.createElement("div");
    dow.className = "cal__dow";
    dow.textContent = w;
    calGrid.appendChild(dow);
  }

  // 前面補空格到 1 號的星期。Date 只拿來算星期與天數,年月日都是本地字面值。
  const lead = new Date(calYear, calMonth - 1, 1).getDay();
  for (let i = 0; i < lead; i++) {
    const padCell = document.createElement("div");
    padCell.className = "cal__pad";
    calGrid.appendChild(padCell);
  }

  const now = new Date();
  for (let d = 1; d <= daysInMonth(calYear, calMonth); d++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal__day";
    cell.textContent = String(d);
    if (calSelected && calSelected.year === calYear && calSelected.month === calMonth && calSelected.day === d) {
      cell.classList.add("is-selected");
    }
    if (now.getFullYear() === calYear && now.getMonth() + 1 === calMonth && now.getDate() === d) {
      cell.classList.add("is-today");
    }
    cell.addEventListener("click", () => pickDate(calYear, calMonth, d));
    calGrid.appendChild(cell);
  }
}

// 挑好日期/時/分後,把數字帶進下方手動欄位;實際送出仍然只看手動欄位的值
function pickDate(year, month, day) {
  calSelected = { year, month, day };
  dateTrigger.textContent = `${pad4(year)}/${pad2(month)}/${pad2(day)}`;
  dateTrigger.classList.remove("is-empty");
  fieldYear.value = year;
  fieldMonth.value = month;
  fieldDay.value = day;
  closeCalendar();
}

function shiftCalendarMonth(delta) {
  calMonth += delta;
  if (calMonth < 1) { calMonth = 12; calYear -= 1; }
  if (calMonth > 12) { calMonth = 1; calYear += 1; }
  renderCalendar();
}

function openCalendar() {
  // 打開時回到選過的那個月;沒選過就停在上次翻到的月份
  if (calSelected) {
    calYear = calSelected.year;
    calMonth = calSelected.month;
  }
  renderCalendar();
  calPanel.hidden = false;
  dateTrigger.setAttribute("aria-expanded", "true");
  document.addEventListener("mousedown", onCalendarOutside);
  document.addEventListener("keydown", onCalendarKey);
}

function closeCalendar() {
  calPanel.hidden = true;
  dateTrigger.setAttribute("aria-expanded", "false");
  document.removeEventListener("mousedown", onCalendarOutside);
  document.removeEventListener("keydown", onCalendarKey);
}

// 用 mousedown 而不是 click:按下去的那一刻面板就該收起來
function onCalendarOutside(e) {
  if (!datePicker.contains(e.target)) closeCalendar();
}

function onCalendarKey(e) {
  if (e.key === "Escape") {
    closeCalendar();
    dateTrigger.focus();
  }
}

dateTrigger.textContent = CAL_PLACEHOLDER;
dateTrigger.addEventListener("click", () => (calPanel.hidden ? openCalendar() : closeCalendar()));
document.getElementById("cal-prev").addEventListener("click", () => shiftCalendarMonth(-1));
document.getElementById("cal-next").addEventListener("click", () => shiftCalendarMonth(1));

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
    return { ok: false, error: "Missing date/time fields" };
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
    return { ok: false, error: "Invalid date/time" };
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
    `No demo session found for ${dt.year}-${pad2(dt.month)}-${pad2(dt.day)} ${pad2(dt.hour)}:${pad2(dt.minute)}. Create one?`;
  dialogOverlay.classList.add("visible");

  dialogYesBtn.onclick = () => {
    hideDialog();
    createDemoRecord(datetimeParam);
  };
  dialogNoBtn.onclick = () => {
    hideDialog();
  };
}

function setRecordLoading(isLoading, loadingText = "Loading…") {
  recordRequestInFlight = isLoading;
  updateReadButtonLock();
  btnReadRecord.textContent = isLoading ? loadingText : "Load Record";
}

async function fetchDemoRecord(dt, datetimeParam) {
  setRecordLoading(true);
  try {
    const res = await fetch(
      `${API_BASE}/demo-record?datetime=${encodeURIComponent(datetimeParam)}`,
      { headers: authHeaders() }
    );

    if (res.status === 200) {
      const data = await res.json();
      await enterPage2(data.spreadsheet_id);
    } else if (res.status === 404) {
      showNotFoundDialog(dt, datetimeParam);
    } else if (res.status === 401) {
      showToast("Sign-in failed or expired, please try again", "error");
    } else if (res.status === 429) {
      showToast("This demo is getting a lot of traffic right now — please try again in a bit", "error");
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Could not look up the record, please try again later", "error");
    }
  } catch (err) {
    showToast("Connection failed — check your network and try again", "error");
  } finally {
    setRecordLoading(false);
  }
}

async function createDemoRecord(datetimeParam) {
  setRecordLoading(true, "Creating…");
  try {
    const res = await fetch(
      `${API_BASE}/demo-record?datetime=${encodeURIComponent(datetimeParam)}`,
      { method: "POST", headers: authHeaders() }
    );

    if (res.status === 201) {
      showToast("Created successfully", "success");
    } else if (res.status === 429) {
      showToast("This demo is getting a lot of traffic right now — please try again in a bit", "error");
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Could not create the demo session, please try again later", "error");
    }
  } catch (err) {
    showToast("Connection failed — check your network and try again", "error");
  } finally {
    setRecordLoading(false);
  }
}

btnReadRecord.addEventListener("click", () => {
  const dtResult = validateDatetime(readManualDatetime());
  if (!dtResult.ok) {
    showToast(dtResult.error, "error");
    return;
  }

  const datetimeParam = toDatetimeParam(dtResult.value);
  fetchDemoRecord(dtResult.value, datetimeParam);
});

// ===== 頁面二/三 =====

// Demo 試算表只有 1stDayMorning / 1stDayReport 兩個分頁(其餘天數的分頁
// 沒建),所以這裡刻意只留這兩個選項——留著 Day2~Day7/Final 只會讓訪客
// 點到真的讀不到資料的回合。標籤故意縮短,避免英文字串比中文版長,
// 在輪盤式選單裡擠在一起重疊。
const ROUND_OPTIONS = [
  { label: "D1 R", day: "1st", type: "Morning" },
  { label: "D1 E", day: "1st", type: "Report" },
];

const BUSINESS_ORDER = ["general_business", "finance", "sex", "drug", "arms"];

const BUSINESS_LABELS_DEFAULT = {
  general_business: "Business 1",
  finance: "Business 2",
  sex: "Business 3",
  drug: "Business 4",
  arms: "Business 5",
};

const BUSINESS_LABELS_ONIWARA_OUT = {
  general_business: "Business 1",
  finance: "New Business 2",
  sex: "New Business 3",
  drug: "New Business 4",
  arms: "Business 5",
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

// Demo 版本刻意不給五個角色面板設定任何圖示——正式版的美術素材都綁著角色身分
// (而且連頁面自己的 favicon.png 裡都嵌了真人名字),拿來當「通用圖示」重複貼五次
// 反而更奇怪。面板的圖示格子(.chart-panel__icon)CSS 本來就有中性的預留底色,
// 不設圖片一樣是乾淨的空格,不需要額外素材。

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

function setScrollerIndex(idx) {
  scrollerIndex = Math.max(0, Math.min(ROUND_OPTIONS.length - 1, idx));
  updateScrollerSelectedClass();
  scrollerEl.scrollTo({ left: scrollerIndex * WHEEL_ITEM_WIDTH, behavior: "smooth" });
}

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
  const numberFields =
    type === "Morning"
      ? [
          { label: "", key: null, money: false },
          { label: "Money", key: "owned_money", money: true },
          { label: "Score", key: "current_integral", money: false },
        ]
      : [
          { label: "Income", key: "expected_income", money: true },
          { label: "Expected Money", key: "expected_money", money: true },
          { label: "Expected Score", key: "expected_integral", money: false },
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
    return { level: "severe", text: "⚠ Situation 2" };
  }
  if (illegal > legal) {
    return { level: "moderate", text: "⚠ Situation 1" };
  }
  return null;
}

function renderRoundData(data) {
  PANEL_SLUGS.forEach((slug) => {
    renderPanel(slug, data.business_level[slug], data.type, data.oniwara_out);
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
    `${API_BASE}/demo-round?day=${encodeURIComponent(day)}&type=${encodeURIComponent(type)}` +
    `&spreadsheet_id=${encodeURIComponent(currentSpreadsheetId)}`;

  const requestToken = currentIdToken;
  let res;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch (err) {
    throw new Error("Connection failed — check your network and try again");
  }

  if (res.status === 401) {
    // 跟正式版一樣:token 失效時在遊戲畫面上登出,登入列跟著出現;
    // 等回應期間已換新 token 的話,這個 401 是舊 token 的,不要踢掉新登入。
    if (currentIdToken === requestToken) {
      showSignedOutUI();
    }
    throw new Error("Sign-in expired — sign in again (top right), then load");
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to load (${res.status})`);
  }
  return res.json();
}

let lastRoundReadClickAt = 0;

btnRoundRead.addEventListener("click", async () => {
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
    showToast(err.message || "Failed to load, please try again", "error");
  } finally {
    hideLoading();
    fadeIn(chartGridEl);
    btnRoundRead.disabled = false;
  }
});

async function enterPage2(spreadsheetId) {
  currentSpreadsheetId = spreadsheetId;

  await fadeOut(page1El);
  onHomePage = false;
  syncTopBar(); // 帳號/登入按鈕只在首頁出現(登出狀態例外,見 syncTopBar)
  demoBannerEl.hidden = true;
  page2El.hidden = false;
  fadeIn(page2El);
}

btnStartGame.addEventListener("click", () => {
  btnStartGame.disabled = true;
  enterPage3().finally(() => {
    btnStartGame.disabled = false;
  });
});

async function enterPage3() {
  await fadeOut(page2El);
  showLoading();

  try {
    const data = await loadRound("1st", "Morning");
    buildScroller();
    setScrollerIndex(0);
    renderRoundData(data);
    switchZoneEl.hidden = false;
    page3El.hidden = false;
    fadeIn(page3El);
  } catch (err) {
    showToast(err.message || "Failed to load, please try again", "error");
    fadeIn(page2El);
  } finally {
    hideLoading();
  }
}
