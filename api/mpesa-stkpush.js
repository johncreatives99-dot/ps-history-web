import { kv } from "@vercel/kv";

const REQUIRED_ENV = [
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
];

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizeMsisdn(raw) {
  let n = String(raw || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "254" + n.slice(1);
  else if (n.startsWith("7") || n.startsWith("1")) n = "254" + n;
  else if (n.startsWith("+254")) n = n.slice(1);
  return n;
}

async function getAccessToken() {
  const creds = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");
  const base = process.env.MPESA_ENV === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  if (!res.ok) throw new Error("oauth failed");
  const data = await res.json();
  return { accessToken: data.access_token, base };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    res.status(503).json({
      error:
        "M-Pesa auto-payment isn't set up yet. Add these Environment Variables in Vercel: " +
        missing.join(", "),
    });
    return;
  }

  const { sessionId, phone, amount } = req.body || {};
  if (!sessionId || !phone || !amount) {
    res.status(400).json({ error: "Provide sessionId, phone, and amount." });
    return;
  }

  const msisdn = normalizeMsisdn(phone);
  if (!/^254(7|1)\d{8}$/.test(msisdn)) {
    res.status(400).json({ error: "Enter a valid Safaricom number, e.g. 07XXXXXXXX." });
    return;
  }

  const roundedAmount = Math.max(1, Math.round(Number(amount)));

  try {
    const { accessToken, base } = await getAccessToken();
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const ts = timestamp();
    const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
    const callbackUrl =
      process.env.MPESA_CALLBACK_URL || `https://${req.headers.host}/api/mpesa-callback`;

    const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: roundedAmount,
        PartyA: msisdn,
        PartyB: shortcode,
        PhoneNumber: msisdn,
        CallBackURL: callbackUrl,
        AccountReference: "MyPSGames",
        TransactionDesc: "Gaming session",
      }),
    });
    const stkData = await stkRes.json();

    if (!stkRes.ok || !stkData.CheckoutRequestID) {
      res.status(502).json({
        error: stkData.errorMessage || stkData.ResponseDescription || "M-Pesa didn't accept the request.",
      });
      return;
    }

    await kv.set(
      `mpesa:${stkData.CheckoutRequestID}`,
      { status: "pending", sessionId, amount: roundedAmount, phone: msisdn, createdAt: Date.now() },
      { ex: 600 }
    );

    res.status(200).json({ checkoutRequestId: stkData.CheckoutRequestID });
  } catch (err) {
    res.status(502).json({ error: "Couldn't reach M-Pesa. Try again shortly." });
  }
}
