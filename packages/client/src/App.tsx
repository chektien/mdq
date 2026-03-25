import { useState, useEffect, type FormEvent } from "react";
import InstructorView from "./views/InstructorView";
import PresentationView from "./views/PresentationView";
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

type AppPage = "home" | "instructor" | "join" | "student" | "presentation";
type AuthContext = "presentation";

interface AppRoute {
  page: AppPage;
  param?: string;
  next?: string;
  authContext?: AuthContext;
}

function sanitizeHashPath(value?: string | null): string | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;
  return trimmed;
}

function navigateToHashPath(path: string): void {
  window.location.hash = path;
}

function buildInstructorLoginHash(options: { next?: string; authContext?: AuthContext } = {}): string {
  const params = new URLSearchParams();
  const next = sanitizeHashPath(options.next);

  if (next) {
    params.set("next", next);
  }

  if (options.authContext) {
    params.set("context", options.authContext);
  }

  const query = params.toString();
  return `#${INSTRUCTOR_HASH_ROUTE}${query ? `?${query}` : ""}`;
}

/**
 * Simple hash-based routing:
 *   /             -> role picker (instructor or student)
 *   /<segment>    -> instructor session setup + control
 *   /join/:code   -> student join via session code
 *   /s/:sessionId -> student in-session (after join)
 *   /present/:id  -> read-only projector view for an active session
 */
function getRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#/, "");
  const [path, queryString = ""] = hash.split("?");
  const params = new URLSearchParams(queryString);

  if (path === INSTRUCTOR_HASH_ROUTE || path === `${INSTRUCTOR_HASH_ROUTE}/`) {
    return {
      page: "instructor",
      next: sanitizeHashPath(params.get("next")),
      authContext: params.get("context") === "presentation" ? "presentation" : undefined,
    };
  }
  if (path.startsWith("/join/")) return { page: "join", param: path.split("/")[2] };
  if (path.startsWith("/s/")) return { page: "student", param: path.split("/")[2] };
  if (path.startsWith("/present/")) return { page: "presentation", param: path.split("/")[2] };
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
    return <InstructorGate returnTo={route.next} authContext={route.authContext} />;
  }

  if (route.page === "join") {
    return <StudentView initialSessionCode={route.param} />;
  }

  if (route.page === "student") {
    return <StudentView initialSessionId={route.param} />;
  }

  if (route.page === "presentation" && route.param) {
    return (
      <PresentationView
        sessionId={route.param}
        loginHref={buildInstructorLoginHash({
          next: `/present/${route.param}`,
          authContext: "presentation",
        })}
      />
    );
  }

  // Home: role picker
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white">mdq</h1>
        <p className="mx-auto max-w-3xl text-lg text-zinc-400">
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
      <div className="flex w-full max-w-sm flex-col gap-4 sm:flex-row">
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

function InstructorGate({ returnTo, authContext }: { returnTo?: string; authContext?: AuthContext }) {
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

  useEffect(() => {
    if (!checking && authenticated && returnTo) {
      navigateToHashPath(returnTo);
    }
  }, [authenticated, checking, returnTo]);

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 text-zinc-300">
        Checking instructor access...
      </div>
    );
  }

  if (authenticated && returnTo) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 text-zinc-300">
        Opening presentation view...
      </div>
    );
  }

  if (authenticated) {
    return <InstructorView />;
  }

  const isPresentationLogin = authContext === "presentation";
  const title = isPresentationLogin ? "Instructor Login Required" : "Instructor Login";
  const description = isPresentationLogin
    ? "Presentation mode is protected when the instructor password is enabled. Sign in and you will return to the presenter view."
    : "Enter the instructor password to access session controls.";
  const submitLabel = submitting
    ? "Signing in..."
    : isPresentationLogin
      ? "Sign In to Open Presentation"
      : "Sign In";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginInstructor(password);
      setPassword("");
      if (returnTo) {
        navigateToHashPath(returnTo);
        return;
      }
      setAuthenticated(true);
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
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          <p className="text-zinc-400">{description}</p>
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
            {submitLabel}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <a href="#/" className="text-zinc-400 hover:text-zinc-200">
            Back home
          </a>
          <a href={`#${INSTRUCTOR_HASH_ROUTE}`} className="text-zinc-400 hover:text-zinc-200">
            Instructor controls
          </a>
        </div>
      </div>
    </div>
  );
}
