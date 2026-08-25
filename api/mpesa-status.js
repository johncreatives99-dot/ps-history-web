import { kv } from "@vercel/kv";

// Polled by the client every few seconds after an STK push is sent, so the
// Billing tab can flip a session to "Paid" automatically the moment
// Safaricom confirms — no staff action needed.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { checkoutRequestId } = req.body || {};
  if (!checkoutRequestId) {
    res.status(400).json({ error: "Provide checkoutRequestId." });
    return;
  }

  try {
    const data = await kv.get(`mpesa:${checkoutRequestId}`);
    if (!data) {
      res.status(200).json({ status: "unknown" });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: "Couldn't check payment status. Try again shortly." });
  }
}
