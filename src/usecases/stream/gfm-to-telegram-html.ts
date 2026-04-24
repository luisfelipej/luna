/**
 * Convert GitHub Flavoured Markdown to Telegram HTML entities.
 *
 * Telegram supports a limited HTML subset:
 *   <b>, <i>, <s>, <code>, <pre>, <a href="...">
 *
 * Uses `marked` with a custom Renderer. All text nodes are HTML-escaped.
 * The Marked instance is created once (module scope) to avoid setup cost.
 */

import { type RendererObject, type Tokens, Marked, type Token } from "marked";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape the three chars that break Telegram HTML entity parsing. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Wrap `inner` in `<tag>...</tag>`, but leave any `<code>...</code>` or
 * `<pre>...</pre>` segments unwrapped. Telegram forbids `code`/`pre` nested
 * inside other entities — nesting triggers "can't parse entities" errors.
 * Empty wrap segments (e.g. leading/trailing) are dropped to avoid `<b></b>`.
 */
export function splitWrap(tag: string, inner: string): string {
  const parts = inner.split(/(<code\b[^>]*>[\s\S]*?<\/code>|<pre\b[^>]*>[\s\S]*?<\/pre>)/);
  return parts
    .map((p) => {
      if (p === "") return "";
      if (p.startsWith("<code") || p.startsWith("<pre")) return p;
      return `<${tag}>${p}</${tag}>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Custom Renderer (Telegram HTML subset)
// ---------------------------------------------------------------------------

function buildMarked(): Marked {
  const m = new Marked();

  // We provide only the methods we override; the rest fall through to Marked's
  // default implementation (which is fine for tokens we don't special-case).
  // All methods receive the full token object per the marked v18 API.

  const renderer: RendererObject<string, string> = {
    // Phase 2.1: Inline emphasis ─────────────────────────────────────────────
    strong(token: Tokens.Strong): string {
      return splitWrap("b", String(this.parser.parseInline(token.tokens)));
    },

    em(token: Tokens.Em): string {
      return splitWrap("i", String(this.parser.parseInline(token.tokens)));
    },

    del(token: Tokens.Del): string {
      return splitWrap("s", String(this.parser.parseInline(token.tokens)));
    },

    // Phase 2.2: Code ─────────────────────────────────────────────────────────
    codespan(token: Tokens.Codespan): string {
      return `<code>${escapeHtml(token.text)}</code>`;
    },

    code(token: Tokens.Code): string {
      const lang = token.lang ? ` class="language-${token.lang}"` : "";
      return `<pre><code${lang}>${escapeHtml(token.text)}</code></pre>\n`;
    },

    // Phase 2.3: Headings ─────────────────────────────────────────────────────
    heading(token: Tokens.Heading): string {
      return `${splitWrap("b", String(this.parser.parseInline(token.tokens)))}\n`;
    },

    // Phase 2.4: Links and tables ─────────────────────────────────────────────
    link(token: Tokens.Link): string {
      const inner = String(this.parser.parseInline(token.tokens));
      const href = escapeHtml(token.href ?? "");
      // Telegram forbids code/pre nested inside <a>. Split inner so code
      // segments escape the anchor wrapper.
      const parts = inner.split(/(<code\b[^>]*>[\s\S]*?<\/code>|<pre\b[^>]*>[\s\S]*?<\/pre>)/);
      return parts
        .map((p) => {
          if (p === "") return "";
          if (p.startsWith("<code") || p.startsWith("<pre")) return p;
          return `<a href="${href}">${p}</a>`;
        })
        .join("");
    },

    table(token: Tokens.Table): string {
      const headerCells = token.header
        .map((cell) => String(this.parser.parseInline(cell.tokens)))
        .join(" | ");

      const separator = token.header
        .map((cell) => {
          if (cell.align === "center") return ":---:";
          if (cell.align === "right") return "---:";
          return "---";
        })
        .join(" | ");

      const bodyRows = token.rows
        .map((row) => row.map((cell) => String(this.parser.parseInline(cell.tokens))).join(" | "))
        .join("\n");

      const rawTable = `${headerCells}\n${separator}\n${bodyRows}`;
      return `<pre>${escapeHtml(rawTable)}</pre>\n`;
    },

    // Phase 2.5: Lists ────────────────────────────────────────────────────────
    list(token: Tokens.List): string {
      const items: string[] = [];
      // `start` can be `""` (falsy) when unordered — treat as 1 for ordered.
      let counter: number = typeof token.start === "number" && token.start > 0 ? token.start : 1;

      for (const item of token.items) {
        // The first token of a list item is usually a "text" token or "paragraph".
        // We render all inline tokens from the item's token list.
        const inner = String(this.parser.parseInline(item.tokens));
        if (token.ordered) {
          items.push(`${counter}. ${inner}`);
          counter++;
        } else {
          items.push(`• ${inner}`);
        }
      }
      return items.join("\n") + "\n";
    },

    listitem(item: Tokens.ListItem): string {
      // list() handles item rendering; this override prevents double-wrapping
      // in case marked calls listitem independently.
      return String(this.parser.parseInline(item.tokens)) + "\n";
    },

    // Strip paragraph <p> tags — Telegram does not support them ───────────────
    paragraph(token: Tokens.Paragraph): string {
      return String(this.parser.parseInline(token.tokens)) + "\n";
    },

    // Unsupported block tokens — degrade gracefully ───────────────────────────
    hr(_token: Tokens.Hr): string {
      return "────────────────────\n";
    },

    blockquote(token: Tokens.Blockquote): string {
      const inner = this.parser.parse(token.tokens as Token[]);
      return inner
        .split("\n")
        .map((line) => (line.length > 0 ? `│ ${line}` : line))
        .join("\n");
    },

    br(_token: Tokens.Br): string {
      return "\n";
    },

    image(token: Tokens.Image): string {
      const alt = escapeHtml(token.text);
      const href = token.href ? escapeHtml(token.href) : "";
      return href ? `<a href="${href}">${alt || "image"}</a>` : alt || "";
    },

    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },

    // Text nodes: escape HTML entities ────────────────────────────────────────
    text(token: Tokens.Text | Tokens.Escape): string {
      if ("tokens" in token && token.tokens != null) {
        return String(this.parser.parseInline(token.tokens));
      }
      if ("escaped" in token && token.escaped === true) {
        return token.text;
      }
      return escapeHtml(token.text);
    },
  };

  m.use({ renderer });
  return m;
}

// Module-scoped instance — created once, thread-safe (Bun is single-threaded).
const markedInstance = buildMarked();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert GFM markdown to Telegram-safe HTML.
 *
 * Handles: bold, italic, strikethrough, inline code, fenced code blocks,
 * headings (H1–H6), links, tables, ordered + unordered lists, plain text.
 * All text nodes are HTML-escaped.
 */
export function gfmToTelegramHtml(text: string): string {
  if (text === "") return "";
  const result = markedInstance.parse(text);
  // parse() returns string (not Promise) in sync mode.
  return (result as string).trimEnd();
}
