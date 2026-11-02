// ===== Demo 版本專用的前端。=====
//
// 跟正式版 (../script.js) 的差異:
//   - 不需要 datetime 輸入/查詢既有場次,登入後直接打 POST /demo-session,
//     後端每次都會建立一份全新的 FirelessWar_Demo 副本並把這個帳號加為編輯者。
//   - 不檢查白名單,任何 Google 帳號都能用,所以也不需要正式版那套
//     「暫時驗不了 vs. 真的沒授權」的 503/401 重試機制——demo 是一次性訪客,
//     token 過期就請他們重新整理頁面即可,不值得為此多維護一套重試邏輯。
//   - 呼叫 /demo-round 而不是 /round,角色對照表也換成通用的 Character A~E
//     (由後端的 DEMO_CHARACTER_SLUGS 決定,前端完全不用知道這件事)。
//   - 圖表圖示統一用同一張通用圖示,不使用正式版角色專屬的美術素材。
//
// 其餘(圖表渲染、合法/非法事業計算、風頭事業顯示、回合切換 UI)都是直接
// 照抄正式版的邏輯,避免這份 demo 跟正式版的呈現方式不一致。

const API_BASE = "https://fireless-war-backend.onrender.com";

// 跟正式版一樣的 keep-alive 考量:demo 用的是同一個 Render 服務,
// /status 是公開端點,打它不需要登入,純粹讓後端不要因為閒置而休眠。
function pingKeepAlive() {
  fetch(`${API_BASE}/status`).catch(() => {});
}
pingKeepAlive();
setInterval(pingKeepAlive, 5 * 60 * 1000);

const toastEl = document.getElementById("toast");
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

const demoBannerEl = document.getElementById("demo-banner");
const googleSigninBtnEl = document.getElementById("google-signin-button");
const accountSlotEl = document.getElementById("account-slot");
const accountLabelEl = document.getElementById("account-label");
const accountDropdownEl = document.getElementById("account-dropdown");
const btnSignOut = document.getElementById("btn-sign-out");

let currentIdToken = null;
let creatingSession = false;

function authHeaders() {
  return currentIdToken ? { Authorization: `Bearer ${currentIdToken}` } : {};
}

function showSignedOutUI() {
  currentIdToken = null;
  googleSigninBtnEl.hidden = false;
  accountSlotEl.hidden = true;
  accountDropdownEl.hidden = true;
}

function showSignedInUI(email) {
  googleSigninBtnEl.hidden = true;
  accountSlotEl.hidden = false;
  accountLabelEl.textContent = email ? email.split("@")[0] : "Account";
}

function handleCredentialResponse(response) {
  currentIdToken = response.credential;
  startDemoSession();
}

function initGoogleSignIn() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    // Demo 刻意不用 auto_select/靜默登入——這是公開示範頁,每次都讓訪客自己
    // 主動選帳號,不要在背景幫不知情的訪客悄悄建立一份 demo 副本。
    auto_select: false,
  });
  google.accounts.id.renderButton(googleSigninBtnEl, {
    theme: "filled_black",
    size: "medium",
    shape: "pill",
    text: "signin",
  });
}

initGoogleSignIn();

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

async function startDemoSession() {
  if (creatingSession) return;
  creatingSession = true;
  showLoading();
  try {
    const res = await fetch(`${API_BASE}/demo-session`, {
      method: "POST",
      headers: authHeaders(),
    });

    if (res.status === 201) {
      const data = await res.json();
      showSignedInUI(parseEmailFromToken(currentIdToken));
      if (data.warning) {
        showToast(data.warning, "error");
      }
      await enterPage2(data.spreadsheet_id);
    } else if (res.status === 401) {
      showSignedOutUI();
      showToast("Sign-in failed or expired, please try again", "error");
    } else if (res.status === 429) {
      showSignedOutUI();
      showToast("This demo is getting a lot of traffic right now — please try again in a bit", "error");
    } else {
      showSignedOutUI();
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Could not start the demo, please try again later", "error");
    }
  } catch (err) {
    showSignedOutUI();
    showToast("Connection failed — check your network and try again", "error");
  } finally {
    hideLoading();
    creatingSession = false;
  }
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

// ===== 頁面二/三 =====

const ROUND_OPTIONS = [
  { label: "Day 1 Morning", day: "1st", type: "Morning" },
  { label: "Day 1 Report", day: "1st", type: "Report" },
  { label: "Day 2 Morning", day: "2nd", type: "Morning" },
  { label: "Day 2 Report", day: "2nd", type: "Report" },
  { label: "Day 3 Morning", day: "3rd", type: "Morning" },
  { label: "Day 3 Report", day: "3rd", type: "Report" },
  { label: "Day 4 Morning", day: "4th", type: "Morning" },
  { label: "Day 4 Report", day: "4th", type: "Report" },
  { label: "Day 5 Morning", day: "5th", type: "Morning" },
  { label: "Day 5 Report", day: "5th", type: "Report" },
  { label: "Day 6 Morning", day: "6th", type: "Morning" },
  { label: "Day 6 Report", day: "6th", type: "Report" },
  { label: "Day 7 Morning", day: "7th", type: "Morning" },
  { label: "Day 7 Report", day: "7th", type: "Report" },
  { label: "Final Results", day: "Final", type: "Report" },
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
  finance: "Business 2",
  sex: "Business 3",
  drug: "Business 4",
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
          { label: "Income Due", key: "expected_income", money: true },
          { label: "Projected Money", key: "expected_money", money: true },
          { label: "Projected Score", key: "expected_integral", money: false },
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
    return { level: "severe", text: "⚠ City Economy Collapsing" };
  }
  if (illegal > legal) {
    return { level: "moderate", text: "⚠ Business Structure Collapsing" };
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

  let res;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch (err) {
    throw new Error("Connection failed — check your network and try again");
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
  demoBannerEl.hidden = true; // 進第二頁之後版面吃緊,說明文字只在首頁出現
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
