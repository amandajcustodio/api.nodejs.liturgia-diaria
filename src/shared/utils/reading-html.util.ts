type VerseLine = {
  number: string | null;
  text: string;
};

const VERSE_START_PATTERN = /\d{1,3}(?:\s+)?(?=[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÜÇ"“«])/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>\s*<p[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTextIntoVerses(text: string): VerseLine[] {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [];
  }

  const matches = [...normalized.matchAll(VERSE_START_PATTERN)];

  if (!matches.length) {
    return [{ number: null, text: normalized }];
  }

  const lines: VerseLine[] = [];
  const intro = normalized.slice(0, matches[0].index).trim();

  if (intro) {
    lines.push({ number: null, text: intro });
  }

  for (let index = 0; index < matches.length; index += 1) {
    const number = matches[index][0].trim();
    const contentStart = matches[index].index! + matches[index][0].length;
    const contentEnd = index + 1 < matches.length ? matches[index + 1].index! : normalized.length;
    const verseText = normalized.slice(contentStart, contentEnd).trim();

    if (verseText) {
      lines.push({ number, text: verseText });
    }
  }

  return lines;
}

function versesToHtml(lines: VerseLine[], replySuffix = ""): string {
  return lines
    .map(({ number, text }) => {
      const sup = number ? `<sup>${number}</sup>` : "<sup></sup>";
      return `<p class="verse-line">${sup} ${escapeHtml(text)}${replySuffix}</p>`;
    })
    .join("\n");
}

function looksLikeVerseParagraph(text: string): boolean {
  return /^\d{1,3}(?:\s+|[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ"“«])/.test(text);
}

function formatProseReading(html: string): string {
  const text = stripHtmlToText(html);

  if (!text) {
    return "";
  }

  return versesToHtml(splitTextIntoVerses(text));
}

function formatPsalmReading(html: string): string {
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => match[1] ?? "");

  if (!paragraphs.length) {
    return formatProseReading(html);
  }

  const blocks: string[] = [];
  let refrainAdded = false;

  for (const rawParagraph of paragraphs) {
    let paragraph = stripHtmlToText(rawParagraph);
    const hasReply = /\sR\.\s*$/.test(paragraph);

    paragraph = paragraph.replace(/\sR\.\s*$/, "").trim();

    if (!paragraph) {
      continue;
    }

    const isRefrain = !refrainAdded && !looksLikeVerseParagraph(paragraph);

    if (isRefrain) {
      blocks.push(
        `<div class="psalm-response"><p class="refrain"><strong>℟. ${escapeHtml(paragraph)}</strong></p></div>`
      );
      refrainAdded = true;
      continue;
    }

    const replySuffix = hasReply ? ` <span class="psalm-reply">R.</span>` : "";
    const lines = splitTextIntoVerses(paragraph);

    if (!lines.length) {
      continue;
    }

    const formattedLines = lines.map((line, index) => {
      const suffix = hasReply && index === lines.length - 1 ? replySuffix : "";
      const sup = line.number ? `<sup>${line.number}</sup>` : "<sup></sup>";
      return `<p class="verse-line">${sup} ${escapeHtml(line.text)}${suffix}</p>`;
    });

    blocks.push(formattedLines.join("\n"));
  }

  return blocks.join("\n").trim();
}

export function buildWordOfLordResponse(kind: "reading" | "gospel"): string {
  if (kind === "gospel") {
    return `
      <p class="word-of-lord"><strong>℣. Palavra da Salvação.</strong></p>
      <p class="response-people"><strong>℟. Glória a Vós, Senhor.</strong></p>
    `.trim();
  }

  return `
    <p class="word-of-lord"><strong>℣. Palavra do Senhor.</strong></p>
    <p class="response-people"><strong>℟. Graças a Deus.</strong></p>
  `.trim();
}

export function normalizeGospelProclamation(reference: string): string {
  const normalized = reference
    .replace(/\s*✠\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.startsWith("✠") ? normalized : `✠ ${normalized}`;
}

export function sanitizeLirioMainContent(content: string): string {
  return content
    .replace(/<div class="readings-header"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<\/br>/gi, "<br>")
    .replace(/<div class="gospel-icon">\s*<\/div>/gi, "")
    .replace(/<cite class="reading-reference"[^>]*>\s*<\/cite>/gi, "")
    .replace(
      /(<cite[^>]*class="reading-reference"[^>]*>)\s*Proclamação/gi,
      "$1✠ Proclamação"
    )
    .trim();
}

export function formatReadingBodyHtml(html: string, readingType: string): string {
  const cleaned = html
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/\sstyle="[^"]*"/gi, "")
    .trim();

  if (/class="verse-line"/i.test(cleaned)) {
    return cleaned;
  }

  if (/salmo/i.test(readingType)) {
    return formatPsalmReading(cleaned);
  }

  return formatProseReading(cleaned);
}
