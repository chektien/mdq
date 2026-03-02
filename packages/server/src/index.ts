import { createServer } from "http";
import { createApp } from "./app";
import { setupSocket } from "./socket";
import { DEFAULT_PORT } from "@md-quiz/shared";
import * as path from "path";

const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
const quizDir = process.env.QUIZ_DIR || path.join(__dirname, "../../data/quizzes");

const app = createApp(quizDir);
const httpServer = createServer(app);

// Access the quiz store from the app for socket setup
const quizzes = (app as unknown as { _quizzes: Map<string, unknown> })._quizzes;
setupSocket(httpServer, quizzes as Map<string, import("@md-quiz/shared").Quiz>);

httpServer.listen(port, () => {
  console.log(`md-quiz server listening on port ${port}`);
  console.log(`Quiz directory: ${quizDir}`);
});
