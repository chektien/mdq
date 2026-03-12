import { useState, useCallback, useEffect } from "react";
import { useSocket } from "../hooks/useSocket";
import type { QuestionState, RevealState } from "../hooks/useSocket";
import { API } from "@mdq/shared";
import type { SessionState } from "@mdq/shared";
import Timer from "../components/Timer";
import Leaderboard from "../components/Leaderboard";
import QuizHtml from "../components/QuizHtml";

function formatQuizLabel(quizKey: string): string {
  const normalized = quizKey.trim();
  if (!normalized) return "MDQ";
  if (/\bmdq\b/i.test(normalized)) return normalized;
  return `${normalized} MDQ`;
}

function clearSessionArtifacts(): void {
  try {
    localStorage.removeItem("mdquiz_session");
    localStorage.removeItem("mdquiz_pending_join");
  } catch {
    // ignore
  }
}

export default function StudentView({
  initialSessionCode,
  initialSessionId,
}: {
  initialSessionCode?: string;
  initialSessionId?: string;
}) {
  const normalizeSessionCode = useCallback(
    (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
    [],
  );

  // Join form state
  const [code, setCode] = useState(normalizeSessionCode(initialSessionCode || ""));
  const [studentId, setStudentId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [quizKey, setQuizKey] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Sync route-provided code to input deterministically.
  useEffect(() => {
    if (initialSessionCode) {
      setCode(normalizeSessionCode(initialSessionCode));
      return;
    }
    if (initialSessionId) {
      setCode("");
    }
  }, [initialSessionCode, initialSessionId, normalizeSessionCode]);

  // Clear error when user edits any input field
  const handleCodeChange = useCallback((val: string) => {
    setCode(normalizeSessionCode(val));
    if (joinError) setJoinError(null);
  }, [joinError, normalizeSessionCode]);

  const handleStudentIdChange = useCallback((val: string) => {
    setStudentId(val);
    if (joinError) setJoinError(null);
  }, [joinError]);

  const handleDisplayNameChange = useCallback((val: string) => {
    setDisplayName(val);
    if (joinError) setJoinError(null);
  }, [joinError]);

  const sock = useSocket(sessionId, "student");
  const { connected, sessionToken, joinSession, error: sockError } = sock;

  // Try to restore session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("mdquiz_session");
      const targetSessionId = (initialSessionId || "").trim();
      if (raw) {
        const stored = JSON.parse(raw);
        if (targetSessionId && stored.sessionId === targetSessionId) {
          setSessionId(stored.sessionId);
          setStudentId(stored.studentId || "");
        } else if (targetSessionId && stored.sessionId !== targetSessionId) {
          setSessionId(targetSessionId);
          setStudentId(stored.studentId || "");
        } else if (!initialSessionCode && stored.sessionId) {
          setSessionId(stored.sessionId);
          setStudentId(stored.studentId || "");
        }
        if (initialSessionCode && stored.studentId) {
          setStudentId(stored.studentId);
        }
        if (typeof stored.sessionWeek === "string" && stored.sessionWeek.trim().length > 0) {
          setQuizKey(stored.sessionWeek);
        }
      } else if (targetSessionId) {
        setSessionId(targetSessionId);
      }
    } catch {
      // ignore
    }
    setCompleted(false);
  }, [initialSessionCode, initialSessionId]);

  const handleDone = useCallback(() => {
    clearSessionArtifacts();
    sock.disconnect();
    setCompleted(true);
  }, [sock]);

  // Handle join: first resolve session code to sessionId, then connect socket
  const handleJoin = useCallback(async () => {
    if (!studentId.trim()) {
      setJoinError("Student ID is required");
      return;
    }

    setJoining(true);
    setJoinError(null);

    try {
      // Resolve session code to sessionId via REST endpoint
      const normalizedCode = normalizeSessionCode(code);
      const res = await fetch(API.SESSION_BY_CODE.replace(":code", normalizedCode));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 404 || res.status === 410) {
          clearSessionArtifacts();
          setSessionId(null);
          setQuizKey(null);
        }
        throw new Error(data.error || "Session not found. Check the code and try again.");
      }
      const data: { sessionId: string; week?: string } = await res.json();
      setSessionId(data.sessionId);
      if (typeof data.week === "string" && data.week.trim().length > 0) {
        setQuizKey(data.week);
      }

      // Store pending join info and session for the socket handler
      localStorage.setItem(
        "mdquiz_pending_join",
        JSON.stringify({ studentId: studentId.trim(), displayName: displayName.trim() || undefined }),
      );
      // Also update the session store so page refreshes restore the session
      localStorage.setItem(
        "mdquiz_session",
        JSON.stringify({
          sessionId: data.sessionId,
          studentId: studentId.trim(),
          sessionWeek: data.week,
          sessionToken:
            (() => {
              try {
                const existingRaw = localStorage.getItem("mdquiz_session");
                if (!existingRaw) return undefined;
                const existing = JSON.parse(existingRaw);
                if (
                  existing
                  && existing.sessionId === data.sessionId
                  && existing.studentId === studentId.trim()
                  && typeof existing.sessionToken === "string"
                ) {
                  return existing.sessionToken;
                }
              } catch {
                // ignore
              }
              return undefined;
            })(),
        }),
      );

      if (window.location.hash !== `#/s/${data.sessionId}`) {
        window.location.hash = `/s/${data.sessionId}`;
      }
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Failed to join");
      setJoining(false);
    }
  }, [code, studentId, displayName, normalizeSessionCode]);

  // When socket connects and we have pending join, emit student:join
  useEffect(() => {
    if (connected && !sessionToken) {
      try {
        const raw = localStorage.getItem("mdquiz_pending_join");
        if (raw) {
          const pending = JSON.parse(raw);
          joinSession(pending.studentId, pending.displayName);
          localStorage.removeItem("mdquiz_pending_join");
        }
      } catch {
        // ignore
      }
    }
  }, [connected, sessionToken, joinSession]);

  // Clear joining state when joined or errored
  useEffect(() => {
    if (sessionToken) setJoining(false);
  }, [sessionToken]);

  useEffect(() => {
    if (sockError) {
      const lowered = sockError.toLowerCase();
      if (lowered.includes("ended") || lowered.includes("not found")) {
        clearSessionArtifacts();
        setSessionId(null);
        setQuizKey(null);
      }
      setJoinError(sockError);
      setJoining(false);
    }
  }, [sockError]);

  if (completed) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h2 className="text-2xl font-bold text-white">Done</h2>
        <p className="text-zinc-400 text-sm max-w-md">Your session is complete. You can close this tab.</p>
      </div>
    );
  }

  // ── Not yet connected: show join form ──
  if (!sock.sessionToken) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6">
        {!initialSessionCode && (
          <a href="#/" className="absolute top-4 left-4 text-zinc-500 hover:text-zinc-300 text-sm">
            &larr; Back
          </a>
        )}

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-1">Join Quiz</h1>
          <p className="text-zinc-400 text-sm">Enter the session code shown on screen</p>
        </div>

        {joinError && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-xl w-full max-w-sm text-center text-sm">
            {joinError}
          </div>
        )}

        <div className="w-full max-w-sm space-y-4">
          <div>
            <label className="block text-zinc-400 text-xs mb-1 font-medium">Session Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="ABC123"
              maxLength={6}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.15em] placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-1 font-medium">
              Student ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => handleStudentIdChange(e.target.value)}
              placeholder="e.g. 2301234"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-1 font-medium">
              Display Name <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="Your name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete="off"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={joining || !code.trim() || !studentId.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        </div>
      </div>
    );
  }

  // ── Joined: show session content based on state ──
  const state = sock.sessionState as SessionState;

  // Waiting in lobby
  if (state === "LOBBY") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <h2 className="text-xl font-semibold text-white">Waiting for quiz to start...</h2>
        <p className="text-zinc-400 text-sm">The instructor will begin shortly</p>
      </div>
    );
  }

  // Question open
  if (state === "QUESTION_OPEN" || state === "QUESTION_CLOSED") {
    return (
      <QuestionView
        key={sock.currentQuestion?.questionIndex ?? 0}
        question={sock.currentQuestion}
        state={state}
        remainingSec={sock.remainingSec}
        submitted={sock.submitted}
        submittedOptions={sock.submittedOptions}
        onSubmit={sock.submitAnswer}
      />
    );
  }

  // Reveal
  if (state === "REVEAL") {
    return (
      <RevealView
        question={sock.currentQuestion}
        reveal={sock.reveal}
        submittedOptions={sock.submittedOptions}
      />
    );
  }

  // Leaderboard
  if (state === "LEADERBOARD" || state === "ENDED") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-white">
          {state === "ENDED"
            ? `Final Results${quizKey ? ` for ${formatQuizLabel(quizKey).toUpperCase()}` : ""}`
            : quizKey
              ? `Leaderboard for ${formatQuizLabel(quizKey).toUpperCase()}`
              : "Leaderboard"}
        </h2>
        <Leaderboard
          entries={sock.leaderboard}
          totalQuestions={sock.totalQuestions}
          highlightStudentId={sock.studentId ?? undefined}
          maxRows={15}
        />
        {state === "ENDED" && (
          <button
            onClick={handleDone}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors text-sm mt-4"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  // Fallback: connecting state
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6">
      <div className="w-12 h-12 border-4 border-zinc-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-zinc-400 text-sm">Connecting to session...</p>
    </div>
  );
}

