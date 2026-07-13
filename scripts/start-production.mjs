import { spawn } from "node:child_process";

const DEFAULT_PORT = "3100";
const env = {
  ...process.env,
  PORT: process.env.PORT ?? DEFAULT_PORT,
};

const child = spawn("npx", ["next", "start"], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});
