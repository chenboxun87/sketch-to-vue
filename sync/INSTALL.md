# design-to-vue 全局安装 / 双端同步

## 单源真理

| 角色 | 路径 |
|------|------|
| **主源（编辑在这里）** | `<skill-root>`（默认 `%USERPROFILE%\.claude\skills\design-to-vue\`） |
| **Claude Code 全局** | 同上（主源即安装目录） |
| **Cursor 全局** | `%USERPROFILE%\.cursor\skills\design-to-vue\` |

可选：设置环境变量 `DESIGN_TO_VUE_SKILL_ROOT` 指向 Git 克隆目录，同步脚本会优先使用该路径。

**安全说明** → 仓库根目录 [`SECURITY.md`](../SECURITY.md)

**方向**：Claude 主源 → Cursor 副本（`sync-to-cursor.ps1`）。若在 Cursor 端改过，先拷回主源或运行 `sync-to-claude.ps1`（Cursor → Claude），再 `sync-to-cursor.ps1` 统一。

**已废弃**：`meaxure-vue-restore` 仅保留迁移 stub，请触发 **design-to-vue**。

## 首次安装 / 全量同步

```powershell
# 1. 确认主源存在
Get-ChildItem ~/.claude\skills\design-to-vue\SKILL.md

# 2. 同步到 Cursor 全局
& ~/.claude\skills\design-to-vue\sync\sync-to-cursor.ps1

# 3. 校验两端一致
& ~/.claude\skills\design-to-vue\sync\verify-sync.ps1

# 4. 脚本依赖（两端 scripts/ 各装一次，首次或 package.json 变更后）
cd ~/.claude\skills\design-to-vue\scripts; npm install
cd ~/.cursor\skills\design-to-vue\scripts; npm install

# 5. 回归（可选）
node ~/.claude\skills\design-to-vue\scripts\test-host-layout-hint.mjs
```

## 日常更新

1. 在 **Claude 主源**修改 skill
2. `sync-to-cursor.ps1`
3. `verify-sync.ps1`
4. 重启 Cursor / 新开 Claude Code 会话以加载最新 skill 描述

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 源目录不存在 |
| 2 | 目标目录创建失败 |
| 3 | 复制失败 |
| 4 | SHA-256 校验失败 |
| 5 | 反向漂移（目标有源没有的新文件） |
