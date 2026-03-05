import { useState, useEffect, type FormEvent } from "react";
import InstructorView from "./views/InstructorView";
import StudentView from "./views/StudentView";
import { fetchInstructorSessionStatus, loginInstructor } from "./hooks/api";

const DEFAULT_INSTRUCTOR_ROUTE_SEGMENT = "instructor";

function normalizeRouteSegment(value?: string): string {
  const trimmed = (value || "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed || DEFAULT_INSTRUCTOR_ROUTE_SEGMENT;
}

const INSTRUCTOR_ROUTE_SEGMENT = normalizeRouteSegment(
  (import.meta as { env?: { VITE_INSTRUCTOR_ROUTE_SEGMENT?: string } }).env?.VITE_INSTRUCTOR_ROUTE_SEGMENT,
);
const INSTRUCTOR_HASH_ROUTE = `/${INSTRUCTOR_ROUTE_SEGMENT}`;

/**
 * Simple hash-based routing:
 *   /             -> role picker (instructor or student)
 *   /<segment>    -> instructor session setup + control
 *   /join/:code   -> student join via session code
 *   /s/:sessionId -> student in-session (after join)
 */
function getRoute(): { page: string; param?: string } {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === INSTRUCTOR_HASH_ROUTE || hash === `${INSTRUCTOR_HASH_ROUTE}/`) return { page: "instructor" };
  if (hash.startsWith("/join/")) return { page: "join", param: hash.split("/")[2] };
  if (hash.startsWith("/s/")) return { page: "student", param: hash.split("/")[2] };
  return { page: "home" };
}

export default function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route.page === "instructor") {
    return <InstructorGate />;
  }

  if (route.page === "join") {
    return <StudentView initialSessionCode={route.param} />;
  }

  if (route.page === "student") {
    return <StudentView initialSessionId={route.param} />;
  }

  // Home: role picker
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">mdq</h1>
        <p className="text-zinc-400 text-lg max-w-3xl mx-auto">
          MCQs are passe. Enter <span className="font-semibold text-indigo-300">MDQ</span>s.
          <span className="font-medium text-zinc-200">
            {" "}Human- and agent-friendly <span className="text-indigo-300">M</span>ark<span className="text-indigo-300">D</span>own <span className="text-indigo-300">Q</span>uizzes.
          </span>
          <br />
          <span className="text-zinc-300">No clunky interfaces. No proprietary nonsense. No database.</span>
          <br />
          <span className="text-zinc-400">Just your own machine and a public secure tunnel (like Tailscale).</span>
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
        <a
          href={`#${INSTRUCTOR_HASH_ROUTE}`}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-center py-4 px-6 rounded-xl transition-colors text-lg"
        >
          Instructor
        </a>
        <a
          href="#/join/"
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold text-center py-4 px-6 rounded-xl transition-colors text-lg"
        >
          Student
        </a>
      </div>
    </div>
  );
}

function InstructorGate() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchInstructorSessionStatus()
      .then((status) => {
        setAuthenticated(status.authenticated);
      })
      .catch(() => {
        setError("Unable to verify instructor access.");
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 text-zinc-300">
        Checking instructor access...
      </div>
    );
  }

  if (authenticated) {
    return <InstructorView />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginInstructor(password);
      setAuthenticated(true);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white">Instructor Login</h1>
          <p className="text-zinc-400">Enter the instructor password to access session controls.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label htmlFor="instructor-password" className="block text-sm font-medium text-zinc-300">
            Password
          </label>
          <input
            id="instructor-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoComplete="current-password"
            required
          />

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <a href="#/" className="text-zinc-400 hover:text-zinc-200">
            Back home
          </a>
          <a href="#/join/" className="text-zinc-400 hover:text-zinc-200">
            Go to quiz join
          </a>
        </div>
      </div>
    </div>
  );
}
