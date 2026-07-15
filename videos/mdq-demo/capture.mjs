// MDQ demo capture pipeline.
//
// Drives a REAL live MDQ session (public sample deck "week00") and captures
// high-resolution screenshots of every surface for the Remotion demo video.
//
// - Session is stepped via the server REST API (deterministic).
// - ~12 synthetic students join over socket.io and submit weighted answers so
//   distributions / leaderboard look realistic. All names are clearly fake;
//   no real student data is touched (server runs with MDQ_DECK_DIR=samples/decks
//   and MDQ_AUTO_GENERATE_STUDENT_IDS=true).
// - Playwright renders the projector, instructor and student (phone) surfaces.
//
// Run from repo root:  node videos/mdq-demo/capture.mjs
// Requires the MDQ server already running on $MDQ_BASE (default :4810).

import { chromium } from "playwright";
import { io } from "socket.io-client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.MDQ_BASE || "http://localhost:4810";
const WEEK = process.env.MDQ_WEEK || "week00";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "public", "captures");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[capture]", ...a);
const consoleErrors = [];

async function api(p, method = "POST", body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function step(p) {
  try { return await api(p, "POST"); }
  catch (e) { log(`  (step ${p} ignored: ${String(e).split("\n")[0]})`); return null; }
}

const ROSTER = ["Ada","Lin","Mateo","Priya","Noah","Yuki","Sofia","Omar","Grace","Ravi","Elena","Theo"];

function connectStudent(sessionId, name, idx) {
  return new Promise((resolve, reject) => {
    const studentId = `demo-${String(idx).padStart(2, "0")}`;
    const socket = io(BASE, { auth: { sessionId }, transports: ["websocket"], reconnection: false });
    const timer = setTimeout(() => reject(new Error(`join timeout: ${name}`)), 10000);
    socket.on("connect", () => socket.emit("student:join", { studentId, displayName: name }));
    socket.on("student:joined", () => { clearTimeout(timer); resolve({ socket, studentId, name }); });
    socket.on("student:rejected", (d) => { clearTimeout(timer); reject(new Error(`rejected ${name}: ${JSON.stringify(d)}`)); });
    socket.on("connect_error", (e) => { clearTimeout(timer); reject(new Error(`connect_error ${name}: ${e.message}`)); });
  });
}

function submitAnswers(students, questionIndex, dist) {
  if (dist.__text) {
    dist.__text.forEach((txt, i) => {
      const s = students[i % students.length];
      s.socket.emit("answer:submit", { questionIndex, responseText: txt });
    });
    return;
  }
  let cursor = 0;
  for (const [label, count] of Object.entries(dist)) {
    for (let i = 0; i < count && cursor < students.length; i++, cursor++) {
      students[cursor].socket.emit("answer:submit", { questionIndex, selectedOptions: label.split("+") });
    }
  }
}

async function shoot(page, name) {
  await sleep(450);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  log(`  capture ${name}.png`);
}

function attachConsole(page, tag) {
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`[${tag}] ${msg.text()}`); });
  page.on("pageerror", (err) => consoleErrors.push(`[${tag}] pageerror: ${err.message}`));
}

async function waitText(page, text, timeout = 12000) {
  await page.waitForFunction((t) => document.body && document.body.innerText.includes(t), text, { timeout });
}

async function expandFoldoutNotes(page) {
  await page.evaluate(() => { document.querySelectorAll("details").forEach((d) => (d.open = true)); });
  await sleep(250);
}

