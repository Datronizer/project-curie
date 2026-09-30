import { formatMarkdownTable, ParsedTable } from "./table.parser";

export interface SynthesizerPageInput
{
    pageIndex: number;
    svgPath?: string;
    transcription?: {
        text: string;
        confidence: number;
        lines?: { text: string; confidence: number }[];
    };
}

export interface NoteSynthesisInput
{
    title: string;
    sourceSdocxPath: string;
    audioPaths?: string[];
    imagePaths?: string[];
    pages?: SynthesizerPageInput[];
    paragraphs?: string[];
    tables?: ParsedTable[];
    ingestedAt?: Date;
}

/**
 * Assembles YAML frontmatter, audio wikilinks, vector SVG embeds,
 * transcribed text sections, and tables into an Obsidian-compatible Markdown note.
 */
export function synthesizeMarkdownNote(input: NoteSynthesisInput): string
{
    const ingestedAt = input.ingestedAt ?? new Date();
    const hasHandwriting = (input.pages ?? []).some((p) => Boolean(p.svgPath));
    const hasTranscription = (input.pages ?? []).some((p) => Boolean(p.transcription?.text?.trim()));
    const audioList = input.audioPaths ?? [];
    const imageList = input.imagePaths ?? [];
    const pagesList = input.pages ?? [];
    const paragraphsList = input.paragraphs ?? [];
    const tablesList = input.tables ?? [];

    const frontmatterLines: string[] = [
        "---",
        `title: ${JSON.stringify(input.title)}`,
        `source_sdocx: ${JSON.stringify(input.sourceSdocxPath)}`,
        `ingested_at: ${JSON.stringify(ingestedAt.toISOString())}`,
        `curie_type: "sdocx_note"`,
        `has_handwriting: ${hasHandwriting}`,
        `has_transcription: ${hasTranscription}`,
    ];

    if (audioList.length > 0)
    {
        frontmatterLines.push("audio_attachments:");
        for (const audio of audioList)
        {
            frontmatterLines.push(`  - ${JSON.stringify(audio)}`);
        }
    }

    frontmatterLines.push("---", "");

    const sections: string[] = [frontmatterLines.join("\n")];

    // Title & Info Callout
    sections.push(`# ${input.title}\n`);
    sections.push(
        `> [!INFO] Samsung Note Archive\n` +
        `> Source: [[${input.sourceSdocxPath}|Preserved .sdocx Archive]]\n` +
        `> Ingested: ${ingestedAt.toISOString().replace("T", " ").replace(/\..+/, "")} UTC\n`
    );

    // Audio recordings
    if (audioList.length > 0)
    {
        const audioItems = audioList.map((p) => `![[${p}]]`).join("\n\n");
        sections.push(`## Audio Recordings\n\n${audioItems}\n`);
    }

    // Extracted typed text / paragraphs
    if (paragraphsList.length > 0)
    {
        sections.push(`## Typed Notes\n\n${paragraphsList.join("\n\n")}\n`);
    }

    // Extracted tables
    if (tablesList.length > 0)
    {
        const formattedTables = tablesList
            .map((table) => formatMarkdownTable(table))
            .filter((t) => t.trim().length > 0);

        if (formattedTables.length > 0)
        {
            sections.push(`## Tables\n\n${formattedTables.join("\n\n")}\n`);
        }
    }

    // Stylus Pages (Handwriting & Transcription)
    if (pagesList.length > 0)
    {
        sections.push(`## Handwriting & Notes\n`);

        for (const page of pagesList)
        {
            const pageHeader = `### Page ${page.pageIndex}\n`;
            let pageContent = "";

            if (page.svgPath)
            {
                pageContent += `![[${page.svgPath}]]\n\n`;
            }

            const transText = page.transcription?.text?.trim();
            if (transText)
            {
                pageContent += `<details open class="curie-transcription">\n` +
                    `<summary><b>Transcribed Text (Page ${page.pageIndex})</b></summary>\n\n` +
                    `${transText}\n\n` +
                    `</details>\n`;
            }

            sections.push(pageHeader + pageContent);
        }
    }

    // Embedded Images
    if (imageList.length > 0)
    {
        const imageItems = imageList.map((p) => `![[${p}]]`).join("\n\n");
        sections.push(`## Embedded Images\n\n${imageItems}\n`);
    }

    return sections.join("\n").trim() + "\n";
}