// ── Question sub-view ──────────────────────

function QuestionView({
  question,
  state,
  remainingSec,
  submitted,
  submittedOptions,
  onSubmit,
}: {
  question: QuestionState | null;
  state: SessionState;
  remainingSec: number;
  submitted: boolean;
  submittedOptions: string[];
  onSubmit: (questionIndex: number, selectedOptions: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  if (!question) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 text-center">
        <p className="text-zinc-400">
          {state === "QUESTION_CLOSED" ? "Waiting for next question..." : "Loading question..."}
        </p>
      </div>
    );
  }

  const toggleOption = (label: string) => {
    if (submitted || state === "QUESTION_CLOSED") return;
    setSelected((prev) =>
      question.allowsMultiple
        ? (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label])
        : (prev.includes(label) ? [] : [label]),
    );
  };

  const handleSubmit = () => {
    if (selected.length === 0 || submitted) return;
    onSubmit(question.questionIndex, selected);
  };

  const isClosed = state === "QUESTION_CLOSED";
  const selectionModeText = question.allowsMultiple
    ? "You can select multiple answers"
    : "Select only one answer";

  return (
    <div className="min-h-dvh flex flex-col p-4 pb-safe">
      {/* Header: timer + question number */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm font-medium">
          Q{question.questionIndex + 1}
        </span>
        {!isClosed && (
          <Timer remainingSec={remainingSec} totalSec={question.timeLimitSec} size={56} />
        )}
        {isClosed && (
          <span className="text-amber-400 text-sm font-medium">Time's up</span>
        )}
      </div>

      {/* Question text */}
      <QuizHtml className="quiz-html text-lg text-white leading-relaxed mb-6" html={question.text} />

      <div className={`selection-mode-card mb-5 rounded-2xl border px-4 py-3 ${question.allowsMultiple ? "selection-mode-card-multi" : "selection-mode-card-single"}`}>
        <div className="selection-mode-text">{selectionModeText}</div>
      </div>

      {/* Options */}
      <div className="space-y-3 flex-1">
        {question.options.map((opt) => {
          const isSelected = selected.includes(opt.label);
          const wasSubmitted = submittedOptions.includes(opt.label);
          const disabled = submitted || isClosed;

          return (
            <button
              key={opt.label}
              onClick={() => toggleOption(opt.label)}
              disabled={disabled}
              className={`
                option-btn w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border-2 transition-all
                ${
                  wasSubmitted
                    ? "border-indigo-500 bg-indigo-600/20"
                    : isSelected
                      ? "border-indigo-500 bg-indigo-600/10"
                      : "border-zinc-700 bg-zinc-800/80"
                }
                ${disabled ? "opacity-70" : "active:scale-[0.97]"}
              `}
            >
              <span
                className={`
                  option-marker w-8 h-8 flex items-center justify-center shrink-0 font-mono font-bold text-sm
                  ${question.allowsMultiple ? "rounded-lg" : "rounded-full"}
                  ${
                    wasSubmitted || isSelected
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-700 text-zinc-300"
                  }
                `}
              >
                {opt.label}
              </span>
              <QuizHtml className="quiz-html text-zinc-200 pt-0.5" html={opt.text} as="span" />
            </button>
          );
        })}
      </div>

      {/* Submit button */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        {submitted ? (
          <div className="text-center py-3">
            <span className="text-emerald-400 font-semibold">Answer submitted</span>
          </div>
        ) : isClosed ? (
          <div className="text-center py-3">
            <span className="text-amber-400 font-semibold">Time expired</span>
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={selected.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
          >
            {question.allowsMultiple ? "Submit Selections" : "Submit Answer"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Reveal sub-view ──────────────────────

function RevealView({
  question,
  reveal,
  submittedOptions,
}: {
  question: QuestionState | null;
  reveal: RevealState | null;
  submittedOptions: string[];
}) {
  if (!question || !reveal) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <p className="text-zinc-400">Waiting for next question...</p>
      </div>
    );
  }

  const isCorrect =
    submittedOptions.length > 0 &&
    submittedOptions.length === reveal.correctOptions.length &&
    submittedOptions.every((o) => reveal.correctOptions.includes(o));

  const didAnswer = submittedOptions.length > 0;

  return (
    <div className="min-h-dvh flex flex-col p-4 pb-safe">
      {/* Result banner */}
      <div
        className={`
          text-center py-4 rounded-xl mb-4
          ${isCorrect ? "bg-emerald-600/20 border border-emerald-500/50" : didAnswer ? "bg-red-600/20 border border-red-500/50" : "bg-zinc-800 border border-zinc-700"}
        `}
      >
        <span
          className={`text-2xl font-bold ${isCorrect ? "text-emerald-400" : didAnswer ? "text-red-400" : "text-zinc-400"}`}
        >
          {isCorrect ? "Correct!" : didAnswer ? "Incorrect" : "No answer submitted"}
        </span>
      </div>

      {/* Question text */}
      <QuizHtml className="quiz-html text-base text-zinc-300 leading-relaxed mb-4" html={question.text} />

      {/* Options with correct/incorrect marks */}
      <div className="space-y-2 mb-6">
        {question.options.map((opt) => {
          const correct = reveal.correctOptions.includes(opt.label);
          const chosen = submittedOptions.includes(opt.label);

          return (
            <div
              key={opt.label}
              className={`
                flex items-start gap-3 px-4 py-3 rounded-xl border-2
                ${correct ? "border-emerald-500/50 bg-emerald-600/10" : chosen ? "border-red-500/50 bg-red-600/10" : "border-zinc-800 bg-zinc-800/50"}
              `}
            >
              <span
                className={`
                  w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-sm
                  ${correct ? "bg-emerald-600 text-white" : chosen ? "bg-red-600 text-white" : "bg-zinc-700 text-zinc-400"}
                `}
              >
                {opt.label}
              </span>
              <QuizHtml className="quiz-html text-zinc-200 pt-0.5" html={opt.text} as="span" />
            </div>
          );
        })}
      </div>

      {/* Explanation */}
      {reveal.explanation && (
        <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl p-4">
          <h3 className="text-zinc-400 text-xs uppercase tracking-wide font-medium mb-2">
            Explanation
          </h3>
          <p className="text-zinc-200 text-sm leading-relaxed">{reveal.explanation}</p>
        </div>
      )}
    </div>
  );
}
