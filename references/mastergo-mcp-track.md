# C 轨道：MasterGo MCP API → Vue 完整流程

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：xdt-mastergo-to-frontend（完整保留 + 扩展）

**环境变量要求：**
```bash
export MASTERGO_TOKEN="mg_your_token_here"
# 安全校验（不暴露值）：
test -n "$MASTERGO_TOKEN" && echo "Token set" || echo "Token NOT set"
```
Token 获取：MasterGo 设置 → 安全设置 → Personal Access Token  
账号要求：团队版或以上；文件必须在团队项目中（不能是草稿箱）

---

## 输入识别

| 输入形式 | 说明 |
|---------|------|
| `shortLink`（`https://mastergo.com/goto/xxx`） | 优先 |
| `fileId + layerId` | 精确定位 |
| `contentId + documentId` | 导出资源时用 |

**信息不足时先补齐参数，不要猜 fileId/layerId/contentId。**

---

## 工作流

### 第 1 步：确认任务类型

先判断属于哪一类：
- 页面级实现（新建/修改已有页面）
- 组件级实现（抽取可复用组件）
- 仅分析设计稿（不立即改代码）
- 代码回写设计稿（C2D）

### 第 2 步：读取设计信息

```bash
# 分析结构（几乎所有任务都从这里开始）
python scripts/mastergo_analyze.py "https://mastergo.com/goto/xxx"
# 输出：树状结构、文本内容、组件文档链接、导航目标

# 获取完整 DSL（需要详细样式/布局数据时）
python scripts/mastergo_get_dsl.py  "https://mastergo.com/goto/xxx" > dsl.json

# 如果 componentDocumentLinks 非空，获取组件文档
python scripts/mastergo_get_dsl.py URL | python scripts/mastergo_fetch_docs.py --from-dsl
# 或单独获取
python scripts/mastergo_fetch_docs.py "https://example.com/button.mdx"
```

分析结果至少提取：
- 页面主结构和分区
- 组件层级和复用边界
- 文案/状态/交互元素
- 颜色/间距/字号/圆角/阴影等视觉 token
- 是否存在 `componentDocumentLinks`

### 第 3 步：确认实现边界（动手前必做）

**三级改动分类：**

| 级别 | 范围 | 操作 |
|------|------|------|
| 可优先修改 | 当前页面文件、当前页面私有子组件、纯展示型业务组件 | 自由修改 |
| 谨慎修改 | 跨页面共享但与本任务强相关的业务组件 | 先说明影响再修改 |
| 默认禁止修改 | 底层基础组件、压缩产物、第三方图表库封装、自动生成物 | 须用户明确授权 |

若某个视觉需求依赖底层组件改造而用户未授权：**先说明限制并给出替代方案，不要直接下探修改。**

### 第 4 步：决定实现策略

**不要照搬 DSL 节点树**。先把设计结构转换为工程结构。

| 视觉区块类型 | 推荐实现方式 |
|------------|------------|
| 规则性布局、卡片、表单、列表、标签、弹层、导航、筛选区 | 结构化实现（写 HTML/CSS） |
| 复杂装饰背景、氛围图、艺术字标题、难以稳定复现的复合图形 | 资源化处理（导出为图片） |
| 强设计感视觉组合层 | 资源化处理（除非用户明确要结构化） |

**组件化原则：**
- 相同结构重复 ≥2 次 → 优先组件化
- 纯装饰性资源 → 走现有图标/token，不滥存图片
- 交互含义不清 → 先标注假设或询问用户

### 第 5 步：状态覆盖分析（编码前必做）

设计稿通常只覆盖"正常态"。实现时必须识别并补齐缺口：

| 缺失状态 | 补齐原则 |
|---------|---------|
| 空态 | 与主视觉保持一致风格，不回退到旧页面样式 |
| 加载态 | 骨架屏或 spinner，与主色调一致 |
| 错误态 | 提示文字/图标，不使用浏览器默认 error 样式 |
| 弹窗/选择态 | 遮罩 + 模态框，与现有 Modal 风格一致 |
| 禁用态 | 降低透明度 + 禁用指针，与设计语言一致 |
| 无权限态 | 锁定提示，不展示未授权内容 |

