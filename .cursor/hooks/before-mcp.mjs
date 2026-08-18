import { decideMcp, readStdinJson, reply } from "./policy.mjs";

const input = await readStdinJson();
reply(decideMcp(input));
