# `src/` 模块说明

## 文件

- `repository-store.js`：工作区和仓库的版本化 JSON 存储。
- `git-utils.js`：Git 输出解析和路径安全检查。

## 规则

- 保持零依赖和 CommonJS。
- 暂时不要把 HTTP 路由移入这里，除非后续明确建立独立模块边界。
- 解析逻辑变化必须在 `tests/git-utils.test.js` 中增加测试。
- 数据结构变化必须更新 `docs/DATA-MODEL.md`，并提供迁移路径。

## 相关文档

- `docs/ARCHITECTURE.md`
- `docs/DATA-MODEL.md`
- `docs/TESTING.md`
