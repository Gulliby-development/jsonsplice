export function plain(text: string): string {
  let result = "";

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    result += codePoint >= 0x20 && codePoint <= 0x7e ? character : "?";
  }

  return result;
}

export function show(text: string): string {
  return `"${plain(text)}"`;
}

export function line(key: string, value: string): string {
  const padding = Math.max(0, 10 - Array.from(key).length);
  return `${key}${" ".repeat(padding)}  ${value}\n`;
}

export function table(header: string[], rows: string[][]): string {
  const allRows = [header, ...rows];
  const widths: number[] = [];

  for (const row of allRows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, Array.from(cell).length);
    });
  }

  return allRows
    .map((row) => {
      const cells = row.map((cell, index) => {
        if (index === row.length - 1) {
          return cell;
        }

        const padding = Math.max(0, (widths[index] ?? 0) - Array.from(cell).length);
        return `${cell}${" ".repeat(padding)}`;
      });
      return `${cells.join("  ").replace(/ +$/u, "")}\n`;
    })
    .join("");
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
