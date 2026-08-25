import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  getUserTitles,
} from "psn-api";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { npsso, refreshToken } = req.body || {};

  let authorization;
  try {
    if (refreshToken) {
      authorization = await exchangeRefreshTokenForAuthTokens(refreshToken);
    } else if (npsso) {
      const accessCode = await exchangeNpssoForAccessCode(npsso);
      authorization = await exchangeAccessCodeForAuthTokens(accessCode);
    } else {
      res.status(400).json({ error: "Provide npsso or refreshToken." });
      return;
    }
  } catch {
    res.status(401).json({
      error:
        "Couldn't sign in to PlayStation Network. Your NPSSO is probably invalid or expired \u2014 grab a fresh one and try again.",
    });
    return;
  }

  try {
    const rows = await getAllGames(authorization);
    res.status(200).json({ rows, refreshToken: authorization.refreshToken });
  } catch {
    res.status(502).json({
      error: "Signed in, but couldn't fetch your game list from PSN. Try again in a moment.",
    });
  }
}

async function getAllGames(authorization) {
  const titles = [];
  let offset = 0;
  const limit = 200;

  // Pages through every title the account has synced trophies for,
  // most-recently-played first.
  while (true) {
    const response = await getUserTitles(authorization, "me", { limit, offset });
    titles.push(...response.trophyTitles);
    if (response.trophyTitles.length < limit) break;
    offset += limit;
  }

  return titles
    .map((title) => {
      const earned =
        title.earnedTrophies.bronze +
        title.earnedTrophies.silver +
        title.earnedTrophies.gold +
        title.earnedTrophies.platinum;
      const defined =
        title.definedTrophies.bronze +
        title.definedTrophies.silver +
        title.definedTrophies.gold +
        title.definedTrophies.platinum;

      return {
        game: title.trophyTitleName,
        icon: title.trophyTitleIconUrl,
        platform: title.trophyTitlePlatform,
        progress: title.progress,
        trophies: `${earned}/${defined}`,
        lastPlayed: title.lastUpdatedDateTime,
      };
    })
    .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
}
