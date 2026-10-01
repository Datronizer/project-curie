/**
 * Utility functions for normalizing LaTeX and mathematical demarcations
 * in Markdown content before passing to parser.
 */

export function normalizeLatexDelimiters(text: string): string {
  if (!text) return "";

  const codeBlocks: string[] = [];
  // 1. Protect fenced code blocks (``` ... ```) and inline code (`...`)
  let out = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    codeBlocks.push(match);
    return `__CURIE_CODE_${codeBlocks.length - 1}__`;
  });

  // 2. Convert standard LaTeX display brackets \[ ... \] to $$ ... $$
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => `\n\n$$\n${formula.trim()}\n$$\n\n`);

  // 3. Handle unclosed trailing \[ at end of stream/text
  out = out.replace(/\\\[([\s\S]*?)$/g, (_, formula) => `\n\n$$\n${formula.trim()}\n$$\n\n`);

  // 4. Convert standard LaTeX inline parentheses \( ... \) to $ ... $
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => `$${formula.trim()}$`);

  // 5. Ensure $$ display blocks embedded in paragraphs have clean newlines
  out = out.replace(/(?:^|\n)?\s*\$\$([\s\S]*?)\$\$\s*(?:\n|$)?/g, (_, formula) => {
    return `\n\n$$\n${formula.trim()}\n$$\n\n`;
  });

  // 6. Auto-close trailing unclosed $$ block (e.g. while streaming)
  const doubleDollarMatches = out.match(/\$\$/g);
  if (doubleDollarMatches && doubleDollarMatches.length % 2 !== 0) {
    out = `${out}\n$$`;
  }

  // 7. Restore code blocks
  out = out.replace(/__CURIE_CODE_(\d+)__/g, (_, idx) => codeBlocks[Number(idx)]);

  return out;
}
