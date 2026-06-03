import type { LeaderboardEntry } from "@mdq/shared";

/** Leaderboard table with staggered animation */
export default function Leaderboard({
  entries,
  totalQuestions,
  highlightStudentId,
  maxRows = 10,
}: {
  entries: LeaderboardEntry[];
  totalQuestions: number;
  highlightStudentId?: string;
  maxRows?: number;
}) {
  const visible = entries.slice(0, maxRows);
  const hasScoredQuestions = totalQuestions > 0;

  const rankLabel = (rank: number) => {
    if (rank === 1) return "1st";
    if (rank === 2) return "2nd";
    if (rank === 3) return "3rd";
    return `#${rank}`;
  };

  return (
    <div className="leaderboard-board">
      {visible.length > 0 ? (
        <ol className="leaderboard-list" aria-label="Leaderboard rankings">
          {visible.map((entry, i) => {
            const isHighlighted = entry.studentId === highlightStudentId;
            const medalTone = entry.rank === 1
              ? "rank-first"
              : entry.rank === 2
                ? "rank-second"
                : entry.rank === 3
                  ? "rank-third"
                  : "rank-standard";
            return (
              <li
                key={entry.studentId}
                className={`leaderboard-row ${medalTone} ${isHighlighted ? "leaderboard-row-highlight" : ""}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span
                  className="leaderboard-rank"
                  aria-label={`Rank ${entry.rank}`}
                >
                  {rankLabel(entry.rank)}
                </span>

                <div className="leaderboard-person">
                  <span className="leaderboard-name">
                    {entry.displayName || entry.studentId}
                  </span>
                  {entry.displayName && (
                    <span className="leaderboard-id">{entry.studentId}</span>
                  )}
                </div>

                <div className="leaderboard-score">
                  <span>
                    {hasScoredQuestions ? `${entry.correctCount}/${totalQuestions}` : "Poll only"}
                  </span>
                  <small>
                    {hasScoredQuestions ? `${(entry.totalTimeMs / 1000).toFixed(1)}s` : "No scored questions"}
                  </small>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="leaderboard-empty">No ranked participants yet.</p>
      )}
      {entries.length > maxRows && (
        <p className="leaderboard-overflow">
          +{entries.length - maxRows} more participants
        </p>
      )}
    </div>
  );
}