若补齐状态不是设计稿直接给出的，在最终说明中标注"按设计语言补齐"。

### 第 6 步：（按需）导出资源 D2C

仅在以下情况调用 `getD2c`：
- 需要提取 SVG/位图资源
- 需要参考 D2C 代码结构
- 用户明确要求"先导出"

```bash
# 通过 MCP getD2c（需要 contentId + documentId）
# 将其视为参考素材，不默认视为最终工程代码
# 对明显冗余/绝对定位过多/不可维护的样式进行重构
```

### 第 7 步：在目标项目中实现

**用户指定了目标项目时（重要）：**
- 先在该项目内搜索并复用已有业务组件/布局/表单封装
- 对齐该项目已采用的 UI 库主题/全局样式/Less-CSS 变量
- 遵循该项目的目录结构/命名习惯/状态管理模式
- 若存在 `CLAUDE.md` / `AGENTS.md`，实现前应征用其中的约束

**实现顺序（页面级）：**
1. 提取页面骨架
2. 确定顶部区/内容区/操作区/列表区/弹层区
3. 标记可复用模块
4. 先搭静态结构
5. 再补交互和数据接入

**实现顺序（组件级）：**
1. 明确组件边界和输入输出
2. 提炼 props/slots/events
3. 实现基础态
4. 补充变体和状态
5. 再考虑组合到页面中

### 第 8 步：自检

- 视觉结构是否与设计稿一致
- 是否遗漏空态/禁用态/加载态/错误态
- 是否有过度绝对定位或硬编码尺寸
- 是否抽出了合适粒度的组件
- 是否复用了已有样式和公共能力

### 第 9 步：（按用户要求）代码回写 C2D

**仅在用户明确要求"同步回设计稿"时才执行。**

```
调用前确认：
- data 是完整 HTML 字符串
- layerId 只来自 URL 的 layer_id
- 不要把 pageid 或 page_id 当作 layerId
- 若短链里没有 layer_id，则不传 layerId
```

---

## DSL 关键字段 → CSS / 工程映射速查

从 `dsl.json` 读取节点属性并映射到 CSS：

| DSL 字段 | 含义 | CSS 映射 |
|---------|------|---------|
| `layout.autoLayout.direction = "ROW"` | Flex 行排列 | `display:flex; flex-direction:row` |
| `layout.autoLayout.direction = "COLUMN"` | Flex 列排列 | `display:flex; flex-direction:column` |
| `layout.autoLayout.itemSpacing` | 子元素间距 | `gap: {N}px` |
| `layout.autoLayout.paddingLeft/Right/Top/Bottom` | 内边距 | `padding: ...` |
| `layout.relatedLayout.type = "ABSOLUTE"` | 绝对定位 | `position:absolute; left:{x}px; top:{y}px` |
| `layout.size.width / height` | 固定尺寸 | `width:{W}px; height:{H}px` |
| `layout.constraintHorizontal = "STRETCH"` | 水平填满父容器 | `width:100%` / flex: 1 |
| `layout.constraintVertical = "STRETCH"` | 垂直填满父容器 | `height:100%` / flex: 1 |
| `style.fills[].fillType = "SOLID"` | 纯色背景 | `background-color: rgba(r,g,b,a)` |
| `style.fills[].fillType = "GRADIENT_LINEAR"` | 线性渐变 | `background: linear-gradient(...)` |
| `style.strokes[].color` | 边框色 | `border: Npx solid rgba(...)` |
| `style.effects[].type = "DROP_SHADOW"` | 投影 | `box-shadow: x y blur spread rgba(...)` |
| `style.effects[].type = "INNER_SHADOW"` | 内阴影 | `box-shadow: inset ...` |
| `style.cornerRadius` | 圆角 | `border-radius: {N}px` |
| `style.opacity` | 透明度 | `opacity: 0.xx` |
| `text.fontFamily` | 字体 | `font-family: "..."` |
| `text.fontSize` | 字号 | `font-size: {N}px` |
| `text.fontWeight` | 字重 | `font-weight: {N}` |
| `text.textAlignHorizontal` | 水平对齐 | `text-align: left/center/right` |
| `text.lineHeight.value` | 行高 | `line-height: {N}px` |
| `text.letterSpacing.value` | 字间距 | `letter-spacing: {N}px` |
| `layout.autoLayout.layoutWrap = "WRAP"` | Flex 换行 | `flex-wrap: wrap` |
| `layout.autoLayout.mainAxisAlignItems = "CENTER"` | 主轴居中 | `justify-content: center` |
| `layout.autoLayout.crossAxisAlignItems = "CENTER"` | 交叉轴居中 | `align-items: center` |
| `layout.relatedLayout.flexGrow = 1` | Flex 子项填充 | `flex-grow: 1` |
| `componentInfo.componentSetDocumentLink` | 组件文档 | 调用 `mastergo_fetch_docs.py` 获取 API |

