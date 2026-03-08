import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DEFAULT_PORT } from "@mdq/shared";
import { loadRuntimeConfig } from "../config";

describe("loadRuntimeConfig", () => {
  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdq-config-"));
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    return root;
  }

  it("uses existing defaults when config is absent", () => {
    const root = createRoot();
    const config = loadRuntimeConfig({ rootDir: root, env: {} });

    expect(config.loadedFromFile).toBe(false);
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.portFallbacks).toBe(10);
    expect(config.quizDir).toBe(path.join(root, "data", "quizzes"));
    expect(config.instanceId).toBe("");
  });

  it("loads runtime overrides from data/config.json", () => {
    const root = createRoot();
    fs.writeFileSync(
      path.join(root, "data", "config.json"),
      JSON.stringify({
        port: 3100,
        portFallbacks: 4,
        quizDir: "./alt-quizzes",
        instanceId: "room-a",
      }),
    );

    const config = loadRuntimeConfig({ rootDir: root, env: {} });

    expect(config.loadedFromFile).toBe(true);
    expect(config.port).toBe(3100);
    expect(config.portFallbacks).toBe(4);
    expect(config.quizDir).toBe(path.join(root, "data", "alt-quizzes"));
    expect(config.instanceId).toBe("room-a");
  });

  it("lets environment variables override file config", () => {
    const root = createRoot();
    fs.writeFileSync(
      path.join(root, "data", "config.json"),
      JSON.stringify({ port: 3100, portFallbacks: 4, quizDir: "./alt-quizzes", instanceId: "room-a" }),
    );

    const config = loadRuntimeConfig({
      rootDir: root,
      env: {
        PORT: "3200",
        PORT_FALLBACKS: "1",
        QUIZ_DIR: path.join(root, "custom-quizzes"),
        MDQ_INSTANCE_ID: "room-b",
      },
    });

    expect(config.port).toBe(3200);
    expect(config.portFallbacks).toBe(1);
    expect(config.quizDir).toBe(path.join(root, "custom-quizzes"));
    expect(config.instanceId).toBe("room-b");
  });
});
