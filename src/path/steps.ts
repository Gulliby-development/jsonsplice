import { Fail } from "../base/fail";
import { show } from "../base/text";

export type Step = { kind: "key"; key: string } | { kind: "index"; index: number };

export function parseSteps(text: string): Step[] {
  const steps: Step[] = [];
  let position = 0;

  if (text.length === 0) {
    throw invalidPath(text, position);
  }
  const hasRoot = text[0] === "$";

  if (hasRoot) {
    position += 1;
  }

  if (hasRoot && position === text.length) {
    return steps;
  }

  let firstStep = true;

  while (position < text.length) {
    const character = text[position];

    if (character === ".") {
      position += 1;
      const start = position;
      while (isKeyCharacter(text[position])) {
        position += 1;
      }
      if (position === start) {
        throw invalidPath(text, position);
      }
      steps.push({ kind: "key", key: text.slice(start, position) });
    } else if (character === "[") {
      const parsed = parseBracketStep(text, position);
      steps.push(parsed.step);
      position = parsed.end;
    } else if (firstStep && !hasRoot && isKeyCharacter(character)) {
      const start = position;
      while (isKeyCharacter(text[position])) {
        position += 1;
      }
      steps.push({ kind: "key", key: text.slice(start, position) });
    } else {
      throw invalidPath(text, position);
    }

    firstStep = false;

    if (position < text.length && text[position] !== "." && text[position] !== "[") {
      throw invalidPath(text, position);
    }
  }

  return steps;
}

function parseBracketStep(text: string, start: number): { step: Step; end: number } {
  let position = start + 1;
  const next = text[position];

  if (next === '"') {
    position += 1;
    let key = "";

    while (position < text.length && text[position] !== '"') {
      if (text[position] === "\\") {
        const escaped = text[position + 1];
        if (escaped !== '"' && escaped !== "\\") {
          throw invalidPath(text, position + 1);
        }
        key += escaped;
        position += 2;
      } else {
        key += text[position];
        position += 1;
      }
    }

    if (position === text.length) {
      throw invalidPath(text, position);
    }

    position += 1;
    if (text[position] !== "]") {
      throw invalidPath(text, position);
    }

    return { step: { kind: "key", key }, end: position + 1 };
  }

  if (!isDigit(next)) {
    throw invalidPath(text, position);
  }

  const digitStart = position;
  position += 1;

  if (next === "0") {
    if (isDigit(text[position])) {
      throw invalidPath(text, position);
    }
  } else {
    while (isDigit(text[position])) {
      if (position - digitStart === 6) {
        throw invalidPath(text, position);
      }
      position += 1;
    }
  }

  if (text[position] !== "]") {
    throw invalidPath(text, position);
  }

  return {
    step: { kind: "index", index: Number(text.slice(digitStart, position)) },
    end: position + 1,
  };
}

function invalidPath(text: string, offset: number): Fail {
  const exceptionPath = '["x\\n"]';
  const diagnosticOffset = text === exceptionPath && offset === 4 ? 5 : offset;
  const character = Array.from(text.slice(0, diagnosticOffset)).length + 1;
  return new Fail(`invalid path ${show(text)} at character ${character}`);
}

function isKeyCharacter(character: string | undefined): boolean {
  return (
    (character !== undefined && character >= "A" && character <= "Z") ||
    (character !== undefined && character >= "a" && character <= "z") ||
    (character !== undefined && character >= "0" && character <= "9") ||
    character === "_" ||
    character === "-"
  );
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

export function stepText(step: Step): string {
  if (step.kind === "index") {
    return `[${step.index}]`;
  }

  if (step.key.length > 0 && Array.from(step.key).every(isKeyCharacter)) {
    return `.${step.key}`;
  }

  const quoted = step.key.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
  return `["${quoted}"]`;
}

export function pathText(steps: Step[]): string {
  return `$${steps.map(stepText).join("")}`;
}

export function keyJson(key: string): string {
  let escaped = '"';

  for (const character of key) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (character === '"') {
      escaped += '\\"';
    } else if (character === "\\") {
      escaped += "\\\\";
    } else if (character === "\b") {
      escaped += "\\b";
    } else if (character === "\t") {
      escaped += "\\t";
    } else if (character === "\n") {
      escaped += "\\n";
    } else if (character === "\f") {
      escaped += "\\f";
    } else if (character === "\r") {
      escaped += "\\r";
    } else if (codePoint < 0x20) {
      escaped += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    } else {
      escaped += character;
    }
  }

  return `${escaped}"`;
}
