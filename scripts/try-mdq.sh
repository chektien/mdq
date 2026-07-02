#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PORT="2081"
PORT_VALUE="${PORT:-$DEFAULT_PORT}"
MODE="auto"
SKIP_INSTALL="0"
SKIP_BUILD="0"
ASSUME_YES="0"

usage() {
  cat <<'EOF'
Usage: npm run try -- [options]

Options:
  --local-only     Never offer to start Tailscale Funnel.
  --publish        Offer to start Tailscale Funnel when Tailscale is available.
  --yes            With --publish, start Funnel without an interactive prompt.
  --skip-install   Do not run npm install.
  --skip-build     Do not run npm run build.
  --help           Show this help.

Environment:
  PORT             MDQ server port. Defaults to 2081 for this launcher.

Examples:
  npm run try
  PORT=3000 npm run try
  npm run try -- --publish
  npm run try -- --local-only
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-only)
      MODE="local"
      ;;
    --publish)
      MODE="publish"
      ;;
    --yes|-y)
      ASSUME_YES="1"
      ;;
    --skip-install)
      SKIP_INSTALL="1"
      ;;
    --skip-build)
      SKIP_BUILD="1"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if ! [[ "$PORT_VALUE" =~ ^[0-9]+$ ]] || [[ "$PORT_VALUE" -lt 1 ]] || [[ "$PORT_VALUE" -gt 65535 ]]; then
  echo "PORT must be a number between 1 and 65535; got '$PORT_VALUE'." >&2
  exit 2
fi

cd "$ROOT_DIR"

