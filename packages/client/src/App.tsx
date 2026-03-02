import { useState, useEffect } from "react";
import InstructorView from "./views/InstructorView";
import StudentView from "./views/StudentView";

/**
 * Simple hash-based routing:
 *   /             -> role picker (instructor or student)
 *   /instructor   -> instructor session setup + control
 *   /join/:code   -> student join via session code
 *   /s/:sessionId -> student in-session (after join)
 */
function getRoute(): { page: string; param?: string } {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("/instructor")) return { page: "instructor" };
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
        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">md-quiz</h1>
        <p className="text-zinc-400 text-lg">Classroom quiz platform</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
        <a
          href="#/instructor"
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
