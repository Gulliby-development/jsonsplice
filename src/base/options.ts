import { Fail } from "./fail";
import { show } from "./text";

export function parseOptions(
  argv: string[],
  specs: string[],
): { flags: Set<string>; args: string[] } {
  const flags = new Set<string>();
  const args: string[] = [];

  for (const argument of argv) {
    if (argument.startsWith("--")) {
      if (!specs.includes(argument)) {
        throw new Fail(`unknown option ${show(argument)}`);
      }

      flags.add(argument);
    } else {
      args.push(argument);
    }
  }

  return { flags, args };
}
