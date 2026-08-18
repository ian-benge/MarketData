import { decideRead, readStdinJson, reply } from "./policy.mjs";

const input = await readStdinJson();
reply(decideRead(input.file_path || input.filePath));
