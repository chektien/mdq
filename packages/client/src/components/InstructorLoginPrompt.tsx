import { useState, type FormEvent, type ReactNode } from "react";
import { loginInstructor } from "../hooks/api";

interface InstructorLoginPromptProps {
  title: string;
  description: ReactNode;
  submitLabel: string;
  submittingLabel?: string;
  onSuccess: () => Promise<void> | void;
  backHref?: string;
  backLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export default function InstructorLoginPrompt({
  title,
  description,
  submitLabel,
  submittingLabel = "Signing in...",
  onSuccess,
  backHref,
  backLabel,
  secondaryHref,
  secondaryLabel,
}: InstructorLoginPromptProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await loginInstructor(password);
      setPassword("");
      await onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
          {submitting ? submittingLabel : submitLabel}
        </button>
      </form>

      {(backHref || secondaryHref) && (
        <div className="flex items-center justify-between text-sm">
          {backHref ? (
            <a href={backHref} className="text-zinc-400 hover:text-zinc-200">
              {backLabel || "Back"}
            </a>
          ) : (
            <span />
          )}

          {secondaryHref ? (
            <a href={secondaryHref} className="text-zinc-400 hover:text-zinc-200">
              {secondaryLabel || "More"}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
