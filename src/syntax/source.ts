export function lineStart(text: string, offset: number): number {
  if (offset === 0) {
    return 0;
  }

  return text.lastIndexOf("\n", offset - 1) + 1;
}

export function lineCol(text: string, offset: number): [number, number] {
  const start = lineStart(text, offset);
  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      line += 1;
    }
  }

  return [line, offset - start + 1];
}

export function startsLine(text: string, offset: number): boolean {
  const start = lineStart(text, offset);

  for (let index = start; index < offset; index += 1) {
    if (text[index] !== " " && text[index] !== "\t") {
      return false;
    }
  }

  return true;
}

export function baseWs(text: string, offset: number): string {
  const start = lineStart(text, offset);
  let end = start;

  while (text[end] === " " || text[end] === "\t") {
    end += 1;
  }

  return text.slice(start, end);
}

export function breakLength(text: string, at: number): number {
  if (text[at] === "\r" && text[at + 1] === "\n") {
    return 2;
  }

  return text[at] === "\n" ? 1 : 0;
}

export function tailEnd(text: string, offset: number): { end: number; ok: boolean } {
  let position = offset;

  while (position < text.length) {
    const character = text[position];

    if (character === " " || character === "\t") {
      position += 1;
      continue;
    }

    if (character === "\r") {
      if (text[position + 1] === "\n") {
        return { end: position, ok: true };
      }

      position += 1;
      continue;
    }

    if (character === "\n") {
      return { end: position, ok: true };
    }

    if (character === "/" && text[position + 1] === "/") {
      let end = position + 2;

      while (end < text.length && text[end] !== "\n") {
        end += 1;
      }

      if (end === text.length) {
        return { end, ok: true };
      }

      return { end: text[end - 1] === "\r" ? end - 1 : end, ok: true };
    }

    if (character === "/" && text[position + 1] === "*") {
      let end = position + 2;

      while (end + 1 < text.length && !(text[end] === "*" && text[end + 1] === "/")) {
        if (text[end] === "\n") {
          return { end: offset, ok: false };
        }

        end += 1;
      }

      if (end + 1 >= text.length) {
        return { end: offset, ok: false };
      }

      position = end + 2;
      continue;
    }

    return { end: offset, ok: false };
  }

  return { end: text.length, ok: true };
}
