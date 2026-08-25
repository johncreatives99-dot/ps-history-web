import { exchangeNpssoForAccessCode, exchangeAccessCodeForAuthTokens } from "psn-api";

// Lightweight sign-in used by the Billing tab's per-station connect flow.
// Unlike /api/games, this does NOT fetch the account's game/trophy library —
// it only exchanges the one-time NPSSO for a long-lived refresh token, which
// is all presence polling for a lounge station needs.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { npsso } = req.body || {};
  if (!npsso) {
    res.status(400).json({ error: "Provide npsso." });
    return;
  }

  try {
    const accessCode = await exchangeNpssoForAccessCode(npsso);
    const authorization = await exchangeAccessCodeForAuthTokens(accessCode);
    res.status(200).json({ refreshToken: authorization.refreshToken });
  } catch {
    res.status(401).json({
      error:
        "Couldn't sign in to PlayStation Network. The NPSSO is probably invalid or expired — grab a fresh one and try again.",
    });
  }
}
