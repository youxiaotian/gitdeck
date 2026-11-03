# 数据模型

## 持久化文件

GitDeck 的工作区和仓库元数据保存在：

```text
data/repositories.json
```

可通过 `GITDECK_DATA_DIR` 修改保存目录。

### 版本 2 结构

```json
{
  "version": 2,
  "workspaces": [
    {
      "id": "workspace-default",
      "name": "默认工作区",
      "createdAt": "2026-10-27T02:26:30.454Z"
    },
    {
      "id": "ws_99faf5452a3f",
      "name": "多平台",
      "createdAt": "2026-10-27T02:26:43.555Z"
    }
  ],
  "repositories": [
    {
      "id": "368a329adeae",
      "name": "AgisoCodes",
      "path": "C:\\Repository\\AgisoProjects\\AgisoCodes",
      "workspaceId": "ws_99faf5452a3f",
      "addedAt": "2026-10-26T07:51:09.563Z"
    }
  ]
}
```

## 数据不变量

- 至少存在一个工作区。
- 工作区名称不区分大小写且不能重复。
- 每个仓库必须有一个 `workspaceId`。
- 同一个仓库在顶层列表中只能出现一次。
- 同一工作区的仓库显示顺序由顶层 `repositories` 数组中的相对顺序保存。
- 仓库 ID 是规范化绝对路径的小写 SHA-1，截取 12 位十六进制。
- 工作区 ID 通常是 `ws_` 加 12 位随机十六进制；迁移默认工作区固定为 `workspace-default`。
- 从工作区移除仓库不能删除磁盘目录。
- 删除工作区时只移动仓库，不能批量删除仓库元数据。

## 版本 1 迁移

旧版数据结构：

```json
{
  "version": 1,
  "repositories": [
    { "id": "...", "name": "...", "path": "...", "addedAt": "..." }
  ]
}
```

`RepositoryStore.loadState()` 会：

1. 创建或读取默认工作区。
2. 把没有有效 `workspaceId` 的仓库放入第一个工作区。
3. 把文件重写为版本 2。

迁移可重复执行，不会重复产生默认工作区。

## 写入串行化

`RepositoryStore.saveState()` 使用：

- 进程内 Promise 队列；
- 临时文件写入；
- 原子重命名覆盖 `repositories.json`。

不要绕开该队列并发写数据文件。

仓库排序接口只替换该工作区对应的数组槽位，不打乱其他工作区记录。

## 单仓库动作锁

`acquireRepositoryLock(repositoryId)` 会串行化同一仓库的修改操作，不同仓库可以并行。

必须保持串行的例子：

- 暂存后提交；
- 分支切换；
- 分支删除；
- 拉取、推送、抓取；
- Stash 恢复；
- 批量还原。

## 浏览器本地状态

以下偏好只保存在 `localStorage`：

| 键 | 含义 |
| --- | --- |
| `gitdeck.activeWorkspace` | 上次选择的工作区 ID |
| `gitdeck.layout.sidebar` | 仓库侧栏宽度 |
| `gitdeck.layout.filetree` | 变更目录树宽度 |
| `gitdeck.layout.context` | 分支与上下文面板宽度 |
| `gitdeck.fileTreeMode` | 变更文件树形/平铺视图 |

这些偏好不属于服务端数据文件，可以通过清理站点存储或双击分隔条重置。

## Git 自己维护的状态

以下内容不会写入 `repositories.json`：

- 暂存文件；
- 分支和作者；
- 提交；
- Stash；
- 远端和凭据；
- Diff 和编辑器内容；
- 分支或文件勾选状态。

它们都按需从 Git 读取。

## 敏感信息

仓库路径可能包含本机用户名或项目名称。不要把 `data/repositories.json` 上传到远程服务。GitDeck 当前没有云同步。
