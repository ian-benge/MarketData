import { decideShell, readStdinJson, reply } from "./policy.mjs";

const input = await readStdinJson();
reply(decideShell(input.command));
