import { describe, expect, it } from "bun:test";
import {
  escapeHtml,
  gfmToTelegramHtml,
} from "../../../../src/usecases/stream/gfm-to-telegram-html.ts";

// ---------------------------------------------------------------------------
// escapeHtml — Phase 1.2
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("escapes & to &amp;", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes < to &lt;", () => {
    expect(escapeHtml("a < b")).toBe("a &lt; b");
  });

  it("escapes > to &gt;", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes all entities in one string", () => {
    expect(escapeHtml("<script>alert('x & y')</script>")).toBe(
      "&lt;script&gt;alert('x &amp; y')&lt;/script&gt;",
    );
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// gfmToTelegramHtml — Phase 2 (core converter)
// ---------------------------------------------------------------------------

describe("gfmToTelegramHtml", () => {
  // Phase 2.1: inline formatting
  describe("bold", () => {
    it("converts **text** to <b>text</b>", () => {
      expect(gfmToTelegramHtml("**bold**")).toContain("<b>bold</b>");
    });
    it("converts __text__ to <b>text</b>", () => {
      expect(gfmToTelegramHtml("__bold__")).toContain("<b>bold</b>");
    });
  });

  describe("italic", () => {
    it("converts *text* to <i>text</i>", () => {
      expect(gfmToTelegramHtml("*italic*")).toContain("<i>italic</i>");
    });
    it("converts _text_ to <i>text</i>", () => {
      expect(gfmToTelegramHtml("_italic_")).toContain("<i>italic</i>");
    });
  });

  describe("strikethrough", () => {
    it("converts ~~text~~ to <s>text</s>", () => {
      expect(gfmToTelegramHtml("~~strike~~")).toContain("<s>strike</s>");
    });
  });

  // Phase 2.2: code
  describe("inline code", () => {
    it("converts `code` to <code>code</code>", () => {
      expect(gfmToTelegramHtml("`code`")).toContain("<code>code</code>");
    });

    it("escapes HTML inside inline code", () => {
      expect(gfmToTelegramHtml("`a < b`")).toContain("<code>a &lt; b</code>");
    });
  });

  describe("fenced code block", () => {
    it("converts fenced block with language to <pre><code class='language-X'>", () => {
      const input = "```js\nconst x = 1;\n```";
      const result = gfmToTelegramHtml(input);
      expect(result).toContain('<pre><code class="language-js">');
      expect(result).toContain("const x = 1;");
    });

    it("escapes HTML inside fenced blocks", () => {
      const input = "```\na < b && c > d\n```";
      const result = gfmToTelegramHtml(input);
      expect(result).toContain("a &lt; b &amp;&amp; c &gt; d");
    });
  });

  // Phase 2.3: headings
  describe("headings", () => {
    it("converts H1 to <b>text</b>", () => {
      expect(gfmToTelegramHtml("# Title")).toContain("<b>Title</b>");
    });
    it("converts H2 to <b>text</b>", () => {
      expect(gfmToTelegramHtml("## Title")).toContain("<b>Title</b>");
    });
    it("converts H3 to <b>text</b>", () => {
      expect(gfmToTelegramHtml("### Title")).toContain("<b>Title</b>");
    });
    it("converts H6 to <b>text</b>", () => {
      expect(gfmToTelegramHtml("###### Title")).toContain("<b>Title</b>");
    });
  });

  // Phase 2.4: links and tables
  describe("links", () => {
    it("converts [text](url) to <a href='url'>text</a>", () => {
      const result = gfmToTelegramHtml("[click here](https://example.com)");
      expect(result).toContain('<a href="https://example.com">click here</a>');
    });
  });

  describe("tables", () => {
    it("wraps a GFM table in <pre>...</pre>", () => {
      const table = "| a | b |\n|---|---|\n| 1 | 2 |";
      const result = gfmToTelegramHtml(table);
      expect(result).toContain("<pre>");
      expect(result).toContain("</pre>");
    });
  });

  // Phase 2.5: lists
  describe("unordered lists", () => {
    it("uses • prefix for unordered list items", () => {
      const result = gfmToTelegramHtml("- item one\n- item two");
      expect(result).toContain("• item one");
      expect(result).toContain("• item two");
    });
  });

  describe("ordered lists", () => {
    it("uses N. prefix for ordered list items", () => {
      const result = gfmToTelegramHtml("1. first\n2. second");
      expect(result).toContain("1. first");
      expect(result).toContain("2. second");
    });
  });

  // HTML entity escaping in plain text
  describe("HTML entity escaping in plain text", () => {
    it("escapes & in plain paragraphs", () => {
      expect(gfmToTelegramHtml("cats & dogs")).toContain("cats &amp; dogs");
    });
    it("escapes < and > in plain paragraphs", () => {
      expect(gfmToTelegramHtml("a < b > c")).toContain("a &lt; b &gt; c");
    });
  });

  // Plain text passthrough
  describe("plain text", () => {
    it("returns plain text (wrapped in paragraph tags, trimmed)", () => {
      const result = gfmToTelegramHtml("hello world").trim();
      expect(result).toBe("hello world");
    });
  });

  // Telegram HTML constraint: code/pre cannot nest inside b/i/s/a.
  describe("code/pre not nested in entities", () => {
    it("bold containing codespan splits the <b> wrapper", () => {
      const result = gfmToTelegramHtml("**The hatch (`override`)**");
      expect(result).not.toMatch(/<b>[^<]*<code>/);
      expect(result).toContain("<code>override</code>");
      expect(result).toContain("<b>The hatch (</b>");
      expect(result).toContain("<b>)</b>");
    });

    it("italic containing codespan splits the <i> wrapper", () => {
      const result = gfmToTelegramHtml("*see `x` now*");
      expect(result).not.toMatch(/<i>[^<]*<code>/);
      expect(result).toContain("<code>x</code>");
    });

    it("strikethrough containing codespan splits the <s> wrapper", () => {
      const result = gfmToTelegramHtml("~~old `api` gone~~");
      expect(result).not.toMatch(/<s>[^<]*<code>/);
      expect(result).toContain("<code>api</code>");
    });

    it("heading containing codespan splits the <b> wrapper", () => {
      const result = gfmToTelegramHtml("# Title with `code`");
      expect(result).not.toMatch(/<b>[^<]*<code>/);
      expect(result).toContain("<code>code</code>");
    });

    it("link containing codespan splits the <a> wrapper", () => {
      const result = gfmToTelegramHtml("[see `fn` docs](https://x.com)");
      expect(result).not.toMatch(/<a [^>]*>[^<]*<code>/);
      expect(result).toContain("<code>fn</code>");
      expect(result).toContain('<a href="https://x.com">see </a>');
    });

    it("regression: bolded heading with inline code emits no nested code", () => {
      const md = "**The escape hatch (`agentBackendOverride`)**";
      const result = gfmToTelegramHtml(md);
      expect(result).not.toMatch(/<b>[^<]*<code>/);
      expect(result).not.toMatch(/<code>[^<]*<\/code>[^<]*<\/b>/);
    });
  });
});
