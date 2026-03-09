import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme.css";
import App from "./App";
import { fetchRuntimeClientConfig } from "./hooks/api";

function applyRuntimeTheme(theme: unknown): void {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

async function bootstrap(): Promise<void> {
  applyRuntimeTheme("dark");

  try {
    const config = await fetchRuntimeClientConfig();
    applyRuntimeTheme(config.theme);
  } catch {
    applyRuntimeTheme("dark");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
