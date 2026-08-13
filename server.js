require("dotenv").config();
const express = require("express");
const QRCode = require("qrcode");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const STORE_NAME = process.env.STORE_NAME || "RaviStores";
const UPI_ID = process.env.UPI_ID || "yourupi@bank";
const PAYEE_NAME = process.env.PAYEE_NAME || STORE_NAME;
const DEFAULT_AMOUNT = Number(process.env.DEFAULT_AMOUNT || 499);
const PAYMENT_MINUTES = Number(process.env.PAYMENT_MINUTES || 10);

// Demo/session store. For production use Redis/DB.
const sessions = new Map();

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}
setInterval(cleanup, 30_000).unref();

app.get("/api/config", (req, res) => {
  res.json({
    storeName: STORE_NAME,
    defaultAmount: DEFAULT_AMOUNT,
    paymentMinutes: PAYMENT_MINUTES
  });
});

app.post("/api/payment-session", async (req, res) => {
  const amount = Number(req.body.amount || DEFAULT_AMOUNT);

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const id = crypto.randomUUID();
  const expiresAt = Date.now() + PAYMENT_MINUTES * 60 * 1000;

  // UPI intent URI. This creates a QR that contains the payment details.
  const upiUrl =
    `upi://pay?pa=${encodeURIComponent(UPI_ID)}` +
    `&pn=${encodeURIComponent(PAYEE_NAME)}` +
    `&am=${encodeURIComponent(amount.toFixed(2))}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(STORE_NAME + " order " + id.slice(0, 8))}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(upiUrl, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M"
    });

    sessions.set(id, {
      id,
      amount,
      createdAt: Date.now(),
      expiresAt,
      status: "pending"
    });

    res.json({
      sessionId: id,
      amount,
      expiresAt,
      qrDataUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create QR" });
  }
});

app.get("/api/payment-session/:id", (req, res) => {
  const session = sessions.get(req.params.id);

  if (!session) {
    return res.status(404).json({
      status: "expired",
      message: "Payment session expired."
    });
  }

  if (Date.now() >= session.expiresAt) {
    sessions.delete(session.id);
    return res.json({
      status: "expired",
      message: "Payment session expired."
    });
  }

  res.json({
    status: session.status,
    amount: session.amount,
    expiresAt: session.expiresAt
  });
});

// IMPORTANT:
// Do not mark a payment as successful from the browser.
// Connect your payment gateway's verified webhook here in production.
// The webhook must verify the gateway signature and then update the order in a DB.

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`${STORE_NAME} running at http://localhost:${PORT}`);
});
