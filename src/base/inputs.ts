import { Fail } from "./fail";
import { show } from "./text";

export interface Io {
  readStdin(): Uint8Array;
  readFile(path: string): Uint8Array;
  writeFile(path: string, data: Uint8Array): void;
  out(text: string): void;
  err(text: string): void;
}

export interface Source {
  display: string;
  text: string;
  bom: boolean;
}

export function readText(io: Io, arg: string): Source {
  const isStdin = arg === "-";
  const display = isStdin ? "<stdin>" : show(arg);
  let bytes: Uint8Array;

  try {
    bytes = isStdin ? io.readStdin() : io.readFile(arg);
  } catch {
    throw new Fail(`${display}: cannot read the file`);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Fail(`${display}: input is not valid UTF-8`);
  }

  const bom = text.startsWith("\uFEFF");
  if (bom) {
    text = text.slice(1);
  }

  return { display, text, bom };
}
