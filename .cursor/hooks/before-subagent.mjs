import { decideSubagent, readStdinJson, reply } from "./policy.mjs";

await readStdinJson();
reply(decideSubagent());