async function main() {
  log(`base=${BASE} week=${WEEK} out=${OUT}`);
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "dark" });
  const phone = await browser.newContext({ viewport: { width: 402, height: 860 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "dark" });

  const instructor = await desktop.newPage();
  const projector = await desktop.newPage();
  const student = await phone.newPage();
  attachConsole(instructor, "instructor");
  attachConsole(projector, "projector");
  attachConsole(student, "student");

  log("instructor -> setup");
  await instructor.goto(`${BASE}/#/instructor`, { waitUntil: "networkidle" });
  await waitText(instructor, "Week 00");
  await sleep(600);
  await shoot(instructor, "instructor-setup");

  log("instructor -> create session");
  await instructor.locator("button", { hasText: "Week 00 Quiz" }).first().click();
  await sleep(300);
  const [sessionResp] = await Promise.all([
    instructor.waitForResponse((r) => r.url().includes("/api/session") && r.request().method() === "POST"),
    instructor.getByRole("button", { name: /^Create Session$/i }).click(),
  ]);
  const session = await sessionResp.json();
  const sessionId = session.sessionId;
  const code = session.sessionCode;
  log(`  session ${code} (${sessionId})`);

  log("students -> join");
  const students = [];
  for (let i = 0; i < ROSTER.length; i++) {
    try { students.push(await connectStudent(sessionId, ROSTER[i], i)); }
    catch (e) { log(`  ! ${e.message}`); }
  }
  log(`  ${students.length} students joined`);
  await sleep(1200);

  await waitText(instructor, code);
  await shoot(instructor, "instructor-lobby");

  log("projector -> lobby");
  await projector.goto(`${BASE}/#/present/${sessionId}`, { waitUntil: "networkidle" });
  await sleep(1500);
  await shoot(projector, "projector-lobby");

  log("student -> join form");
  await student.goto(`${BASE}/#/join/${code}`, { waitUntil: "networkidle" });
  await sleep(800);
  await shoot(student, "student-join");
  try {
    const nameField = student.locator("#join-display-name");
    if (await nameField.count()) await nameField.fill("Riya");
    await student.getByRole("button", { name: /^Join/i }).click();
    await sleep(1200);
  } catch (e) { log(`  ! student join: ${e.message}`); }

  log("start -> slide");
  await step(`/api/session/${sessionId}/start`);
  await waitText(projector, "Smoke Test Overview");
  await sleep(700);
  await expandFoldoutNotes(projector);
  await shoot(projector, "projector-slide");
  await sleep(300);
  await shoot(student, "student-slide");

  async function runQuestion(index, dist, { revealShot } = {}) {
    await step(`/api/session/${sessionId}/next`);
    await sleep(1100);
    submitAnswers(students, index, dist);
    await sleep(1200);
    await step(`/api/session/${sessionId}/close`);
    await sleep(700);
    await step(`/api/session/${sessionId}/reveal`);
    await sleep(1100);
    if (revealShot) await shoot(projector, revealShot);
  }

  log("Q1 MCQ");
  await step(`/api/session/${sessionId}/next`);
  await sleep(1200);
  await shoot(projector, "projector-question");
  await shoot(instructor, "instructor-live");
  await sleep(200);
  await shoot(student, "student-question");
  try {
    const optB = student.getByRole("button", { name: /Instructor page/i }).first();
    if (await optB.count()) await optB.click();
    await sleep(300);
    const submit = student.getByRole("button", { name: /Submit/i }).first();
    if (await submit.count()) await submit.click();
    await sleep(700);
    await shoot(student, "student-submitted");
  } catch (e) { log(`  ! student answer: ${e.message}`); }
  submitAnswers(students, 1, { B: 8, A: 2, C: 1, D: 1 });
  await sleep(1000);
  await step(`/api/session/${sessionId}/close`);
  await sleep(700);
  await step(`/api/session/${sessionId}/reveal`);
  await sleep(1100);
  await shoot(projector, "projector-reveal");

  log("Q2 multi-select");
  await runQuestion(2, { "A+D": 7, "A": 2, "D": 2, "A+B": 1 }, {});

  log("Q3 poll");
  await runQuestion(3, { B: 5, A: 3, C: 3, D: 1 }, { revealShot: "projector-poll" });

  log("Q4 open response");
  await runQuestion(4, { __text: [
    "A confirmation that the response was accepted.",
    "It stays editable until the question closes.",
    "The answer shows as submitted but unscored.",
    "A note that I can still update my reply.",
    "Confirmation it was received by the instructor.",
    "It shows submitted and lets me revise.",
  ] }, { revealShot: "projector-open-response" });

  log("Q5 image");
  await step(`/api/session/${sessionId}/next`);
  await sleep(1300);
  await projector.waitForSelector("img", { timeout: 8000 }).catch(() => {});
  await sleep(600);
  await shoot(projector, "projector-image");
  submitAnswers(students, 5, { B: 9, A: 1, C: 1, D: 1 });
  await sleep(1000);
  await step(`/api/session/${sessionId}/close`);
  await sleep(700);
  await step(`/api/session/${sessionId}/reveal`);
  await sleep(1100);
  await shoot(projector, "projector-image-reveal");

  log("leaderboard");
  await step(`/api/session/${sessionId}/leaderboard-show`);
  await sleep(1400);
  await shoot(projector, "projector-leaderboard");
  await sleep(300);
  await shoot(student, "student-leaderboard");

  await step(`/api/session/${sessionId}/end`);
  for (const s of students) s.socket.close();
  await browser.close();

  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".png"));
  log(`\ncaptured ${files.length} screenshots:`);
  for (const f of files.sort()) {
    const sz = fs.statSync(path.join(OUT, f)).size;
    log(`  ${f.padEnd(28)} ${(sz / 1024).toFixed(0)} KB${sz < 8000 ? "  WARN small" : ""}`);
  }
  log(`\nconsole errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 40).forEach((e) => log("  " + e));
}

main().catch((e) => { console.error("[capture] FATAL", e); process.exit(1); });
