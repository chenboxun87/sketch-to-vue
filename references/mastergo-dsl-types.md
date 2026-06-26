# MasterGo DSL 类型定义

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：xdt-mastergo-to-frontend/skills/mastergo/references/dsl-types.md（完整保留）

**何时阅读此文件**：
- C 轨道遇到未知 `NodeType` 或 `layerType` 时
- 需要理解 `layout` / `style` / `interactive` 字段的完整结构时
- 编写 Python 提取脚本时需要知道字段路径

---

## 根结构 MGDSLData

```typescript
interface MGDSLData {
  version: string;                    // SemVer 版本号
  framework: 'REACT' | 'VUE2' | 'VUE3' | 'ANDROID' | 'IOS';
  root: MGLayerNode;                  // 入口图层节点
  nodeMap: Record<string, MGNode>;    // 所有节点（按 ID 索引）
  fileMap: Record<string, MGDSLFile>; // 组件文件
  localStyleMap: StyleMap;            // 设计 Token
  settings: { useToken: boolean };
  entry: string;                      // 入口文件 ID
  globalStyleMap: Record<string, ClassStyle>; // 全局 CSS 类（JS 框架）
}
```

---

## 节点类型

### MGLayerNode（主节点）

```typescript
interface MGLayerNode {
  type: 'LAYER';
  id: string;                         // 例如 "1:12"
  name: string;                       // 设计层名称
  componentName: string;              // 代码组件名
  layerType: NodeType;                // FRAME / TEXT / RECTANGLE 等
  children: string[];                 // 子节点 ID 列表
  parent?: string;

  // 可见性
  isVisible: boolean;
  isMask: boolean;
  isRoot: boolean;

  // 布局与样式
  layout: NodeLayout;
  style: CssNodeStyle;
  characters: string;                 // 文字内容（仅 TEXT 节点）

  // 文件关联
  relatedFile: string;
  isNewFile?: boolean;

  // 交互（导航等）
  interactive?: Array<{
    type: 'navigation' | 'scroll' | string;
    targetLayerId?: string;           // 多页面工作流的跳转目标
  }>;
}
```

### NodeType 枚举（完整列表）

```typescript
type NodeType =
  | 'GROUP'            // 组
  | 'FRAME'            // 容器帧 → <div>
  | 'RECTANGLE'        // 矩形 → <div>
  | 'TEXT'             // 文字 → <span> / <p>
  | 'LINE'             // 线条
  | 'ELLIPSE'          // 椭圆
  | 'POLYGON'          // 多边形
  | 'STAR'             // 星形
  | 'PEN'              // 钢笔路径
  | 'COMPONENT'        // 组件定义
  | 'COMPONENTSET'     // 组件变体集
  | 'INSTANCE'         // 组件实例 → 对应组件文档中的组件
  | 'BOOLEANOPERATION' // 布尔运算图形
  | 'SLICE'            // 切片（导出用）
  | 'CONNECTOR'        // 连接线（流程图）
  | 'SECTION'          // 分区
  | 'CUSTOM'           // 自定义
  | 'TABLE'            // 表格 → ls-table / el-table
  | 'TOGGLE'           // 开关
  | 'BUTTON'           // 按钮
  | 'TREE'             // 树形
  | 'TEXTSHAPE'        // 异形文字
  | 'Input'            // 输入框 → ls-input / el-input
  | 'Select'           // 下拉选择 → ls-select / el-select
  | 'Chart';           // 图表 → ECharts / ChartBox
```

### 组件节点

```typescript
interface MGComponentNode extends MGLayerNode {
  layerType: 'COMPONENT';
  alias: string;
  description: string;
  documentationLinks: { url: string }[];
  componentSetId?: string;
  componentSetDescription?: string;
  componentSetDocumentationLinks?: { url: string }[];
}

interface MGInstanceNode extends MGLayerNode {
  layerType: 'INSTANCE';
  mainComponent?: string;             // 主组件图层 ID
  description: string;
  documentationLinks: { url: string }[];
}
```

---

## 布局（NodeLayout）

```typescript
interface NodeLayout {
  width?: Dimension;
  height?: Dimension;
  renderWidth?: Dimension;            // 含阴影/描边的渲染尺寸
  renderHeight?: Dimension;
  matrix?: Matrix;                    // 变换矩阵
  overflow?: 'HIDDEN' | 'VISIBLE';
  autoLayout?: AutoLayout;
  relatedLayout?: AbsoluteLayout | RelatedAutoLayout;
}

type Dimension = {
  type: 'PIXEL' | 'PERCENT' | 'CALC';
  value: number | string;
};

type Matrix = [[number, number, number], [number, number, number]];
```

### AutoLayout（Flexbox）

```typescript
interface AutoLayout {
  direction: 'COLUMN' | 'ROW';
  layoutWrap: 'NO_WRAP' | 'WRAP';           // flex-wrap
  itemSpacing: Dimension | 'AUTO';           // gap
  crossAxisSpacing: Dimension | 'AUTO' | null;
  paddingTop: Dimension;
  paddingRight: Dimension;
  paddingBottom: Dimension;
  paddingLeft: Dimension;
  mainAxisAlignItems: 'START' | 'END' | 'CENTER' | 'SPACE_BETWEEN';
  crossAxisAlignItems: 'START' | 'END' | 'CENTER';
  crossAxisAlignContent: 'AUTO' | 'SPACE_BETWEEN';
  strokesIncludedInLayout: boolean;
  itemReverseZIndex: boolean;
}
```