section() {
  printf '\n== %s ==\n' "$1"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

tailscale_dns_name() {
  if ! have_cmd tailscale; then
    return 1
  fi

  node -e '
const { execFileSync } = require("child_process");
try {
  const raw = execFileSync("tailscale", ["status", "--json"], { encoding: "utf8", timeout: 5000 });
  const status = JSON.parse(raw);
  const dns = status && status.Self && typeof status.Self.DNSName === "string"
    ? status.Self.DNSName.replace(/\.$/, "")
    : "";
  if (!dns) process.exit(1);
  console.log(dns);
} catch {
  process.exit(1);
}
'
}

funnel_status_has_port() {
  local port="$1"

  if ! have_cmd tailscale; then
    return 1
  fi

  node -e '
const { execFileSync } = require("child_process");
const port = process.argv[1];
try {
  const raw = execFileSync("tailscale", ["funnel", "status", "--json"], { encoding: "utf8", timeout: 5000 });
  const status = JSON.parse(raw);
  const web = status && typeof status === "object" && status.Web && typeof status.Web === "object"
    ? status.Web
    : {};
  for (const hostConfig of Object.values(web)) {
    const handlers = hostConfig && typeof hostConfig === "object" && hostConfig.Handlers && typeof hostConfig.Handlers === "object"
      ? hostConfig.Handlers
      : {};
    for (const handler of Object.values(handlers)) {
      const proxy = handler && typeof handler === "object" && typeof handler.Proxy === "string"
        ? handler.Proxy
        : "";
      if (proxy === `http://127.0.0.1:${port}` || proxy === `http://localhost:${port}`) {
        process.exit(0);
      }
    }
  }
  process.exit(1);
} catch {
  process.exit(1);
}
' "$port"
}

funnel_public_url_for_port() {
  local dns="$1"
  local port="$2"

  if ! have_cmd tailscale; then
    return 1
  fi

  node -e '
const { execFileSync } = require("child_process");
const dns = process.argv[1];
const port = process.argv[2];
try {
  const raw = execFileSync("tailscale", ["funnel", "status", "--json"], { encoding: "utf8", timeout: 5000 });
  const status = JSON.parse(raw);
  const web = status && typeof status === "object" && status.Web && typeof status.Web === "object"
    ? status.Web
    : {};
  for (const [hostKey, hostConfig] of Object.entries(web)) {
    const handlers = hostConfig && typeof hostConfig === "object" && hostConfig.Handlers && typeof hostConfig.Handlers === "object"
      ? hostConfig.Handlers
      : {};
    for (const handler of Object.values(handlers)) {
      const proxy = handler && typeof handler === "object" && typeof handler.Proxy === "string"
        ? handler.Proxy
        : "";
      if (proxy !== `http://127.0.0.1:${port}` && proxy !== `http://localhost:${port}`) {
        continue;
      }
      const [, rawPort = "443"] = String(hostKey).split(":");
      if (rawPort === "443") {
        console.log(`https://${dns}`);
      } else {
        console.log(`http://${dns}:${rawPort}`);
      }
      process.exit(0);
    }
  }
  process.exit(1);
} catch {
  process.exit(1);
}
' "$dns" "$port"
}

run_funnel() {
  local port="$1"

  section "Tailscale Funnel"
  echo "Tailscale is available, but Funnel does not appear to publish MDQ on port $port."
  echo "MDQ will not automatically change the shared Tailscale Funnel route."
  echo "This machine already uses the bare Tailscale hostname for other services, so changing it can break clients such as Vimicate."
  echo
  echo "For a public classroom URL, use the configured Cloudflare route or set MDQ_PUBLIC_URL to a dedicated hostname."
  echo "For local/tailnet testing, keep using: npm run try"

  if [[ "$ASSUME_YES" == "1" ]]; then
    echo
    echo "--yes was provided, but automatic Funnel publishing is disabled to protect the shared Tailscale hostname."
  fi
  return 0
}

section "Prepare MDQ"
if [[ "$SKIP_INSTALL" == "1" ]]; then
  echo "Skipping npm install."
elif [[ -d node_modules ]]; then
  echo "Dependencies already present; running npm install to reconcile package-lock changes."
  npm install
else
  echo "Installing dependencies."
  npm install
fi

npm run setup:local

if [[ "$SKIP_BUILD" == "1" ]]; then
  echo "Skipping build."
else
  npm run build
fi

section "Access Mode"
echo "MDQ will start on port $PORT_VALUE."
echo "Requested instructor URL: http://localhost:$PORT_VALUE/#/instructor"
echo "Requested local student URL after creating a session: http://localhost:$PORT_VALUE/#/join/<SESSION_CODE>"
echo "If that port is occupied, the server may print a fallback port below."
echo

TAILSCALE_DNS=""
SERVER_BIND_HOST="${MDQ_BIND_HOST:-${HOST:-}}"
PUBLIC_URL_OVERRIDE="${MDQ_PUBLIC_URL:-${PUBLIC_URL:-}}"
DISABLE_TAILSCALE_FOR_SERVER="0"
if [[ "$MODE" == "local" ]]; then
  echo "Local-only mode selected. No Tailscale changes will be made."
elif TAILSCALE_DNS="$(tailscale_dns_name)"; then
  SERVER_BIND_HOST="${SERVER_BIND_HOST:-127.0.0.1}"
  echo "Tailscale detected: https://$TAILSCALE_DNS"
  echo "MDQ will bind to $SERVER_BIND_HOST so Tailscale Funnel can proxy to it without a port conflict."

  if funnel_status_has_port "$PORT_VALUE"; then
    PUBLIC_URL_OVERRIDE="${PUBLIC_URL_OVERRIDE:-$(funnel_public_url_for_port "$TAILSCALE_DNS" "$PORT_VALUE" || true)}"
    PUBLIC_URL_OVERRIDE="${PUBLIC_URL_OVERRIDE:-https://$TAILSCALE_DNS}"
    echo "Funnel already proxies to local port $PORT_VALUE."
    echo "Public/Tailscale URL after creating a session: $PUBLIC_URL_OVERRIDE/#/join/<SESSION_CODE>"
  elif [[ "$MODE" == "publish" ]]; then
    run_funnel "$PORT_VALUE"
    if funnel_status_has_port "$PORT_VALUE"; then
      PUBLIC_URL_OVERRIDE="${PUBLIC_URL_OVERRIDE:-$(funnel_public_url_for_port "$TAILSCALE_DNS" "$PORT_VALUE" || true)}"
      PUBLIC_URL_OVERRIDE="${PUBLIC_URL_OVERRIDE:-https://$TAILSCALE_DNS}"
      echo "Public/Tailscale URL after creating a session: $PUBLIC_URL_OVERRIDE/#/join/<SESSION_CODE>"
    else
      echo "Starting as a local try-out because no safe public Funnel route was configured."
      PUBLIC_URL_OVERRIDE="${PUBLIC_URL_OVERRIDE:-http://localhost:$PORT_VALUE}"
      DISABLE_TAILSCALE_FOR_SERVER="1"
    fi
  else
    echo
    echo "Funnel is not currently proxying to local port $PORT_VALUE."
    echo "This run will start as a local try-out until you publish Funnel."
    echo "For a public classroom URL, run:"
    echo "  npm run try -- --publish"
    echo "or:"
    echo "  tailscale funnel --bg --yes localhost:$PORT_VALUE"
    PUBLIC_URL_OVERRIDE="${PUBLIC_URL_OVERRIDE:-http://localhost:$PORT_VALUE}"
    DISABLE_TAILSCALE_FOR_SERVER="1"
  fi
else
  echo "Tailscale was not detected or is not signed in."
  echo "This run is for local appearance testing, projector testing, and mock-student testing."
  echo "It is not a public classroom URL, and real students off this machine may not be able to connect."
  echo
  echo "After you create a session in the instructor screen, mock local students with:"
  echo "  npx tsx scripts/mock-students.ts 20 http://localhost:$PORT_VALUE"
fi

section "Start Server"
echo "Press Ctrl+C to stop MDQ."
echo
if [[ "$MODE" == "local" ]]; then
  MDQ_DISABLE_TAILSCALE=1 PORT="$PORT_VALUE" npm run start --workspace=@mdq/server
elif [[ "$DISABLE_TAILSCALE_FOR_SERVER" == "1" ]]; then
  MDQ_DISABLE_TAILSCALE=1 MDQ_PUBLIC_URL="$PUBLIC_URL_OVERRIDE" MDQ_BIND_HOST="$SERVER_BIND_HOST" PORT="$PORT_VALUE" npm run start --workspace=@mdq/server
else
  MDQ_PUBLIC_URL="$PUBLIC_URL_OVERRIDE" MDQ_BIND_HOST="$SERVER_BIND_HOST" PORT="$PORT_VALUE" npm run start --workspace=@mdq/server
fi
