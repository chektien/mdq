import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme.css";
import App from "./App";
import { fetchRuntimeClientConfig } from "./hooks/api";
import type { RuntimeClientConfig } from "./hooks/api";

function applyRuntimeTheme(theme: unknown): void {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

async function bootstrap(): Promise<void> {
  applyRuntimeTheme("dark");
  let runtimeConfig: RuntimeClientConfig = {};

  try {
    runtimeConfig = await fetchRuntimeClientConfig();
    applyRuntimeTheme(runtimeConfig.theme);
  } catch {
    applyRuntimeTheme("dark");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App runtimeConfig={runtimeConfig} />
    </StrictMode>,
  );
}

void bootstrap();
