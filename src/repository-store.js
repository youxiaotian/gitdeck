"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

class RepositoryStore {
  constructor(dataDirectory) {
    this.dataDirectory = dataDirectory;
    this.storePath = path.join(dataDirectory, "repositories.json");
    this.writeQueue = Promise.resolve();
  }

  async loadState() {
    const defaultWorkspace = RepositoryStore.defaultWorkspace();
    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      const data = JSON.parse(raw);
      const workspaces = Array.isArray(data.workspaces)
        ? data.workspaces.filter(
            (workspace) =>
              workspace &&
              typeof workspace.id === "string" &&
              typeof workspace.name === "string"
          )
        : [];
      if (!workspaces.length) {
        workspaces.push(defaultWorkspace);
      }

      const workspaceIds = new Set(
        workspaces.map((workspace) => workspace.id)
      );
      const repositories = Array.isArray(data.repositories)
        ? data.repositories
        : [];
      let migrated = data.version !== 3 || !Array.isArray(data.workspaces);
      for (const repository of repositories) {
        if (!workspaceIds.has(repository.workspaceId)) {
          repository.workspaceId = workspaces[0].id;
          migrated = true;
        }
      }

      if (RepositoryStore.normalizeOrder(workspaces, repositories)) {
        migrated = true;
      }
      RepositoryStore.sortRepositories(workspaces, repositories);

      const state = { workspaces, repositories };
      if (migrated) {
        await this.saveState(state);
      }
      return state;
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          workspaces: [defaultWorkspace],
          repositories: []
        };
      }
      throw error;
    }
  }

  async saveState({ workspaces, repositories }) {
    await fs.mkdir(this.dataDirectory, { recursive: true });
    const snapshot = JSON.stringify(
      {
        version: 3,
        workspaces,
        repositories
      },
      null,
      2
    );
    const temporaryPath = `${this.storePath}.tmp`;

    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.writeFile(temporaryPath, snapshot, "utf8");
        await fs.rename(temporaryPath, this.storePath);
      });

    return this.writeQueue;
  }

  static normalizeOrder(workspaces, repositories) {
    let changed = false;
    for (const workspace of workspaces) {
      const wsRepos = repositories.filter(
        (repository) => repository.workspaceId === workspace.id
      );
      const hasOrder = wsRepos.some(
        (repository) =>
          typeof repository.order === "number" &&
          Number.isFinite(repository.order)
      );
      if (hasOrder) {
        wsRepos.sort(
          (left, right) => (left.order || 0) - (right.order || 0)
        );
      }
      wsRepos.forEach((repository, index) => {
        if (repository.order !== index) {
          repository.order = index;
          changed = true;
        }
      });
    }
    return changed;
  }

  static sortRepositories(workspaces, repositories) {
    const workspaceIndex = new Map(
      workspaces.map((workspace, index) => [workspace.id, index])
    );
    repositories.sort((left, right) => {
      const leftWorkspace = workspaceIndex.get(left.workspaceId) ?? 0;
      const rightWorkspace = workspaceIndex.get(right.workspaceId) ?? 0;
      if (leftWorkspace !== rightWorkspace) {
        return leftWorkspace - rightWorkspace;
      }
      return (left.order || 0) - (right.order || 0);
    });
  }

  static repositoryId(repositoryPath) {
    return crypto
      .createHash("sha1")
      .update(path.resolve(repositoryPath).toLowerCase())
      .digest("hex")
      .slice(0, 12);
  }

  static workspaceId() {
    return `ws_${crypto.randomBytes(6).toString("hex")}`;
  }

  static defaultWorkspace() {
    return {
      id: "workspace-default",
      name: "默认工作区",
      createdAt: new Date().toISOString()
    };
  }
}

module.exports = RepositoryStore;
