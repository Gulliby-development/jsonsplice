import { Fail } from "../base/fail";
import type { Io } from "../base/inputs";
import { parseOptions } from "../base/options";
import { show } from "../base/text";
import * as check from "./cmd-check";
import * as del from "./cmd-delete";
import * as get from "./cmd-get";
import * as insert from "./cmd-insert";
import * as infoLayout from "./cmd-layout";
import * as paths from "./cmd-paths";
import * as set from "./cmd-set";

const commands = [
  { name: "check", ARGS: check.ARGS, MAX: check.MAX, SPECS: check.SPECS, run: check.runCheck },
  { name: "get", ARGS: get.ARGS, MAX: get.MAX, SPECS: get.SPECS, run: get.runGet },
  { name: "paths", ARGS: paths.ARGS, MAX: paths.MAX, SPECS: paths.SPECS, run: paths.runPaths },
  {
    name: "layout",
    ARGS: infoLayout.ARGS,
    MAX: infoLayout.MAX,
    SPECS: infoLayout.SPECS,
    run: infoLayout.runLayout,
  },
  { name: "set", ARGS: set.ARGS, MAX: set.MAX, SPECS: set.SPECS, run: set.runSet },
  {
    name: "insert",
    ARGS: insert.ARGS,
    MAX: insert.MAX,
    SPECS: insert.SPECS,
    run: insert.runInsert,
  },
  { name: "delete", ARGS: del.ARGS, MAX: del.MAX, SPECS: del.SPECS, run: del.runDelete },
] as const;

const help = `usage: ${check.USAGE}
       ${get.USAGE}
       ${paths.USAGE}
       ${infoLayout.USAGE}
       ${set.USAGE}
       ${insert.USAGE}
       ${del.USAGE}
`;

function reportError(error: unknown, io: Pick<Io, "err">): void {
  const message = error instanceof Fail ? error.message : "unexpected error";

  try {
    io.err(`jsonsplice: ${message}\n`);
  } catch {
    // Error sinks are best-effort and must not escape the CLI.
  }
}

export function run(argv: string[], io: Io): number {
  let result: { out: string; code: number };

  try {
    if (argv.length === 0) {
      throw new Fail("missing command (check, get, paths, layout, set, insert or delete)");
    }

    if (argv.length === 1 && argv[0] === "--help") {
      result = { out: help, code: 0 };
    } else {
      const commandName = argv[0] ?? "";
      const command = commands.find((candidate) => candidate.name === commandName);

      if (command === undefined) {
        throw new Fail(`unknown command ${show(commandName)}`);
      }

      const parsed = parseOptions(argv.slice(1), command.SPECS);

      if (parsed.args.length < command.ARGS.length) {
        throw new Fail(`missing ${command.ARGS[parsed.args.length]}`);
      }

      if (parsed.args.length > command.MAX) {
        throw new Fail("too many arguments");
      }

      result = command.run(parsed.args, parsed.flags, io);
    }
  } catch (error) {
    reportError(error, io);
    return 2;
  }

  try {
    io.out(result.out);
    return result.code;
  } catch {
    reportError(new Error("output failed"), io);
    return 2;
  }
}
