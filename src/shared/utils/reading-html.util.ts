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

  const text = normalized.replace(/^✠\s*/, "").trim();

  return `<span class="gospel-cross" aria-hidden="true">✠</span> ${text}`;
}

export type LirioLiturgicalEnrichment = {
  firstReadingSubtitle: string | null;
  gospelSubtitle: string | null;
  gospelProclamation: string | null;
  alleluiaSectionHtml: string | null;
};

function stripTagsToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLiturgicalEnrichmentFromLirio(html: string): LirioLiturgicalEnrichment | null {
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const content = mainMatch ? mainMatch[1] : html;

  if (!/reading-subtitle|alleluia-section|gospel-section/i.test(content)) {
    return null;
  }

  const firstReadingSubtitleMatch = content.match(
    /<h3[^>]*>[\s\S]*?primeira\s+leitura[\s\S]*?<\/h3>\s*<p class="reading-subtitle"[^>]*>([\s\S]*?)<\/p>/i
  );

  const gospelSubtitleMatch = content.match(
    /<article[^>]*class="[^"]*gospel-section[^"]*"[^>]*>[\s\S]*?<p class="reading-subtitle"[^>]*>([\s\S]*?)<\/p>/i
  );

  const gospelReferenceMatch = content.match(
    /<article[^>]*class="[^"]*gospel-section[^"]*"[^>]*>[\s\S]*?<cite class="reading-reference"[^>]*>([\s\S]*?)<\/cite>/i
  );

  const alleluiaMatch = content.match(/<section class="alleluia-section"[^>]*>([\s\S]*?)<\/section>/i);

  const gospelProclamationRaw = gospelReferenceMatch?.[1]
    ? stripTagsToText(gospelReferenceMatch[1])
    : null;

  return {
    firstReadingSubtitle: firstReadingSubtitleMatch?.[1] ? stripTagsToText(firstReadingSubtitleMatch[1]) : null,
    gospelSubtitle: gospelSubtitleMatch?.[1] ? stripTagsToText(gospelSubtitleMatch[1]) : null,
    gospelProclamation: gospelProclamationRaw || null,
    alleluiaSectionHtml: alleluiaMatch?.[0] ?? null
  };
}

export function enrichPprLiturgyWithLirio(pprContent: string, lirioHtml: string): string {
  const enrichment = extractLiturgicalEnrichmentFromLirio(lirioHtml);

  if (!enrichment) {
    return pprContent;
  }

  let content = pprContent;

  if (enrichment.firstReadingSubtitle) {
    content = content.replace(
      /(<article class="reading">\s*<header>\s*<h3 class="reading-title">[^<]*primeira\s+leitura[^<]*<\/h3>)(\s*<cite class="reading-reference">)/i,
      `$1\n            <p class="reading-subtitle">${escapeHtml(enrichment.firstReadingSubtitle)}</p>$2`
    );

    content = content.replace(
      /(<article class="reading">\s*<header>\s*<h3 class="reading-title">[^<]*primeira\s+leitura[^<]*<\/h3>)(\s*<\/header>)/i,
      `$1\n            <p class="reading-subtitle">${escapeHtml(enrichment.firstReadingSubtitle)}</p>$2`
    );
  }

  if (enrichment.alleluiaSectionHtml) {
    const alleluiaSection = sanitizeLirioAlleluiaSection(enrichment.alleluiaSectionHtml);

    if (!/alleluia-section/i.test(content)) {
      content = content.replace(
        /(<article class="reading gospel-section")/i,
        `${alleluiaSection}\n\n          $1`
      );
    }
  }

  if (enrichment.gospelSubtitle || enrichment.gospelProclamation) {
    const gospelSubtitleHtml = enrichment.gospelSubtitle
      ? `<p class="reading-subtitle">${escapeHtml(enrichment.gospelSubtitle)}</p>`
      : "";

    const gospelReferenceHtml = enrichment.gospelProclamation
      ? `<cite class="reading-reference">${normalizeGospelProclamation(enrichment.gospelProclamation)}</cite>`
      : "";

    content = content.replace(
      /<article class="reading gospel-section">\s*<header>\s*<h3 class="reading-title">[^<]*<\/h3>[\s\S]*?<\/header>/i,
      `<article class="reading gospel-section">
        <header>
          <h3 class="reading-title">Evangelho</h3>
          ${gospelSubtitleHtml}
          ${gospelReferenceHtml}
        </header>`
    );
  }

  return content.trim();
}

function sanitizeLirioAlleluiaSection(sectionHtml: string): string {
  return sectionHtml
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<\/br>/gi, "<br>")
    .trim();
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
      /(<cite[^>]*class="reading-reference"[^>]*>)\s*(?:✠\s*)?Proclamação/gi,
      `$1<span class="gospel-cross" aria-hidden="true">✠</span> Proclamação`
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
