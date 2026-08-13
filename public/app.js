let session = null;
let timerHandle = null;
let upiUrl = "";

const amountEl = document.getElementById("amount");
const createBtn = document.getElementById("createBtn");
const newBtn = document.getElementById("newBtn");
const paymentBox = document.getElementById("paymentBox");
const qrEl = document.getElementById("qr");
const timerEl = document.getElementById("timer");
const expiredEl = document.getElementById("expired");
const upiBtn = document.getElementById("upiBtn");
const upiText = document.getElementById("upiText");

async function loadConfig() {
  const r = await fetch("/api/config");
  const c = await r.json();
  amountEl.value = c.defaultAmount;
}

function showExpired() {
  clearInterval(timerHandle);
  qrEl.style.opacity = "0.25";
  upiBtn.disabled = true;
  upiBtn.style.opacity = "0.5";
  expiredEl.classList.remove("hidden");
  createBtn.classList.add("hidden");
}

function updateTimer() {
  if (!session) return;
  const remaining = Math.max(0, session.expiresAt - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const min = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const sec = String(totalSeconds % 60).padStart(2, "0");
  timerEl.textContent = `${min}:${sec}`;

  if (remaining <= 0) showExpired();
}

async function createSession() {
  const amount = Number(amountEl.value);
  if (!amount || amount <= 0) return alert("Enter a valid amount.");

  createBtn.disabled = true;
  createBtn.textContent = "Generating...";

  try {
    const r = await fetch("/api/payment-session", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ amount })
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Unable to create session");

    session = data;
    qrEl.src = data.qrDataUrl;
    upiText.textContent = `Amount: ₹${Number(data.amount).toFixed(2)}`;
    paymentBox.classList.remove("hidden");
    expiredEl.classList.add("hidden");
    qrEl.style.opacity = "1";
    upiBtn.disabled = false;
    upiBtn.style.opacity = "1";
    createBtn.classList.add("hidden");

    // The URI is recreated here only for the UPI app button.
    // QR generation on the server uses the same session data.
    const config = await (await fetch("/api/config")).json();
    upiUrl = `upi://pay?pa=${encodeURIComponent(config.storeName === "RaviStores" ? "yourupi@bank" : "yourupi@bank")}&pn=${encodeURIComponent(config.storeName)}&am=${encodeURIComponent(Number(data.amount).toFixed(2))}&cu=INR&tn=${encodeURIComponent("RaviStores payment " + data.sessionId.slice(0,8))}`;

    clearInterval(timerHandle);
    updateTimer();
    timerHandle = setInterval(updateTimer, 250);
  } catch (e) {
    alert(e.message);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "Generate Payment QR";
  }
}

createBtn.addEventListener("click", createSession);
newBtn.addEventListener("click", () => {
  expiredEl.classList.add("hidden");
  createBtn.classList.remove("hidden");
  qrEl.src = "";
  timerEl.textContent = "00:00";
});

upiBtn.addEventListener("click", () => {
  if (!session || Date.now() >= session.expiresAt) return showExpired();
  window.location.href = upiUrl;
});

loadConfig();
