import { createServer } from "http";
import { createApp } from "./app";
import {
  setupSocket,
  broadcastQuestionOpen,
  broadcastReveal,
  broadcastLeaderboard,
  clearSessionTimers,
} from "./socket";
import { DEFAULT_PORT, Quiz, Session, SessionState, SocketEvents } from "@mdq/shared";
import { detectAccessInfo } from "./access-info";
import { getDistribution } from "./session";
import * as path from "path";
import * as fs from "fs";
import express from "express";
import type { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { loadRuntimeConfig } from "./config";

const runtimeConfig = loadRuntimeConfig();
const requestedPort = runtimeConfig.port || DEFAULT_PORT;
const maxPortFallbacks = runtimeConfig.portFallbacks;
const instanceId = runtimeConfig.instanceId || randomUUID();
const quizDir = runtimeConfig.quizDir || path.resolve(__dirname, "../../../data/quizzes");
const clientDist = path.join(__dirname, "../../client/dist");

// We need io available for the state change callback, so we use a container
// that's populated after setupSocket. The callback won't fire before the server starts.
const ioRef: { current: ReturnType<typeof setupSocket> | null } = { current: null };

interface FunnelReadinessResult {
  ready: boolean;
  reason: string;
  details: string[];
}

function inspectFunnelReadiness(publicUrl: string, boundPort: number): FunnelReadinessResult {
  try {
    const raw = execSync("tailscale funnel status --json", {
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const statusText = String(raw);
    const host = (() => {
      try {
        return new URL(publicUrl).hostname;
      } catch {
        return "";
      }
    })();

    const hasPortMatch = statusText.includes(`:${boundPort}`) || statusText.includes(`"port":${boundPort}`);
    const hasHostMatch = host ? statusText.includes(host) : false;

    if (!hasPortMatch) {
      return {
        ready: false,
        reason: "wrong-port",
        details: [
          `funnel does not appear to publish bound port ${boundPort}`,
          `run: tailscale funnel ${boundPort}`,
          "run: tailscale funnel status",
        ],
      };
    }

    if (!hasHostMatch) {
      return {
        ready: false,
        reason: "host-mismatch",
        details: [
          `funnel status does not include expected host for ${publicUrl}`,
          "run: tailscale funnel status",
          "verify tailscale status host and Funnel host are aligned",
        ],
      };
    }

    return {
      ready: true,
      reason: "ok",
      details: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return {
      ready: false,
      reason: "status-unavailable",
      details: [
        `unable to read tailscale funnel status: ${message}`,
        "run: tailscale funnel status",
      ],
    };
  }
}

function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

const app = createApp({
  quizDir,
  instanceId,
  onStateChange: (session: Session, sessionId: string, newState: SessionState, quiz?: Quiz) => {
    const io = ioRef.current;
    if (!io) return;

    switch (newState) {
      case "QUESTION_OPEN":
        if (quiz) {
          broadcastQuestionOpen(io, session, sessionId, quiz);
        }
        break;

      case "QUESTION_CLOSED": {
        clearSessionTimers(sessionId);
        io.to(sessionRoom(sessionId)).emit(SocketEvents.QUESTION_CLOSE, {
          questionIndex: session.currentQuestionIndex,
        });
        io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
          state: session.state,
          questionIndex: session.currentQuestionIndex,
        });
        // Send distribution
        const dist = getDistribution(session, session.currentQuestionIndex);
        io.to(sessionRoom(sessionId)).emit(SocketEvents.RESULTS_DISTRIBUTION, {
          questionIndex: session.currentQuestionIndex,
          distribution: dist,
        });
        break;
      }

      case "REVEAL":
        if (quiz) {
          broadcastReveal(io, session, sessionId, quiz);
        }
        break;

      case "LEADERBOARD":
        if (quiz) {
          broadcastLeaderboard(io, session, sessionId, quiz);
        }
        break;

      case "ENDED":
        io.to(sessionRoom(sessionId)).emit(SocketEvents.SESSION_STATE, {
          state: "ENDED",
        });
        break;
    }
  },
});

const httpServer = createServer(app);

// Access the quiz store from the app for socket setup
const quizzes = (app as unknown as { _quizzes: Map<string, Quiz> })._quizzes;
ioRef.current = setupSocket(httpServer, quizzes);

// ── Student join redirect ──
// QR scanners often strip hash fragments from URLs, so we support a clean
// path /join/:code that redirects to the hash-based client route /#/join/:code.
app.get("/join/:code", (req: express.Request, res: express.Response) => {
  res.redirect(`/#/join/${req.params.code}`);
});

// ── Serve client static files in production ──
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: serve index.html for any non-API route
  app.get("*", (req: express.Request, res: express.Response) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}

async function onListening(): Promise<void> {
  const address = httpServer.address();
  const boundPort = typeof address === "object" && address ? (address as AddressInfo).port : requestedPort;
  const usedFallbackPort = boundPort !== requestedPort;

  console.log(`mdq server listening on port ${boundPort} (instance ${instanceId})`);
  console.log(
    `Runtime config: ${runtimeConfig.loadedFromFile ? runtimeConfig.configPath : "defaults only (data/config.json not found)"}`,
  );
  if (usedFallbackPort) {
    console.log(`Requested port ${requestedPort} unavailable, using fallback port ${boundPort}`);
  }
  console.log(`Port fallback retry limit: ${maxPortFallbacks}`);
  console.log(`Quiz directory: ${quizDir}`);

  // Detect access info (Tailscale/LAN) on startup
  try {
    const info = await detectAccessInfo(boundPort);
    console.log(`Access URL: ${info.fullUrl} (source: ${info.source})`);
    if (info.shortUrl) {
      console.log(`Short URL: ${info.shortUrl}`);
    }
    if (info.warning) {
      console.warn(`Warning: ${info.warning}`);
    }

    if (info.source === "tailscale") {
      const readiness = inspectFunnelReadiness(info.fullUrl, boundPort);
      console.log(
        `[mdq readiness] funnel_ready=${readiness.ready} reason=${readiness.reason} bound_port=${boundPort} public_url=${info.fullUrl}`,
      );
      if (!readiness.ready) {
        for (const detail of readiness.details) {
          console.warn(`[mdq readiness] ${detail}`);
        }
      }
    } else {
      console.log(
        `[mdq readiness] funnel_ready=false reason=tailscale-unavailable bound_port=${boundPort} public_url=${info.fullUrl}`,
      );
      console.warn("[mdq readiness] public classroom access may fail without Tailscale Funnel");
      console.warn(`[mdq readiness] run: tailscale funnel ${boundPort}`);
    }

    if (info.source === "tailscale") {
      const healthUrl = `${info.fullUrl}/api/health`;
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        const payloadUnknown = await response.json().catch(() => ({}));
        const payload =
          payloadUnknown && typeof payloadUnknown === "object"
            ? (payloadUnknown as { instanceId?: unknown })
            : {};
        const publicInstanceId =
          typeof payload.instanceId === "string" ? payload.instanceId : "";

        if (!response.ok || !publicInstanceId) {
          console.warn(
            `[mdq readiness] funnel_ready=false reason=health-mismatch bound_port=${boundPort} public_url=${info.fullUrl}`,
          );
          console.warn(`[mdq readiness] failed health probe at ${healthUrl}`);
          console.warn("[mdq readiness] run: tailscale funnel status");
        } else if (publicInstanceId !== instanceId) {
          console.warn(
            `[mdq readiness] funnel_ready=false reason=instance-mismatch bound_port=${boundPort} public_url=${info.fullUrl}`,
          );
          console.warn(
            `[mdq readiness] public host points to instance ${publicInstanceId}, local instance is ${instanceId}`,
          );
          console.warn("[mdq readiness] stop old process on published port and retry");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        console.warn(
          `[mdq readiness] funnel_ready=false reason=health-unreachable bound_port=${boundPort} public_url=${info.fullUrl}`,
        );
        console.warn(`[mdq readiness] public health probe failed: ${message}`);
      }
    }

    if (usedFallbackPort && info.source === "tailscale") {
      const healthUrl = `${info.fullUrl}/api/health`;
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        const payloadUnknown = await response.json().catch(() => ({}));
        const payload =
          payloadUnknown && typeof payloadUnknown === "object"
            ? (payloadUnknown as { instanceId?: unknown })
            : {};
        const publicInstanceId =
          typeof payload.instanceId === "string" ? payload.instanceId : "";

        if (!response.ok || !publicInstanceId) {
          console.error(
            `Unsafe fallback detected: unable to verify public host ${healthUrl} for instance consistency while running on fallback port ${boundPort}.`
          );
          console.error("Refusing to continue to avoid split-brain sessions. Free the requested port and restart.");
          httpServer.close(() => {
            process.exit(1);
          });
          return;
        }

        if (publicInstanceId !== instanceId) {
          console.error(
            `Unsafe fallback detected: public host ${info.fullUrl} resolves to instance ${publicInstanceId}, but this process is instance ${instanceId} on port ${boundPort}.`
          );
          console.error("Refusing to continue to avoid split-brain sessions. Stop the old process on the public port and restart.");
          httpServer.close(() => {
            process.exit(1);
          });
          return;
        }

        console.log(`Verified public host routes to this instance (${instanceId}) after fallback.`);
      } catch (error) {
        console.error(
          `Unsafe fallback detected: failed to verify public host ${healthUrl} while running on fallback port ${boundPort}.`
        );
        console.error("Refusing to continue to avoid split-brain sessions. Free the requested port and restart.");
        if (error instanceof Error) {
          console.error(`Verification error: ${error.message}`);
        }
        httpServer.close(() => {
          process.exit(1);
        });
        return;
      }
    }
  } catch (e) {
    console.error("Failed to detect access info:", e);
  }
}

function startWithPortFallback(portToTry: number, fallbackCount: number): void {
  const handleListening = (): void => {
    httpServer.off("error", handleError);
    void onListening();
  };

  const handleError = (error: NodeJS.ErrnoException): void => {
    httpServer.off("listening", handleListening);

    if (error.code === "EADDRINUSE" && fallbackCount < maxPortFallbacks) {
      const nextPort = portToTry + 1;
      console.warn(
        `Port ${portToTry} is already in use, retrying on port ${nextPort} (${fallbackCount + 1}/${maxPortFallbacks})`
      );
      startWithPortFallback(nextPort, fallbackCount + 1);
      return;
    }

    console.error(`Failed to start mdq server on port ${portToTry}:`, error);
    process.exitCode = 1;
  };

  httpServer.once("listening", handleListening);
  httpServer.once("error", handleError);
  httpServer.listen(portToTry);
}

startWithPortFallback(requestedPort, 0);
