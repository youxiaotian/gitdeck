"use strict";

// @module repository-store
// 工作区/仓库 JSON 存储与版本迁移。version 4：仓库可归属多个工作区
// （workspaceIds 数组），每个工作区有独立顺序（orders 映射）。
// 修改注意：迁移必须幂等；saveState 经串行队列写临时文件后原子替换。

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_VERSION = 4;

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

      const repositories = Array.isArray(data.repositories)
        ? data.repositories
        : [];
      let migrated = data.version !== DATA_VERSION;

      for (const repository of repositories) {
        if (RepositoryStore.normalizeMemberships(workspaces, repository)) {
          migrated = true;
        }
      }
      if (RepositoryStore.normalizeOrder(workspaces, repositories)) {
        migrated = true;
      }

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
        version: DATA_VERSION,
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

  // 把单个仓库的归属规范化为 workspaceIds 数组 + orders 映射，兼容 v2/v3 数据。
  static normalizeMemberships(workspaces, repository) {
    const validIds = workspaces.map((workspace) => workspace.id);
    let changed = false;

    let memberships;
    if (Array.isArray(repository.workspaceIds)) {
      memberships = repository.workspaceIds.filter((id) =>
        validIds.includes(id)
      );
    } else if (
      typeof repository.workspaceId === "string" &&
      validIds.includes(repository.workspaceId)
    ) {
      memberships = [repository.workspaceId];
    } else {
      memberships = [];
    }
    memberships = [...new Set(memberships)];
    if (!memberships.length) {
      memberships = [validIds[0]];
    }

    const legacyWorkspaceId = repository.workspaceId;
    if (
      repository.workspaceIds?.join(",") !== memberships.join(",") ||
      repository.workspaceId !== undefined
    ) {
      changed = true;
    }

    const legacyOrders =
      typeof repository.order === "number" &&
      typeof legacyWorkspaceId === "string" &&
      memberships.includes(legacyWorkspaceId)
        ? { [legacyWorkspaceId]: repository.order }
        : {};

    const rawOrders =
      repository.orders && typeof repository.orders === "object"
        ? repository.orders
        : {};
    const orders = {};
    for (const id of memberships) {
      const value = Number(rawOrders[id] ?? legacyOrders[id]);
      orders[id] = Number.isFinite(value) ? value : 0;
    }

    repository.workspaceIds = memberships;
    repository.orders = orders;
    delete repository.workspaceId;
    delete repository.order;
    return changed;
  }

  // 每个工作区独立紧凑排序：按现有 order 值（缺省排最后）+ 数组位置稳定打散。
  static normalizeOrder(workspaces, repositories) {
    let changed = false;
    for (const workspace of workspaces) {
      const members = [];
      repositories.forEach((repository, index) => {
        if (repository.workspaceIds.includes(workspace.id)) {
          members.push({ repository, index });
        }
      });
      members.sort(
        (left, right) =>
          (left.repository.orders[workspace.id] ?? Number.MAX_SAFE_INTEGER) -
            (right.repository.orders[workspace.id] ?? Number.MAX_SAFE_INTEGER) ||
          left.index - right.index
      );
      members.forEach(({ repository }, index) => {
        if (repository.orders[workspace.id] !== index) {
          repository.orders[workspace.id] = index;
          changed = true;
        }
      });
    }
    return changed;
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
