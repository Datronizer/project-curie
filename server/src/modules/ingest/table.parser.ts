export interface ParsedTable
{
    headers?: string[];
    rows: string[][];
}

export interface ExtractedContent
{
    title?: string;
    textParagraphs: string[];
    tables: ParsedTable[];
}

/**
 * Formats a 2D array of cells into a GitHub-Flavored Markdown table.
 */
export function formatMarkdownTable(table: ParsedTable): string
{
    if (!table.rows || table.rows.length === 0)
    {
        return "";
    }

    const colCount = Math.max(
        table.headers?.length ?? 0,
        ...table.rows.map((r) => r.length)
    );

    if (colCount === 0) return "";

    const escapeCell = (cell: string) => (cell || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();

    const headers = table.headers && table.headers.length > 0
        ? table.headers.map(escapeCell)
        : Array.from({ length: colCount }, (_, i) => `Header ${i + 1}`);

    while (headers.length < colCount)
    {
        headers.push(`Header ${headers.length + 1}`);
    }

    const headerLine = `| ${headers.join(" | ")} |`;
    const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;

    const rowLines = table.rows.map((row) =>
    {
        const paddedRow = [...row];
        while (paddedRow.length < colCount)
        {
            paddedRow.push("");
        }
        return `| ${paddedRow.slice(0, colCount).map(escapeCell).join(" | ")} |`;
    });

    return [headerLine, separatorLine, ...rowLines].join("\n");
}

/**
 * Extracts paragraphs and tables from XML and JSON strings stored inside the .sdocx archive.
 */
export function extractContentFromXmlOrJson(files: { path: string; text: string }[]): ExtractedContent
{
    let title: string | undefined;
    const textParagraphs: string[] = [];
    const tables: ParsedTable[] = [];

    for (const file of files)
    {
        const { text: content } = file;

        // Try JSON parsing first
        if (content.trim().startsWith("{") || content.trim().startsWith("["))
        {
            try
            {
                const json = JSON.parse(content);
                const foundTitle = extractFromJson(json, textParagraphs, tables);
                if (!title && foundTitle) title = foundTitle;
                continue;
            }
            catch
            {
                // Fall back to regex/XML matching
            }
        }

        // XML parsing via regex patterns for robust extraction across Samsung schema versions
        const foundTitle = extractFromXml(content, textParagraphs, tables);
        if (!title && foundTitle) title = foundTitle;
    }

    // Deduplicate identical consecutive paragraphs
    const dedupedParagraphs: string[] = [];
    for (const p of textParagraphs)
    {
        const trimmed = p.trim();
        if (trimmed && (dedupedParagraphs.length === 0 || dedupedParagraphs[dedupedParagraphs.length - 1] !== trimmed))
        {
            dedupedParagraphs.push(trimmed);
        }
    }

    return {
        title,
        textParagraphs: dedupedParagraphs,
        tables,
    };
}

function extractFromJson(obj: any, paragraphs: string[], tables: ParsedTable[]): string | undefined
{
    if (!obj || typeof obj !== "object") return undefined;

    let foundTitle: string | undefined;

    if (typeof obj.title === "string" && obj.title.trim())
    {
        foundTitle = obj.title.trim();
    }

    if (Array.isArray(obj))
    {
        for (const item of obj)
        {
            const t = extractFromJson(item, paragraphs, tables);
            if (!foundTitle && t) foundTitle = t;
        }
        return foundTitle;
    }

    // Check for table objects
    if (obj.type === "table" || obj.table || Array.isArray(obj.rows))
    {
        const rawRows = obj.rows || (obj.table && obj.table.rows);
        if (Array.isArray(rawRows))
        {
            const rows: string[][] = [];
            for (const r of rawRows)
            {
                if (Array.isArray(r))
                {
                    rows.push(r.map((c) => String(c ?? "")));
                }
                else if (r && Array.isArray(r.cells))
                {
                    rows.push(r.cells.map((c: any) => String(c?.text ?? c ?? "")));
                }
            }
            if (rows.length > 0)
            {
                tables.push({ rows });
                return foundTitle;
            }
        }
    }

    // Check for text/paragraph objects
    if (typeof obj.text === "string" && obj.text.trim())
    {
        paragraphs.push(obj.text.trim());
    }
    else if (typeof obj.content === "string" && obj.content.trim())
    {
        paragraphs.push(obj.content.trim());
    }

    for (const key of Object.keys(obj))
    {
        const t = extractFromJson(obj[key], paragraphs, tables);
        if (!foundTitle && t) foundTitle = t;
    }

    return foundTitle;
}

function extractFromXml(xml: string, paragraphs: string[], tables: ParsedTable[]): string | undefined
{
    // Extract title if present: <title>...</title>
    let foundTitle: string | undefined;
    const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i;
    const titleMatch = titleRegex.exec(xml);
    if (titleMatch)
    {
        foundTitle = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    // Match <table>...</table> blocks
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRegex.exec(xml)) !== null)
    {
        const tableBody = tableMatch[1];
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>|<row[^>]*>([\s\S]*?)<\/row>/gi;
        let rowMatch: RegExpExecArray | null;
        const rows: string[][] = [];

        while ((rowMatch = rowRegex.exec(tableBody)) !== null)
        {
            const rowBody = rowMatch[1] || rowMatch[2];
            const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>|<cell[^>]*>([\s\S]*?)<\/cell>/gi;
            let cellMatch: RegExpExecArray | null;
            const cells: string[] = [];

            while ((cellMatch = cellRegex.exec(rowBody)) !== null)
            {
                const cellText = (cellMatch[1] || cellMatch[2]).replace(/<[^>]+>/g, "").trim();
                cells.push(cellText);
            }

            if (cells.length > 0)
            {
                rows.push(cells);
            }
        }

        if (rows.length > 0)
        {
            tables.push({ rows });
        }
    }

    // Match paragraph and text elements: <p>...</p>, <text>...</text>, <span ...>...</span>
    const textRegex = /<(?:p|text|string)[^>]*>([\s\S]*?)<\/(?:p|text|string)>/gi;
    let textMatch: RegExpExecArray | null;

    while ((textMatch = textRegex.exec(xml)) !== null)
    {
        const stripped = textMatch[1].replace(/<[^>]+>/g, "").trim();
        // Skip XML tags, schema attributes, and short technical strings
        if (stripped && stripped.length > 1 && !stripped.includes("xmlns:") && !stripped.startsWith("http"))
        {
            paragraphs.push(stripped);
        }
    }

    return foundTitle;
}