### 定位

```typescript
// 绝对定位
interface AbsoluteLayout {
  type: 'ABSOLUTE';
  bound: {
    left?: Dimension; right?: Dimension;
    top?: Dimension;  bottom?: Dimension;
  };
  renderBound: {
    left?: Dimension; right?: Dimension;
    top?: Dimension;  bottom?: Dimension;
  };
}

// Flex 子项
interface RelatedAutoLayout {
  type: 'AUTO';
  alignSelf: 'STRETCH' | 'INHERIT' | 'AUTO';
  flexGrow: number;                   // flex-grow
}
```

---

## 样式（CssNodeStyle）

```typescript
interface CssNodeStyle {
  id: string;                         // "style-{nodeId}"
  name: string;                       // CSS 类名
  type: 'VIEW' | 'SVG' | 'IMAGE' | 'TEXT' | 'INPUT' | 'BUTTON' | 'SCROLLVIEW';
  tag?: 'IMG' | 'DIV' | 'TEXT' | 'BUTTON' | 'INPUT' | 'SLOT' | 'SVG' | 'OPTION';

  value: StyleSet;                    // UI 样式（颜色/边框/阴影等）
  layoutStyles: StyleSet;             // 布局样式（flex/position）
  inlineStyles?: StyleSet;
  dynamicInlineStyles?: Record<string, string>;

  attributes: Record<string, AttributeItem>;
  classList?: string[];
  subSelectors?: ClassStyle[];
  textStyles?: TextSegStyle[];        // 富文本段落样式

  // Token 引用
  styleTokenAlias?: {
    backgroundTokenId?: string;
    strokeColorTokenId?: string;
    paddingTokenId?: string;
    gapTokenId?: string;
    radiusTokenId?: string;
  };
}
```

---

## 设计 Token 类型

```typescript
type TokenItem = TokenCommonItem | TokenTextItem | TokenEffectItem;

interface TokenCommonItem {
  id: string;
  type: 'color' | 'padding' | 'border-radius' | 'border-width' | 'gap';
  name: string;
  originName: string;
  originAlias: string;
  value: any;                         // 实际 CSS 值
  variable: string;                   // CSS 变量名，例如 "--brand-primary"
  isMultiple?: boolean;
}

interface TokenTextItem {
  id: string;
  type: 'text';
  name: string;
  variable: string;
  textItems: {
    font?: TokenTextSubItem;
    fontfamily?: TokenTextSubItem;
    fontstyle?: TokenTextSubItem;
    fontsize?: TokenTextSubItem;
    lineheight?: TokenTextSubItem;
    decoration?: TokenTextSubItem;
    letterspacing?: TokenTextSubItem;
  };
}

interface TokenEffectItem {
  id: string;
  type: 'effect';
  name: string;
  variable: string;
  effectItems: {
    shadow?: TokenEffectSubItem;
    filter?: TokenEffectSubItem;
    backdropfilter?: TokenEffectSubItem;
  };
}
```

---

## 组件文件（MGDSLFile）

```typescript
interface MGDSLFile {
  id: string;
  name: string;
  entryLayerId: string;
  chunks: string[];                   // 子文件 ID

  data: Record<string, DataItem>;
  props: Record<string, PropItem>;
  methods: Record<string, Method>;
  computed: Record<string, Computed>;
  imports: ImportItem[];
}

interface Method {
  name: string;
  args: string[];
  content: string;
  returnValue?: string;
}

interface Computed {
  name: string;
  args: string[];
  content: string;
  returnValue?: string;
  dependencies?: string[];
}

interface ImportItem {
  name: string;
  path: string;
  type: 'DEFAULT' | 'ALL';           // import X vs import * as X
}
```

---

## 操作节点（条件 / 循环）

```typescript
type MGOperationNode = IfStatement | Iteration | Raw | TernaryExpression;

interface IfStatement {
  type: 'OPERATION';
  operationType: 'If_STATEMENT';
  condition: string;
  consequent: { type: 'MGNode' | 'EXPRESSION'; body: MGNode | string };
  alternate: { type: 'MGNode' | 'EXPRESSION'; body: MGNode | string };
}

interface Iteration {
  type: 'OPERATION';
  operationType: 'ITERATOR';
  variable: string;                   // 循环变量名
  body: MGNode;
  key?: string;                       // 列表渲染的 key 字段
}

interface TernaryExpression {
  type: 'OPERATION';
  operationType: 'TERNARY_EXPRESSION';
  condition: string;
  trueExpression:  { type: 'MGNode' | 'EXPRESSION'; body: MGNode | string };
  falseExpression: { type: 'MGNode' | 'EXPRESSION'; body: MGNode | string };
}
```

---

## 代码生成映射速查

| DSL 字段 | CSS / HTML 输出 |
|---------|----------------|
| `style.value` | UI CSS 属性（颜色、边框、阴影） |
| `style.layoutStyles` | Flexbox / position 属性 |
| `style.tag` | HTML 标签名 |
| `style.name` | CSS 类名 |
| `style.classList` | 附加 CSS 类 |
| `style.attributes` | HTML / 组件属性 |
| `layout.autoLayout` | `display: flex` + flex 子属性 |
| `layout.relatedLayout.type = 'ABSOLUTE'` | `position: absolute` |
| `localStyleMap[tokenId].variable` | CSS 变量引用（`var(--xxx)`）|
| `characters` | 文字内容 |
