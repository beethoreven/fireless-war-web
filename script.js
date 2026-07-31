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
      showToast("紀錄讀取成功", "success");
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
