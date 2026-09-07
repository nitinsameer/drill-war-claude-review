export type LeaderboardEntry = {
  id: string;
  score: number;
  character: string;
  drill: string;
  stars: number;
  gems: number;
  depth: number;
  date: string;
};

const STORAGE_KEY = "drillwar_leaderboard_v1";
const MAX_ENTRIES = 20;

function readRaw(): LeaderboardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LeaderboardEntry =>
        entry && typeof entry === "object" && typeof entry.score === "number",
    );
  } catch {
    // corrupt or inaccessible storage — treat as empty rather than crash the game
    return [];
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  return readRaw().sort((a, b) => b.score - a.score);
}

export type SaveScoreResult = { entries: LeaderboardEntry[]; saved: LeaderboardEntry };

export function saveScore(entry: Omit<LeaderboardEntry, "id">): SaveScoreResult {
  const saved: LeaderboardEntry = { ...entry, id: `${entry.date}-${Math.random().toString(36).slice(2, 8)}` };
  const entries = [...readRaw(), saved].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or unavailable (private browsing) — the run still finishes,
    // it just won't be remembered next time
  }
  return { entries, saved };
}
