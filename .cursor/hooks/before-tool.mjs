import { decidePreTool, readStdinJson, reply } from "./policy.mjs";

const input = await readStdinJson();
reply(decidePreTool(input));
