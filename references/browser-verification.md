# 浏览器 CDP 校验协议

还原设计稿时，**肉眼对比截图有根本局限**：看不到计算样式、量不出像素、判断不了元素是否真实渲染。本项目最有效的实践是用浏览器 CDP（Chrome DevTools Protocol）检查 live DOM。它能：

- 量出元素真实 computed style / bounding rect / 占视口比例
- 发现"看起来没渲染"的真因（如组件渲染成空注释节点）
- 在改动后客观验证像素是否对齐，而非自我感觉

## 何时必须用浏览器校验

1. **完成前**：声称"还原好了/修好了"之前，用 CDP 量关键元素尺寸/位置，而非靠截图判断。
2. **卡壳时**：同一问题失败 ≤2 次后，**立刻停止改代码**，改用 CDP 取证（见调试纪律）。
3. **响应式/缩放**：验证元素是否真的与视口成固定比例（见下方比例校验）。

## 基本流程

```
1. 确认 dev server 可达：curl -s -o /dev/null -w "%{http_code}" <url>
2. browser_navigate <url>
3. browser_cdp Runtime.evaluate 跑诊断表达式（returnByValue:true）
4. 必要时 browser_take_screenshot 视觉确认
```

## 诊断配方（可直接改用）

**A. 元素是否真实渲染（排查"点了没反应/不显示"）**
```js
(function(){
  var el = document.querySelector('.target');
  return JSON.stringify({
    exists: !!el,
    childCount: el ? el.childNodes.length : 0,
    // nodeType 8 = 注释节点 → 组件渲染失败的典型信号
    kids: el ? [...el.childNodes].map(n => ({type:n.nodeType, name:n.nodeName})) : [],
    html: el ? el.innerHTML.slice(0,120) : null
  });
})()
```
> 本项目靠这条发现：登录卡片容器里是 `<!----><!---->`（两个注释节点），即 Signin 组件渲染抛错，而非"点击没生效"。

**B. 计算样式 / 像素尺寸**
```js
(function(){
  var el = document.querySelector('.target');
  var cs = getComputedStyle(el);
  var r = el.getBoundingClientRect();
  return JSON.stringify({ width:cs.width, padding:cs.padding,
    renderedW:r.width.toFixed(1), renderedH:r.height.toFixed(1),
    aspect:(r.width/r.height).toFixed(3) });
})()
```

**C. 占视口比例（验证缩放不变性）**
```js
(function(){
  var vw=innerWidth, vh=innerHeight, el=document.querySelector('.target');
  var f=parseFloat(getComputedStyle(el).fontSize);
  return JSON.stringify({ vw, vh, font:f, ratioToVw:(f/vw).toFixed(4) });
})()
```
> 比例恒定（如 0.0400 = 4vw）即证明：物理尺寸不随系统/浏览器缩放变化（缩放只改 CSS 视口，不改物理像素）。

**D. 滚动锁定 / 元素是否随滚轮移动**
```js
(function(){
  var el=document.querySelector('.target');
  var before=el.getBoundingClientRect().top;
  scrollTo(0,500);
  return JSON.stringify({ htmlOverflow:getComputedStyle(document.documentElement).overflow,
    scrollY:scrollY, moved: el.getBoundingClientRect().top!==before });
})()
```

**E. 触发交互（无障碍快照无 ref 时）**
```js
// 直接 .click() 目标元素，再 setTimeout 读取结果（配合 awaitPromise:true）
(function(){ document.querySelector('.overlay').click();
  return new Promise(r=>setTimeout(()=>r(document.querySelector('.card')?'shown':'none'),300)); })()
```

## 注意

- `Input.*` 类 CDP 方法在 Electron webview 中被禁用，**用 `browser_click` / 元素 `.click()` / `dispatchEvent` 代替**。
- 大响应会落盘为文件，优先读关键字段。
- MCP 浏览器窗口可能很窄（如 220px），元素显示小是正常的——**看比例不看绝对像素**，真实屏幕按比例放大。
