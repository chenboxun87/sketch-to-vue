# 反模式清单（26 条禁止事项）

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：datav-dashboard + sketch-meaxure-to-vue + xdt-mastergo-to-frontend 综合整理

---

## 架构类（8 条）

### A1. 禁止写死组件架构

组件数量和结构由切图数据检测结果决定，不要假设"一定是三列"或"一定有 LeftPanel"。

```
❌ 永远生成固定结构：<LeftPanel> + <CenterPanel> + <RightPanel>
✅ 用动态布局检测：large_bgs 聚类 → 检测到几个区域 → 生成几个组件
```

### A2. 禁止机械映射设计节点树

不要把 DSL/JSON 节点树一层层翻译成难维护的嵌套代码。先把设计结构转换成工程结构。

### A3. 禁止忽略项目现有组件

落地到指定项目前，必须先检索并复用已有业务组件/布局/表单封装/样式变量。

### A4. 禁止默认新增一整套设计系统

仅在确无现成能力时才新增组件/样式，且新增件应贴近现有组件的 API 和写法。

### A5. 禁止在信息不足时猜测参数

MasterGo：不猜 fileId / layerId / contentId。信息不足先补齐参数再继续。

### A6. 禁止忽略设计稿未覆盖的状态

实现前必须识别空态/加载态/错误态/弹窗态/禁用态的缺口，并按设计语言补齐。

### A7. 禁止直接把 D2C 结果当最终代码提交

D2C 是参考素材，不是最终工程代码。对明显冗余/绝对定位过多的样式必须重构。

### A8. 禁止 §3.9 layer_stack 与项目 anchor/overlay 混用

skill 验证或纯 stack 交付时，不得再引入 `CockpitDynamicOverlay`、`ANCHOR_REPLACED_FILES`、旧版 anchors 业务封装。  
混用会导致叠影，且无法判断是 skill 提取问题还是项目封装问题。架构分叉见 `meaxure-track.md` Step 0-A0.2。

---

## CSS / 样式类（8 条）

### C1. 禁止用 `<img>` 标签做全页背景

`bg.png`、`nav.png` 等全页背景图必须用 `background-image` 实现，加在最外层 div 上，禁止用 `<img>` 标签。

### C2. 禁止用纯色替代背景图

切图中有的背景图必须用图片，不要用 CSS 颜色模拟（视觉差异会很明显）。

### C3. 禁止忽略渐变

标题文字有 Gradient fill 时必须实现渐变：
```less
background: linear-gradient(...);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

### C4. 禁止嵌套 `/deep/`（Vue 2 项目）

每条穿透样式单独写，不要嵌套：
```less
// ❌  
/deep/ .ls-table { /deep/ .el-checkbox { } }

// ✅
/deep/ .ls-table { ... }
/deep/ .ls-table .el-checkbox { ... }
```

### C5. 禁止表格列设 `:width`（Vue 2/vmd-ui）

大屏自适应场景只用 `:min-width`，不用 `:width`。

### C6. 禁止 ECharts 轴文字生成 DOM 元素

图表区域的 Y 轴刻度/X 轴时间标签不要写成 DOM 文字——ECharts 的 xAxis/yAxis 配置会自渲染。切图中这些文字仅用于确认图表类型。

### C7. 禁止靠肉眼猜测颜色

颜色/渐变必须从源数据（MeaXure JSON / FILE_DATA.json / DSL）提取，不靠截图取色（有色域偏差）。

### C8. 禁止在 scoped 外写全局样式（Vue 2）

穿透样式写在 `<style lang="less" scoped>` 块内用 `/deep/`，不要写在无 scoped 的全局样式中。

---

## 资源类（5 条）

### R1. 禁止跳过图片复制

切图中所有 slice 图片必须复制到项目中，不得遗漏。

### R2. 禁止用文字替代图片

分页箭头、图标等切图是图片的，必须用图片，不要用文字或纯 CSS 模拟。

### R3. 禁止硬编码中文/空格文件路径

所有图片路径必须通过 `getAssetPath()` URL 编码，不直接拼接中文字符。

### R4. 禁止在用户项目中创建临时脚本/缓存文件

MasterGo 分析产出的 DSL 缓存（`.temp_dsl.json` 等）和分析脚本（`analyze_dsl.py` 等）不得创建在用户项目目录中。所有脚本输出到 stdout，直接在内存中使用。

### R5. 禁止靠文件名推断图标语义

图标文件名可能被误命名（字面意思 ≠ 实际图片内容），必须先列出文件名、对照设计图逐一核实。

---

## 脚本/工具类（3 条）

### S1. 禁止用 Windows `dir` 命令列中文文件名

Windows `dir` 命令在某些环境下无法正确显示中文，必须用 Node.js 列出文件名。

### S2. 禁止 @2x 文件 CSS 尺寸除以 2

manifest/JSON 里的 `w/h` 已经是 1x CSS 像素，直接用，不要除以 2。

### S3. 禁止用固定阈值识别布局

使用大背景 slice 的位置聚类来动态检测面板数量和边界，不要写死 `left < 500` 就是左侧面板等固定规则（阈值应根据实际设计调整，不是通用魔法数字）。

---

## 验收类（2 条）

### V1. 禁止靠截图肉眼验收

声称"还原好了/修好了"之前，必须用浏览器 CDP 量关键元素的计算样式/bounding rect（见 `browser-verification.md`）。

### V2. 禁止跳过元素对照检查

完成后必须对照 `emit-summary.json` 的计数（images/texts/shapes），确保每个元素要么在代码中，要么在"已替换/已合并"清单里，不能有无声遗漏。
