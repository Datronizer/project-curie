export interface StrokePoint
{
    x: number;
    y: number;
    pressure?: number;
}

export interface Stroke
{
    color: string;
    width: number;
    opacity?: number;
    points: StrokePoint[];
}

export interface ParsedPageStrokes
{
    pageIndex: number;
    width: number;
    height: number;
    strokes: Stroke[];
}

function argbToHex(colorInt: number): { hex: string; opacity: number }
{
    const a = (colorInt >> 24) & 0xff;
    const r = (colorInt >> 16) & 0xff;
    const g = (colorInt >> 8) & 0xff;
    const b = colorInt & 0xff;

    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    const opacity = a === 0 && colorInt !== 0 ? 1.0 : Math.round((a / 255) * 100) / 100;
    return { hex, opacity: opacity || 1.0 };
}

/**
 * Robust binary stroke reader for Samsung Notes page/stroke binary files.
 * Handles common binary layouts and falls back gracefully.
 */
export function parseStrokeBuffer(buffer: Buffer, pageIndex: number): ParsedPageStrokes
{
    const defaultWidth = 1440;
    const defaultHeight = 2560;

    if (!buffer || buffer.length < 16)
    {
        return {
            pageIndex,
            width: defaultWidth,
            height: defaultHeight,
            strokes: [],
        };
    }

    try
    {
        // Check if buffer is an image (PNG, JPG, SVG) embedded as stroke page
        if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
        {
            // It's a PNG image
            return {
                pageIndex,
                width: defaultWidth,
                height: defaultHeight,
                strokes: [],
            };
        }

        const strokes: Stroke[] = [];
        let offset = 0;

        // Try reading header
        let pageWidth = defaultWidth;
        let pageHeight = defaultHeight;

        // In some Samsung formats, first 4-8 bytes contain dimensions or stroke count
        if (buffer.length >= 16)
        {
            const possibleW = buffer.readUInt32LE(0);
            const possibleH = buffer.readUInt32LE(4);
            if (possibleW >= 200 && possibleW <= 8000 && possibleH >= 200 && possibleH <= 16000)
            {
                pageWidth = possibleW;
                pageHeight = possibleH;
                offset = 8;
            }
        }

        // Parse stroke blocks
        // Typical structure per stroke:
        // [Stroke Header: Color (4 bytes), Width/Style (4 bytes), Point Count (4 bytes)]
        // Followed by points: [X (float32), Y (float32), Pressure (float32)]
        while (offset + 12 <= buffer.length)
        {
            const rawColor = buffer.readUInt32LE(offset);
            const rawWidth = buffer.readFloatLE ? buffer.readFloatLE(offset + 4) : 2.0;
            const pointCount = buffer.readUInt32LE(offset + 8);
            offset += 12;

            // Sanity check pointCount
            if (pointCount > 0 && pointCount < 50000 && offset + pointCount * 8 <= buffer.length)
            {
                const points: StrokePoint[] = [];
                const strokeWidth = (rawWidth > 0 && rawWidth < 100) ? rawWidth : 2.5;
                const { hex, opacity } = argbToHex(rawColor || 0xff000000);

                let hasValidPoints = true;
                for (let i = 0; i < pointCount; i++)
                {
                    if (offset + 8 > buffer.length)
                    {
                        hasValidPoints = false;
                        break;
                    }

                    const x = buffer.readFloatLE(offset);
                    const y = buffer.readFloatLE(offset + 4);
                    offset += 8;

                    // Optional pressure
                    let pressure = 1.0;
                    if (offset + 4 <= buffer.length && pointCount * 12 <= buffer.length - offset)
                    {
                        // Check if pressure float follows
                        const p = buffer.readFloatLE(offset);
                        if (p >= 0 && p <= 2.0)
                        {
                            pressure = p;
                            offset += 4;
                        }
                    }

                    if (isNaN(x) || isNaN(y) || x < -500 || x > pageWidth * 2 || y < -500 || y > pageHeight * 2)
                    {
                        hasValidPoints = false;
                        break;
                    }

                    points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, pressure });
                }

                if (hasValidPoints && points.length > 0)
                {
                    strokes.push({
                        color: hex,
                        width: Math.max(1, Math.round(strokeWidth * 10) / 10),
                        opacity,
                        points,
                    });
                }
            }
            else
            {
                // Advance 4 bytes and search for next plausible stroke
                offset += 4;
            }
        }

        return {
            pageIndex,
            width: pageWidth,
            height: pageHeight,
            strokes,
        };
    }
    catch (err)
    {
        console.warn(`[StrokeParser] Non-fatal error parsing page ${pageIndex} strokes:`, err);
        return {
            pageIndex,
            width: defaultWidth,
            height: defaultHeight,
            strokes: [],
        };
    }
}

/**
 * Converts parsed stroke paths into scalable vector SVG markup.
 */
export function renderStrokesToSvg(page: ParsedPageStrokes): string
{
    const { width, height, strokes, pageIndex } = page;

    if (strokes.length === 0)
    {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- Page ${pageIndex} (No vector ink detected) -->
  <rect width="100%" height="100%" fill="#ffffff" />
</svg>`;
    }

    let pathsMarkup = "";

    for (const stroke of strokes)
    {
        const { points, color, width: strokeWidth, opacity = 1.0 } = stroke;
        if (points.length === 0) continue;

        if (points.length === 1)
        {
            // Single point dot
            const p = points[0];
            const r = Math.max(1.5, strokeWidth / 2);
            pathsMarkup += `  <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" opacity="${opacity}" />\n`;
            continue;
        }

        // Build smooth curve path using quadratic beziers
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++)
        {
            const p0 = points[i - 1];
            const p1 = points[i];
            const midX = ((p0.x + p1.x) / 2).toFixed(1);
            const midY = ((p0.y + p1.y) / 2).toFixed(1);
            d += ` Q ${p0.x} ${p0.y} ${midX} ${midY}`;
        }
        const last = points[points.length - 1];
        d += ` L ${last.x} ${last.y}`;

        pathsMarkup += `  <path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />\n`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <g id="page-${pageIndex}-strokes">
${pathsMarkup}  </g>
</svg>`;
}
