# 字体入库流程（Step 0-E.2 专用）

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

> **核心原则**：只在**指定范围**内查找；范围内没有 → **互联网合法获取**；仍无法获取 → **明确提示用户获取渠道 + 暂用项目内已打包的合适替代字体**（记录在 `_font_map.json` / `_font_acquire.json`）。**禁止**全盘/系统目录盲搜；**禁止**静默回退（不提示、不记录）。

---

## 1. 允许搜索的范围（仅此四处，不得扩大）

| # | 路径 | 说明 |
|---|------|------|
| 1 | `{projectRoot}/src/assets/font/` | 项目全局字体目录 |
| 2 | `{exportDir}/fonts/` 或 `{exportDir}/assets/fonts/` | MeaXure/MasterGo 导出包内字体（若存在） |
| 3 | `{pageOutDir}/fonts/` | 页面私有字体 |
| 4 | `@font-face src:` 已声明路径 | 从 `global.less` / 页面 `fonts.less` 解析 |

**禁止**用 `find`、`Get-ChildItem -Recurse` 扫 `D:\docs`、Windows Fonts、用户桌面。

---

## 2. 三态处理流程

```
needsBundling 字体
    │
    ├─ ① 允许范围内找到文件 → status: bundled
    │      @font-face 用设计稿 canonical 族名；resolveFontFamily 只返回该族名
    │
    ├─ ② 范围内无 → 互联网/npm 合法获取 → 入库 → bundled
    │
    └─ ③ 仍无法获取（商业/Apple 字体等）
           ├─ status: pending_acquire + substituteStack（暂用替代）
           ├─ 写入 _font_acquire.json（acquireVia + userPrompt）
           └─ **必须向用户输出获取提示**（见 §5），不得静默凑合
```

---

## 3. 暂用替代字体选取原则

替代字体**必须**来自项目 `src/assets/font/` 或 `global.less` 已 `@font-face` 的字体——**禁止**为找替代再去搜系统目录。

| 设计字体 | 推荐暂用（项目内已有） | 差异说明 |
|----------|------------------------|----------|
| **DIN Alternate** | `'D-DIN-PRO', 'Arial Narrow', sans-serif` | 数字略宽，KPI 可能压单位——入库真字体后替换 |
| **Yuanti SC** | `'SourceHanSansCN', sans-serif` + `font-weight: 700` | 圆体→黑体，标题气质不同 |
| **PingFang SC** | `'SourceHanSansCN', sans-serif` | 字形接近，Windows 上可接受过渡 |
| **YouSheBiaoTiHei** | `'YouSheBiaoTiHei'` 或 npm 获取 | 通常可 npm 直接 bundled |

**Implement 层**：`status === 'bundled'` → 单族名；`status === 'pending_acquire'` → 读 `substituteStack`。

---

## 4. `_font_map.json` 结构

```json
{
  "cssAliasToFamily": {
    "DINAlternate-Bold": "DIN Alternate",
    "PingFangSC-Regular": "PingFang SC"
  },
  "families": {
    "DIN Alternate": {
      "file": null,
      "status": "pending_acquire",
      "substituteStack": "'D-DIN-PRO', 'Arial Narrow', sans-serif",
      "defaultWeight": 700,
      "acquireVia": "设计师提供或 Linotype 采购 DINAlternate-Bold"
    },
    "YouSheBiaoTiHei": {
      "file": "src/assets/font/YouSheBiaoTiHei-2.ttf",
      "status": "bundled"
    }
  }
}
```

```javascript
function resolveFontFamily(family, cssRules) {
  const canonical = /* cssAliasToFamily 或 family */
  const entry = fontMap.families[canonical]
  if (entry?.status === 'bundled') return `'${canonical}'`
  if (entry?.substituteStack) return entry.substituteStack
  return `'${canonical}'`  // 最后才裸族名（可能缺字）
}
```

---

## 5. 向用户提示（Agent 必须输出）

运行 `audit-project-fonts.mjs` 或完成 Step 0-E.2 后，对 `pending_acquire` 项**在对话中明确告知用户**：

**模板**：

```markdown
### 待入库字体（页面已暂用替代字体）

| 设计字体 | 当前暂用 | 请获取 |
|----------|----------|--------|
| DIN Alternate | D-DIN-PRO | 设计师提供 `.ttf` 或 Linotype 采购 DINAlternate-Bold |
| Yuanti SC | SourceHanSansCN Bold | 设计师提供 STYuanti-SC-Bold |

入库后：文件放入 `src/assets/font/`，补 `@font-face`，将 `_font_map.json` 对应项改为 `status: "bundled"`，移除 `substituteStack`。
```

`_font_acquire.json` 每项含 `userPrompt` 字段（脚本自动生成），Agent 可直接引用或表格化展示。

---

## 6. `_font_acquire.json`

```json
{
  "items": [
    {
      "family": "DIN Alternate",
      "status": "pending_acquire",
      "substituteStack": "'D-DIN-PRO', 'Arial Narrow', sans-serif",
      "acquireVia": "设计师提供 / Linotype 采购",
      "userPrompt": "【DIN Alternate】尚未入库，页面暂用 D-DIN-PRO。请设计师提供 DINAlternate-Bold.ttf 或采购 Linotype 授权。"
    }
  ],
  "summaryForUser": "2 个字体待入库，已启用暂用替代，见上表。"
}
```

---

## 7. 互联网获取参考

| 设计字体 | 渠道 | 授权 |
|----------|------|------|
| YouSheBiaoTiHei | npm `@zf-web-font/youshebiaotihei` | 免费商用 |
| PingFang SC | npm `font-pingfang`（核实 license） | 需核实 |
| DIN Alternate | Linotype / 设计师导出 | 商业 |
| Yuanti SC | 设计师提供 | Apple，需授权 |

---

## 8. 审计脚本

```bash
node scripts/audit-project-fonts.mjs \
  --projectRoot /path/to/your-web \
  --exportDir "<design-export>" \
  --pageOutDir src/pages/sampleCockpit/data
```

- 退出码 `2` = 有 `pending_acquire`（**允许继续开发**，但必须已配置 `substituteStack` 并向用户提示）
- 退出码 `0` = 全部 `bundled`

---

## 9. 浏览器验证

**最终交付**（全部 bundled）：`document.fonts.check('40px "DIN Alternate"')` 等 canonical 名全部为 `true`。

**过渡阶段**（有 pending_acquire）：验证 `substituteStack` 首字体可加载；`_font_acquire.json` 已生成且用户已收到 §5 提示。
