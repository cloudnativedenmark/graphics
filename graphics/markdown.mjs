/**
 * Markdown to HTML for the printed documents (build-documents.mjs), with no
 * dependencies: the repo needs only Node and Chrome.
 *
 * Covers what a guide or handout uses: headings (with ids, so `[x](#id)`
 * links work inside the PDF), paragraphs, nested ordered/unordered/task
 * lists, tables, blockquotes and GitHub alerts (`> [!TIP] Title`), rules,
 * raw HTML blocks, and inline code, links, bold and *italic*. `_` is not
 * emphasis, so it can't eat underscores in URLs and email addresses.
 *
 * Every `TODO` in text renders highlighted, so a draft can't pass for final.
 */

const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** `---` delimited `key: value` lines at the top of the file. */
export function frontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*?)\s*$/);
    if (kv) data[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return { data, body: src.slice(m[0].length) };
}

export function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`);
  s = s.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+)&gt;/g, (_, href) => `<a href="${href}">${href.replace(/^mailto:/, "")}</a>`);
  s = s.replace(/\*\*(?!\s)(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(?![\s*])(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/(<[^>]*>)|\bTODO\b/g, (m, tag) => tag ?? `<mark class="todo">TODO</mark>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

const HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])( *\1){2,} *$/;
const QUOTE = /^ *>/;
const ITEM = /^( *)([-*+]|\d+[.)]) +(.*)$/;
const HTML = /^ *<\/?[a-z][^>]*>/i;
const SEP = /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;

const indentOf = (l) => l.match(/^ */)[0].length;
const isTable = (lines, i) => lines[i].includes("|") && i + 1 < lines.length && SEP.test(lines[i + 1]);
const startsBlock = (lines, i) =>
  [HEADING, RULE, QUOTE, ITEM, HTML].some((re) => re.test(lines[i])) || isTable(lines, i);

const cells = (l) =>
  l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

/** Paragraph lines join with a space; a line ending in two spaces or `\` breaks. */
const joinLines = (ls) =>
  ls.map((l, k) => inline(l.trim()) + (k < ls.length - 1 ? (/( {2}|\\)$/.test(l) ? "<br>" : " ") : ""))
    .join("")
    .replace(/\\<br>/g, "<br>");

export function markdown(src) {
  const ids = new Map();
  const slug = (html) => {
    const base = html.replace(/<[^>]+>/g, "").toLowerCase().normalize("NFKD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
    const n = (ids.get(base) ?? 0) + 1;
    ids.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  return blocks(src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"), slug).join("\n");
}

function blocks(lines, slug) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) {
      i++;
    } else if ((m = line.match(HEADING))) {
      const n = m[1].length;
      const text = inline(m[2]);
      out.push(`<h${n} id="${slug(text)}">${text}</h${n}>`);
      i++;
    } else if (RULE.test(line)) {
      out.push("<hr>");
      i++;
    } else if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) inner.push(lines[i++].replace(/^ *> ?/, ""));
      const alert = inner[0].match(/^\[!(\w+)\]\s*(.*)$/);
      if (alert) {
        inner.shift();
        const kind = alert[1].toLowerCase();
        const label = alert[2] || kind[0].toUpperCase() + kind.slice(1);
        out.push(
          `<aside class="callout callout-${kind}"><p class="callout-label">${inline(label)}</p>` +
            `${blocks(inner, slug).join("\n")}</aside>`,
        );
      } else {
        out.push(`<blockquote>${blocks(inner, slug).join("\n")}</blockquote>`);
      }
    } else if (isTable(lines, i)) {
      const head = cells(lines[i]);
      const align = cells(lines[i + 1]).map((c) =>
        c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "",
      );
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`;
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${head.map((_, k) => td("td", r[k] ?? "", k)).join("")}</tr>`).join("") +
          `</tbody></table>`,
      );
    } else if (ITEM.test(line)) {
      const [html, next] = list(lines, i, slug);
      out.push(html);
      i = next;
    } else if (HTML.test(line)) {
      const raw = [];
      while (i < lines.length && lines[i].trim()) raw.push(lines[i++]);
      out.push(raw.join("\n"));
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++]);
      out.push(`<p>${joinLines(para)}</p>`);
    }
  }
  return out;
}

function list(lines, i, slug) {
  const [, indent, marker] = lines[i].match(ITEM);
  const base = indent.length;
  const ordered = /\d/.test(marker);
  const items = [];
  let loose = false;
  while (i < lines.length) {
    const m = lines[i].match(ITEM);
    if (m && m[1].length === base) {
      if (/\d/.test(m[2]) !== ordered) break;
      items.push([m[3]]);
      i++;
    } else if (!lines[i].trim()) {
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      const n = lines[j];
      const sameList = n !== undefined && (indentOf(n) > base || (ITEM.test(n) && n.match(ITEM)[1].length === base));
      if (!sameList) break;
      if (indentOf(n) <= base) loose = true;
      items.at(-1).push("");
      i = j;
    } else if (indentOf(lines[i]) > base || !startsBlock(lines, i)) {
      items.at(-1).push(lines[i++]);
    } else {
      break;
    }
  }

  const start = ordered ? parseInt(marker, 10) : 1;
  const tag = ordered ? "ol" : "ul";
  const lis = items.map(([first, ...rest]) => {
    const pad = Math.min(...rest.filter((l) => l.trim()).map(indentOf));
    const body = [first, ...rest.map((l) => l.slice(Number.isFinite(pad) ? pad : 0))];
    const task = !ordered && first.match(/^\[([ xX])\]\s+/);
    if (task) body[0] = first.slice(task[0].length);
    let html = blocks(body, slug).join("\n");
    if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
    const cls = task ? ` class="task${task[1] === " " ? "" : " done"}"` : "";
    return `<li${cls}>${html}</li>`;
  });
  const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
  return [`<${tag}${startAttr}${loose ? ' class="loose"' : ""}>${lis.join("")}</${tag}>`, i];
}
