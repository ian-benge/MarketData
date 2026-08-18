#!/usr/bin/env npx tsx
import { main } from "./page-harness/cli";

async function exitProcess(code: number): Promise<void> {
  process.exitCode = code;
  // Windows libuv can assert UV_HANDLE_CLOSING if process.exit() races SDK HTTP sockets.
  await new Promise((resolve) => setTimeout(resolve, 150));
  process.exit(code);
}

void main().then(
  (code) => exitProcess(code),
  (error) => {
    console.error(error);
    return exitProcess(1);
  },
);
