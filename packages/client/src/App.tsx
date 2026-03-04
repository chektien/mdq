import { useState, useEffect } from "react";
import InstructorView from "./views/InstructorView";
import StudentView from "./views/StudentView";

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
    return <InstructorView />;
  }

  if (route.page === "join" || route.page === "student") {
    return <StudentView sessionCode={route.param} />;
  }

  // Home: role picker
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">mdq</h1>
        <p className="text-zinc-400 text-lg max-w-3xl mx-auto">
          Design and manage your quizzes in clean, editable Markdown. No more clunky interfaces and proprietary nonsense. All you need is your computer and a free, secure private network like Tailscale.
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