**Node Type → HTML 标签速查**：

| DSL NodeType | 默认 HTML 标签 | 说明 |
|-------------|--------------|------|
| `FRAME` | `<div>` | 容器/布局节点 |
| `TEXT` | `<span>` / `<p>` | 单行用 span，段落用 p |
| `RECTANGLE` | `<div>` | 矩形背景/装饰 |
| `IMAGE` | `<img>` | 图片资源 |
| `INSTANCE` | 对应组件文档中的组件 | 查 componentDocumentLinks |
| `Input` | UI 库 Input 组件 | 对应 `ls-input` / `el-input` |
| `Select` | UI 库 Select 组件 | 对应 `ls-select` / `el-select` |
| `Chart` | ECharts / 图表组件 | 用 `ChartBox.vue` 或 `Echarts.vue` |
| `TABLE` | UI 库 Table 组件 | 对应 `ls-table` / `el-table` |

**Token 字段 → CSS 变量**：DSL 中 `tokenId` 或 `tokenValue` 标注的属性代表设计 Token，建议转为 `:root` CSS 变量而非硬编码：
```css
/* 按 DSL token 命名或语义命名 */
:root {
  --color-primary: #1677ff;
  --color-bg-card: rgba(8, 22, 56, 0.78);
  --spacing-gap-m: 12px;
}
```

---

## 多页面工作流

当设计文件包含多个页面/画板，且需要在工程中实现完整站点跳转时：

### 第 1 步：提取 navigation targets

```bash
python scripts/mastergo_analyze.py "https://mastergo.com/goto/xxx" > analyze.txt
# 查找 navigationTargets 字段：
grep -i "navigation" analyze.txt
```

DSL 中的交互链接格式（正确字段名）：
```json
{
  "interactive": [{
    "type": "navigation",
    "targetLayerId": "0:3"
  }]
}
```

提取所有导航目标（含循环检测）：
```python
def extract_navigations(dsl):
    """提取 DSL 中所有导航目标，visited 集合防止循环。"""
    navs = []
    visited = set()

    def traverse(node):
        if not node:
            return
        node_id = node.get('id')
        if node_id in visited:
            return
        visited.add(node_id)

        for action in node.get('interactive', []):
            if action.get('type') == 'navigation':
                navs.append({
                    'sourceId': node_id,
                    'sourceName': node.get('name'),
                    'targetLayerId': action.get('targetLayerId')
                })
        for child in node.get('children', []):
            traverse(child)

    dsl_root = dsl.get('dsl', dsl)
    for node in dsl_root.get('nodes', []):
        traverse(node)
    if dsl_root.get('root'):
        traverse(dsl_root['root'])

    return navs
```

