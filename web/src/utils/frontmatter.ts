/**
 * Utility functions for parsing and handling Markdown YAML frontmatter (metadata)
 * delimited by triple dashes (---).
 */

export interface FrontmatterResult {
  metadata: Record<string, any> | null;
  body: string;
  hasFrontmatter: boolean;
}

export function parseFrontmatter(text: string): FrontmatterResult {
  if (!text) {
    return { metadata: null, body: "", hasFrontmatter: false };
  }

  // Frontmatter must be at the very beginning of the document
  const match = text.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
  if (!match) {
    return { metadata: null, body: text, hasFrontmatter: false };
  }

  const rawYaml = match[1];
  const body = text.slice(match[0].length);
  const metadata: Record<string, any> = {};

  const lines = rawYaml.split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Bullet item under previous key: - item
    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    if (bulletMatch) {
      let val = bulletMatch[1].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (currentKey) {
        if (!Array.isArray(metadata[currentKey])) {
          metadata[currentKey] = [];
        }
        metadata[currentKey].push(val);
      }
      continue;
    }

    // Key-value pair: key: value
    const kvMatch = line.match(/^([A-Za-z0-9_\-\.]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let rawVal = kvMatch[2].trim();
      currentKey = key;

      if (!rawVal) {
        // Will be populated by upcoming bullet lines or stay as empty array
        metadata[key] = [];
        continue;
      }

      // Inline array: [a, b, c]
      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        const items = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => {
            let sTrim = s.trim();
            if (
              (sTrim.startsWith('"') && sTrim.endsWith('"')) ||
              (sTrim.startsWith("'") && sTrim.endsWith("'"))
            ) {
              sTrim = sTrim.slice(1, -1);
            }
            return sTrim;
          })
          .filter(Boolean);
        metadata[key] = items;
        continue;
      }

      // Boolean
      if (rawVal.toLowerCase() === "true") {
        metadata[key] = true;
        continue;
      }
      if (rawVal.toLowerCase() === "false") {
        metadata[key] = false;
        continue;
      }

      // Number
      if (!isNaN(Number(rawVal)) && rawVal !== "") {
        metadata[key] = Number(rawVal);
        continue;
      }

      // Quoted string cleanup
      if (
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
      ) {
        rawVal = rawVal.slice(1, -1);
      }

      metadata[key] = rawVal;
    }
  }

  // Convert empty arrays that had no items to empty string
  for (const k in metadata) {
    if (Array.isArray(metadata[k]) && metadata[k].length === 0) {
      metadata[k] = "";
    }
  }

  const hasProperties = Object.keys(metadata).length > 0;
  return {
    metadata: hasProperties ? metadata : null,
    body,
    hasFrontmatter: true,
  };
}
