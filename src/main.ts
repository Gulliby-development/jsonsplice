import { readFileSync, writeFileSync } from "node:fs";
import type { Io } from "./base/inputs";
import { run } from "./cli/cli";

const io: Io = {
  readStdin: () => readFileSync(0),
  readFile: (path: string) => readFileSync(path),
  writeFile: (path: string, data: Uint8Array) => {
    writeFileSync(path, data);
  },
  out: (text: string) => {
    process.stdout.write(text);
  },
  err: (text: string) => {
    process.stderr.write(text);
  },
};

process.exitCode = run(process.argv.slice(2), io);
