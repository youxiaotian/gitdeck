# 工具说明

## `check-docs.js`

检查：

- 必需文档是否存在；
- Markdown 相对链接是否有效。

运行：

```powershell
node tools/check-docs.js
```

新增必需文档时，要同时更新脚本里的 `REQUIRED_DOCS` 和
`docs/README.md` 的文档目录。
