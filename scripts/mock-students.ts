/**
 * Spawns N fake students that join a session and answer questions randomly.
 *
 * Usage (from repo root, after npm install):
 *   npx tsx scripts/mock-students.ts [sessionId|sessionCode] [count=10] [serverUrl=http://localhost:3000]
 *
 * If no session is specified, auto-connects to the only active session (fails if 0 or >1).
 *
 * Examples:
 *   npx tsx scripts/mock-students.ts              # auto-detect single active session
 *   npx tsx scripts/mock-students.ts P2KU9R        # by session code
 *   npx tsx scripts/mock-students.ts P2KU9R 25     # 25 students
 */

import { io, type Socket } from "socket.io-client";

const NAMES = [
  "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Heidi",
  "Ivan", "Judy", "Karl", "Liam", "Mia", "Noah", "Olivia", "Pat",
  "Quinn", "Rosa", "Sam", "Tara", "Uma", "Vic", "Wendy", "Xena", "Yuki", "Zara",
];

// First positional arg could be a session id/code or a number (count)
const arg1 = process.argv[2];
const isCount = arg1 && /^\d+$/.test(arg1);
const sessionIdOrCode = arg1 && !isCount ? arg1 : undefined;
const count = parseInt((isCount ? arg1 : process.argv[3]) || "10", 10);
const serverUrl = process.argv[isCount ? 3 : 4] || "http://localhost:3000";

/** Find the only active session, or fail. */
async function findActiveSession(): Promise<string> {
  const res = await fetch(`${serverUrl}/api/sessions/active`);
  if (!res.ok) {
    throw new Error(`Failed to fetch active sessions: ${res.status} ${res.statusText}`);
  }
  const sessions = (await res.json()) as { sessionId: string; sessionCode: string; state: string }[];
  if (sessions.length === 0) {
    throw new Error("No active sessions found");
  }
  if (sessions.length > 1) {
    console.error("Multiple active sessions — specify one:");
    for (const s of sessions) {
      console.error(`  ${s.sessionCode}  (${s.sessionId})  [${s.state}]`);
    }
    process.exit(1);
  }
  console.log(`Auto-detected session ${sessions[0].sessionCode} (${sessions[0].sessionId})`);
  return sessions[0].sessionId;
}

/** Resolve a 6-char session code to a session ID, or pass through if already an ID. */
async function resolveSessionId(idOrCode: string): Promise<string> {
  if (!/^[A-Z0-9]{6}$/.test(idOrCode)) return idOrCode;

  const res = await fetch(`${serverUrl}/api/session/by-code/${idOrCode}`);
  if (!res.ok) {
    throw new Error(`Failed to resolve session code ${idOrCode}: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { sessionId: string };
  return data.sessionId;
}

interface QuestionPayload {
  questionIndex: number;
  options: { label: string; text: string }[];
  allowsMultiple: boolean;
  timeLimitSec: number;
}

function randomName(i: number): string {
  const base = NAMES[i % NAMES.length];
  return i < NAMES.length ? base : `${base}${Math.floor(i / NAMES.length) + 1}`;
}

function randomSubset(options: { label: string }[], allowsMultiple: boolean): string[] {
  if (!allowsMultiple) {
    return [options[Math.floor(Math.random() * options.length)].label];
  }
  const n = 1 + Math.floor(Math.random() * options.length);
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n).map((o) => o.label);
}

function spawnStudent(sessionId: string, i: number): Socket {
  const name = randomName(i);
  const studentId = `mock-${i}-${Date.now()}`;
  const sock = io(serverUrl, {
    transports: ["websocket"],
    autoConnect: true,
    auth: { sessionId },
  });

  sock.on("connect", () => {
    console.log(`[${name}] connected`);
    sock.emit("student:join", { studentId, displayName: name });
  });

  sock.on("student:joined", (data: { sessionState: string; currentQuestion?: number }) => {
    console.log(`[${name}] joined (state: ${data.sessionState})`);
  });

  sock.on("student:rejected", (data: { reason: string }) => {
    console.log(`[${name}] rejected: ${data.reason}`);
    sock.disconnect();
  });

  sock.on("question:open", (q: QuestionPayload) => {
    const maxDelay = Math.min(q.timeLimitSec * 0.8, 10) * 1000;
    const delay = 500 + Math.random() * maxDelay;

    setTimeout(() => {
      const selected = randomSubset(q.options, q.allowsMultiple);
      console.log(`[${name}] Q${q.questionIndex + 1} → ${selected.join(",")}`);
      sock.emit("answer:submit", {
        questionIndex: q.questionIndex,
        selectedOptions: selected,
      });
    }, delay);
  });

  sock.on("disconnect", () => {
    console.log(`[${name}] disconnected`);
  });

  return sock;
}

const sockets: Socket[] = [];

process.on("SIGINT", () => {
  console.log("\nDisconnecting all mock students...");
  sockets.forEach((s) => s.disconnect());
  setTimeout(() => process.exit(0), 500);
});

(async () => {
  const sessionId = sessionIdOrCode
    ? await resolveSessionId(sessionIdOrCode)
    : await findActiveSession();

  console.log(`Spawning ${count} mock students for session ${sessionId} at ${serverUrl}`);

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      sockets.push(spawnStudent(sessionId, i));
    }, i * 100);
  }
})();
