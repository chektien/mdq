import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme.css";
import App from "./App";
import { fetchRuntimeClientConfig } from "./hooks/api";
import type { RuntimeClientConfig } from "./hooks/api";
import { applyClientTheme } from "./theme";

async function bootstrap(): Promise<void> {
  applyClientTheme("dark");
  let runtimeConfig: RuntimeClientConfig = {};

  try {
    runtimeConfig = await fetchRuntimeClientConfig();
    applyClientTheme(runtimeConfig.theme);
  } catch {
    applyClientTheme("dark");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App runtimeConfig={runtimeConfig} />
    </StrictMode>,
  );
}

void bootstrap();
