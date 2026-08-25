import { exchangeRefreshTokenForAuthTokens, getBasicPresence } from "psn-api";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    res.status(400).json({ error: "Provide refreshToken." });
    return;
  }

  let authorization;
  try {
    authorization = await exchangeRefreshTokenForAuthTokens(refreshToken);
  } catch {
    res.status(401).json({
      error: "PlayStation session expired. Reconnect in the Games tab.",
    });
    return;
  }

  try {
    const { basicPresence } = await getBasicPresence(authorization, "me");
    const onlineStatus = basicPresence?.primaryPlatformInfo?.onlineStatus || "offline";
    const gameList = basicPresence?.gameTitleInfoList || [];
    const currentGame =
      gameList.length > 0
        ? { title: gameList[0].titleName, id: gameList[0].npTitleId }
        : null;

    res.status(200).json({
      onlineStatus,
      availability: basicPresence?.availability || "unavailable",
      currentGame,
      // Refresh tokens can rotate on every exchange — hand the latest one
      // back so the client keeps its stored session valid across polls.
      refreshToken: authorization.refreshToken,
    });
  } catch {
    res.status(502).json({
      error: "Couldn't fetch presence from PSN. Try again shortly.",
    });
  }
}
