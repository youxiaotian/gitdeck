"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_DOCS = [
  "README.md",
  "AGENTS.md",
  "docs/README.md",
  "docs/MAP.md",
  "docs/AGENT-GUIDE.md",
  "docs/ARCHITECTURE.md",
  "docs/CODE-MAP.md",
  "docs/FEATURES.md",
  "docs/API.md",
  "docs/DATA-MODEL.md",
  "docs/UI-MAP.md",
  "docs/DEVELOPMENT.md",
  "docs/TESTING.md",
  "docs/SECURITY.md",
  "docs/TROUBLESHOOTING.md",
  "docs/DECISIONS.md",
  "docs/ROADMAP.md",
  "docs/ITERATION-LOG.md",
  "docs/templates/FEATURE-RECORD.md"
];

async function main() {
  const missing = [];
  for (const relativePath of REQUIRED_DOCS) {
    const stat = await fs.stat(path.join(ROOT, relativePath)).catch(() => null);
    if (!stat?.isFile()) {
      missing.push(relativePath);
    }
  }

  const markdownFiles = await collectMarkdownFiles(ROOT);
  const brokenLinks = [];
  for (const filePath of markdownFiles) {
    const content = await fs.readFile(filePath, "utf8");
    for (const link of extractLocalLinks(content)) {
      const target = path.resolve(path.dirname(filePath), link);
      const stat = await fs.stat(target).catch(() => null);
      if (!stat) {
        brokenLinks.push({
          file: path.relative(ROOT, filePath),
          link
        });
      }
    }
  }

  if (missing.length || brokenLinks.length) {
    if (missing.length) {
      console.error("Missing required docs:");
      for (const file of missing) {
        console.error(`- ${file}`);
      }
    }
    if (brokenLinks.length) {
      console.error("Broken local Markdown links:");
      for (const item of brokenLinks) {
        console.error(`- ${item.file}: ${item.link}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Documentation check passed: ${markdownFiles.length} Markdown files, ${REQUIRED_DOCS.length} required documents.`
  );
}

async function collectMarkdownFiles(directory) {
  const result = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === "data" ||
      entry.name === "node_modules"
    ) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      result.push(entryPath);
    }
  }
  return result;
}

function extractLocalLinks(content) {
  const links = [];
  const pattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = pattern.exec(content))) {
    const raw = match[1];
    if (
      /^(?:https?:|mailto:|codex:|data:|#)/i.test(raw) ||
      raw.startsWith("<")
    ) {
      continue;
    }
    const withoutAnchor = raw.split("#")[0];
    if (!withoutAnchor) {
      continue;
    }
    try {
      links.push(decodeURIComponent(withoutAnchor));
    } catch {
      links.push(withoutAnchor);
    }
  }
  return links;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