### 第 2 步：绘制页面图

将所有 `targetLayerId` 与页面/帧 ID 对应，建立跳转关系表：

```
页面 A（首页）
├── 按钮"进入详情" → 页面 B（详情页）
├── 导航"数据概览" → 页面 C（大屏）
└── 底部"关于" → 页面 D（说明页）
```

### 第 3 步：映射到 Vue Router

```javascript
// router/index.js
const routes = [
  { path: '/', component: () => import('@/pages/Home.vue') },
  { path: '/detail', component: () => import('@/pages/Detail.vue') },
  { path: '/dashboard', component: () => import('@/pages/Dashboard.vue') },
  { path: '/about', component: () => import('@/pages/About.vue') },
]
```

**重要原则**：
- 若项目已有 `routerInfo.js` 且含手工配置的嵌套路由，**不要运行 `npm run router` 覆盖**
- `targetLayerId` 对应帧（Frame）时，先判断该帧是"完整页面"还是"组件状态"——状态变化用响应式数据驱动，不是新路由
- 交互含义不明时先标注假设，不要替用户拍板导航结构

---

## MCP 工具决策树

```
只有短链
└── getDsl → 需要页面规则 → getMeta → 有组件文档 → getComponentLink

用户要"先分析再做"
└── 只做 getDsl/getMeta 分析 → 给结构拆解+建议 → 等用户确认再改代码

用户要"直接生成页面"
└── getDsl → 快速分析 → 必要时 getMeta → 结合项目模式实现（不直接贴 D2C）

用户要"导出资源"
└── getD2c → 仅落盘资源摘要 → 后续再决定是否重构

用户指定了目标项目/路径
└── 在对应仓库/目录内检索页面/组件/样式约定 → 实现时遵循
```

---

## 禁止事项

- 不要把 MasterGo 节点树机械映射成难维护代码
- 不要默认新增一整套设计系统
- 不要忽略当前项目已有组件和样式体系
- 不要在信息不足时猜测 fileId/layerId/contentId
- 不要在用户未要求时执行 C2d
- 不要把 D2C 结果直接提交——视为参考素材
- **禁止在用户项目目录中创建任何临时文件**（`.temp_dsl.json`、`analyze_dsl.py`、`_dsl_cache/` 等）——所有 Python 脚本输出只写到 stdout，直接在对话中使用，不落盘到用户项目；唯一例外：用户明确指定"保存到 xxx 文件"

---

## 常用 DSL 提取模式（Python）

以下函数可在 `mastergo_get_dsl.py` 输出后直接使用：

```python
def extract_texts(dsl):
    """提取所有文本内容及其 ID。"""
    texts = []
    def traverse(node):
        if not node:
            return
        if node.get('type') == 'TEXT' and node.get('characters'):
            texts.append({
                'id': node.get('id'),
                'name': node.get('name'),
                'text': node.get('characters'),
            })
        for child in node.get('children', []):
            traverse(child)
    root = dsl.get('dsl', dsl)
    for node in root.get('nodes', []):
        traverse(node)
    return texts


def build_tree(node, depth=0):
    """构建组件树（用于分析层级结构）。"""
    if not node:
        return None
    return {
        'type': node.get('type'),
        'name': node.get('name'),
        'tag': node.get('style', {}).get('tag', 'div'),
        'text': node.get('characters'),
        'children': [build_tree(c, depth + 1) for c in node.get('children', [])]
    }


def get_styles(node):
    """获取节点的 UI 样式 + 布局样式（合并）。"""
    style = node.get('style', {})
    return {
        **style.get('value', {}),
        **style.get('layoutStyles', {}),
    }
```

---

## 输出要求

实现完成后必须说明：
- 本次使用了哪些 MasterGo 信息
- 最终采用的工程拆分方式
- 哪些地方按设计稿精确还原
- 哪些地方因工程可维护性做了调整
- 补齐了哪些设计稿未覆盖的状态
- 如有假设，明确列出
