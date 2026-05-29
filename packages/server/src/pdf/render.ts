/**
 * Markdown → PDF renderer (Workers-compatible, pure-JS via pdf-lib).
 *
 * TRADEOFF: we deliberately avoid the Browser Rendering binding (a headless
 * Chromium) for v1 — it is slower, costs more, and needs an extra binding. A
 * pure-JS layout with pdf-lib has NO browser dependency and runs inline in the
 * Worker. The cost is limited markdown support: we handle headings (#..######),
 * paragraphs, unordered/ordered lists, bold (**…**)/italics (*…*) inline, blank
 * lines, and `---` rules. Tables/images/links render as their source text. That
 * is sufficient for clinical documents (notes, aftercare, certificates,
 * referrals). If rich layout is later required, swap this module for a Browser
 * Rendering implementation behind the same `renderMarkdownToPdf` signature.
 *
 * Every clinical PDF gets a prominent DRAFT banner + disclaimer footer.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { DraftType } from "@drkyana/types";

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

const DISCLAIMER =
  "AI-assisted DRAFT — reviewed and approved by Dr Kyana before use. Not a diagnosis.";

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
  drawHeaderFooter(ctx);
}

function drawHeaderFooter(ctx: Ctx): void {
  // Footer disclaimer on every page.
  ctx.page.drawText(DISCLAIMER, {
    x: MARGIN,
    y: MARGIN / 2,
    size: 7,
    font: ctx.italic,
    color: rgb(0.45, 0.45, 0.45),
  });
}

/** Greedy word-wrap a string to the content width at a given size/font. */
function wrap(text: string, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > CONTENT_W && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Strip inline markdown markers for measurement/plain rendering. */
function stripInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<!\*)\*(?!\*)(.+?)\*/g, "$1");
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 16) newPage(ctx);
}

function drawLine(ctx: Ctx, text: string, size: number, font: PDFFont, indent = 0): void {
  const lines = wrap(text, font, size);
  for (const ln of lines) {
    ensureSpace(ctx, size + 4);
    ctx.page.drawText(ln, {
      x: MARGIN + indent,
      y: ctx.y,
      size,
      font,
      color: rgb(0.06, 0.09, 0.16),
    });
    ctx.y -= size + 4;
  }
}

const HEADING_SIZES = [20, 16, 14, 12, 11, 10];

export interface RenderedPdf {
  bytes: Uint8Array;
  contentType: "application/pdf";
}

/** Render markdown to a PDF byte buffer. `docType` only labels the title banner. */
export async function renderMarkdownToPdf(
  markdown: string,
  docType: DraftType | string,
): Promise<RenderedPdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const ctx: Ctx = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    font,
    bold,
    italic,
  };
  drawHeaderFooter(ctx);

  // DRAFT banner.
  ctx.page.drawText(`DRAFT · ${String(docType).toUpperCase()}`, {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: bold,
    color: rgb(0.72, 0.11, 0.11),
  });
  ctx.y -= 22;

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let orderedIndex = 0;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line.trim() === "") {
      ctx.y -= 6;
      orderedIndex = 0;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      ensureSpace(ctx, 10);
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y },
        end: { x: PAGE_W - MARGIN, y: ctx.y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      ctx.y -= 12;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const size = HEADING_SIZES[level - 1] ?? 10;
      ctx.y -= 4;
      drawLine(ctx, stripInline(heading[2]), size, bold);
      ctx.y -= 2;
      orderedIndex = 0;
      continue;
    }

    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      drawLine(ctx, `•  ${stripInline(ul[1])}`, 10, font, 10);
      continue;
    }

    const ol = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      orderedIndex += 1;
      drawLine(ctx, `${orderedIndex}.  ${stripInline(ol[2])}`, 10, font, 10);
      continue;
    }

    // Fully-italic line (often the disclaimer) → italic font.
    const fullItalic = /^\*(.+)\*$/.exec(line.trim());
    if (fullItalic && !line.trim().startsWith("**")) {
      drawLine(ctx, fullItalic[1], 9, italic);
      continue;
    }

    // Paragraph: bold the whole line if it's wrapped in **…**, else plain.
    const fullBold = /^\*\*(.+)\*\*$/.exec(line.trim());
    if (fullBold) {
      drawLine(ctx, fullBold[1], 10, bold);
    } else {
      drawLine(ctx, stripInline(line), 10, font);
    }
    orderedIndex = 0;
  }

  const bytes = await doc.save();
  return { bytes, contentType: "application/pdf" };
}
