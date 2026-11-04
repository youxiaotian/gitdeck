"use strict";

const path = require("node:path");

function parseStatus(output) {
  const result = {
    branch: "",
    upstream: "",
    ahead: 0,
    behind: 0,
    oid: "",
    detached: false,
    files: [],
    staged: [],
    unstaged: [],
    untracked: [],
    unmerged: [],
    counts: {
      staged: 0,
      unstaged: 0,
      untracked: 0,
      unmerged: 0,
      total: 0
    }
  };

  const records = String(output || "").split("\0");

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      continue;
    }

    if (record.startsWith("# branch.oid ")) {
      result.oid = record.slice(13);
      continue;
    }

    if (record.startsWith("# branch.head ")) {
      const head = record.slice(14);
      result.detached = head === "(detached)";
      result.branch = result.detached ? "detached" : head;
      continue;
    }

    if (record.startsWith("# branch.upstream ")) {
      result.upstream = record.slice(18);
      continue;
    }

    if (record.startsWith("# branch.ab ")) {
      const match = record.match(/\+(\d+) -(\d+)/);
      if (match) {
        result.ahead = Number(match[1]);
        result.behind = Number(match[2]);
      }
      continue;
    }

    if (record.startsWith("? ")) {
      const file = {
        path: record.slice(2),
        originalPath: "",
        indexStatus: "?",
        worktreeStatus: "?",
        kind: "untracked"
      };
      result.files.push(file);
      result.untracked.push(file);
      continue;
    }

    if (record.startsWith("1 ")) {
      const parts = record.split(" ");
      const status = parts[1] || "..";
      const file = createFile(status, parts.slice(8).join(" "), "");
      addChangedFile(result, file);
      continue;
    }

    if (record.startsWith("2 ")) {
      const parts = record.split(" ");
      const status = parts[1] || "..";
      const originalPath = records[index + 1] || "";
      const file = createFile(status, parts.slice(9).join(" "), originalPath);
      addChangedFile(result, file);
      index += 1;
      continue;
    }

    if (record.startsWith("u ")) {
      const parts = record.split(" ");
      const status = parts[1] || "UU";
      const file = {
        path: parts.slice(10).join(" "),
        originalPath: "",
        indexStatus: status[0] || "U",
        worktreeStatus: status[1] || "U",
        kind: "unmerged"
      };
      result.files.push(file);
      result.unmerged.push(file);
    }
  }

  result.counts.staged = result.staged.length;
  result.counts.unstaged = result.unstaged.length;
  result.counts.untracked = result.untracked.length;
  result.counts.unmerged = result.unmerged.length;
  result.counts.total =
    result.staged.length +
    result.unstaged.length +
    result.untracked.length +
    result.unmerged.length;

  return result;
}

function createFile(status, filePath, originalPath) {
  const indexStatus = status[0] || ".";
  const worktreeStatus = status[1] || ".";
  return {
    path: filePath,
    originalPath,
    indexStatus,
    worktreeStatus,
    kind: indexStatus === "?" ? "untracked" : "changed"
  };
}

function addChangedFile(result, file) {
  result.files.push(file);
  if (file.indexStatus !== "." && file.indexStatus !== " ") {
    result.staged.push(file);
  }
  if (file.worktreeStatus !== "." && file.worktreeStatus !== " ") {
    result.unstaged.push(file);
  }
}

function parseRecordList(output, fieldCount) {
  return String(output || "")
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const fields = record.split("\x1f");
      const item = {};
      for (let index = 0; index < fieldCount; index += 1) {
        item[`field${index}`] = fields[index] || "";
      }
      return item;
    });
}

function parseLog(output) {
  return parseRecordList(output, 6).map((item) => ({
    shortHash: item.field0,
    hash: item.field1,
    author: item.field2,
    email: item.field3,
    date: item.field4,
    subject: item.field5
  }));
}

function parseCommitHistory(output) {
  return parseRecordList(output, 7)
    .map((item) => ({
      hash: item.field0,
      parents: String(item.field1 || "")
        .split(" ")
        .filter(Boolean),
      shortHash: item.field2,
      author: item.field3,
      date: item.field4,
      decorations: item.field5,
      subject: item.field6
    }))
    .filter((row) => row.hash);
}

function parseBranches(output) {
  return String(output || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\0");
      return {
        name: fields[0] || "",
        current: fields[1] === "*",
        upstream: fields[2] || "",
        date: fields[3] || "",
        author: fields[4] || ""
      };
    })
    .filter((branch) => branch.name);
}

function parseStashes(output) {
  return parseRecordList(output, 2).map((item) => ({
    ref: item.field0,
    subject: item.field1
  }));
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function normalizeSqlPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/");
}

module.exports = {
  isPathInside,
  normalizeSqlPath,
  parseBranches,
  parseCommitHistory,
  parseLog,
  parseStashes,
  parseStatus
};
