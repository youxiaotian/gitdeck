# 测试说明

运行：

```powershell
node --test
```

## 文件

- `project-files.test.js`：启动脚本换行格式和 `.gitattributes` 约束。
- `git-utils.test.js`：解析和路径工具的独立测试。
- `api.test.js`：本地服务 + 真实临时 Git 仓库 + 裸远端的端到端测试。

## 测试数据规则

- 临时目录创建在项目工作区内。
- 服务端测试使用独立的 `GITDECK_DATA_DIR`。
- 不得修改真实 `data/repositories.json`。
- 测试结束后删除临时仓库和裸远端。
- 依赖真实 Git 行为的功能必须使用真实 Git 命令验证。

浏览器验证和手工验证矩阵见 `docs/TESTING.md`。
