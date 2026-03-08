import * as fs from "fs";
import * as path from "path";
import { DEFAULT_PORT } from "@mdq/shared";

const DEFAULT_PORT_FALLBACKS = 10;

interface RuntimeConfigFile {
  port?: unknown;
  portFallbacks?: unknown;
  quizDir?: unknown;
  instanceId?: unknown;
}

export interface RuntimeConfig {
  port: number;
  portFallbacks: number;
  quizDir: string;
  instanceId: string;
  configPath: string;
  loadedFromFile: boolean;
}

export interface RuntimeConfigLoadOptions {
  rootDir?: string;
  env?: NodeJS.ProcessEnv;
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function parseNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readRuntimeConfigFile(configPath: string): RuntimeConfigFile {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Config root must be a JSON object");
    }
    return parsed as RuntimeConfigFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Invalid runtime config at ${configPath}: ${message}`);
  }
}

function resolveQuizDir(configDir: string, rawQuizDir: string | undefined, fallback: string): string {
  if (!rawQuizDir) return fallback;
  return path.isAbsolute(rawQuizDir) ? rawQuizDir : path.resolve(configDir, rawQuizDir);
}

export function loadRuntimeConfig(options: RuntimeConfigLoadOptions = {}): RuntimeConfig {
  const rootDir = options.rootDir || path.resolve(__dirname, "../../../");
  const env = options.env || process.env;
  const dataDir = path.join(rootDir, "data");
  const configPath = path.join(dataDir, "config.json");
  const configDir = path.dirname(configPath);
  const fileConfig = readRuntimeConfigFile(configPath);
  const defaultQuizDir = path.join(dataDir, "quizzes");

  return {
    port: parsePositiveInt(env.PORT) ?? parsePositiveInt(fileConfig.port) ?? DEFAULT_PORT,
    portFallbacks:
      parseNonNegativeInt(env.PORT_FALLBACKS)
      ?? parseNonNegativeInt(fileConfig.portFallbacks)
      ?? DEFAULT_PORT_FALLBACKS,
    quizDir: resolveQuizDir(configDir, parseString(env.QUIZ_DIR) ?? parseString(fileConfig.quizDir), defaultQuizDir),
    instanceId: parseString(env.MDQ_INSTANCE_ID) ?? parseString(fileConfig.instanceId) ?? "",
    configPath,
    loadedFromFile: fs.existsSync(configPath),
  };
}
