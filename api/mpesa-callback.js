import { kv } from "@vercel/kv";

// Safaricom Daraja calls this URL directly after the customer approves or
// cancels the STK push on their phone. It must always answer 200 quickly,
// or Safaricom will retry-storm the endpoint.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback || !stkCallback.CheckoutRequestID) {
      res.status(200).json({ ok: true });
      return;
    }

    const key = `mpesa:${stkCallback.CheckoutRequestID}`;
    const existing = (await kv.get(key)) || {};

    if (stkCallback.ResultCode === 0) {
      const items = stkCallback.CallbackMetadata?.Item || [];
      const get = (name) => items.find((i) => i.Name === name)?.Value;
      await kv.set(
        key,
        {
          ...existing,
          status: "success",
          mpesaReceiptNumber: get("MpesaReceiptNumber"),
          amountPaid: get("Amount"),
          payerPhone: get("PhoneNumber"),
          completedAt: Date.now(),
        },
        { ex: 3600 }
      );
    } else {
      await kv.set(
        key,
        {
          ...existing,
          status: "failed",
          resultDesc: stkCallback.ResultDesc || "Payment was not completed.",
          completedAt: Date.now(),
        },
        { ex: 3600 }
      );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    // Always 200 — a non-200 response makes Safaricom retry the callback.
    res.status(200).json({ ok: true });
  }
}
