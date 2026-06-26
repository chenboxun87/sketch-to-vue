<!--
  MasterGo 帧 → Vue 还原组件骨架（复制后改名使用）
  ===================================================================
  用法：
  1. 把 .frame 的 width/height 改成提取 JSON 里"帧根节点"的 w/h（1x CSS px）。
  2. 对每个节点，按决策表（见 mastergo-full-workflow.md Phase 3）选择：
       - 背景/渐变/阴影矩形 → 用提取的 css（<div> + background/box-shadow/...）
       - 图标/头像/插画/背景图 → <img src="/static/<page>-assets/<文件名>.png">
       - 文字 → <div> 用提取的 left/top/font-size/color 叠加，不写 background-image
  3. 所有 left/top/width/height 直接抄提取 JSON 的值（已是相对帧原点的 1x px）。
  4. 删除本注释和示例节点，只保留真实节点。
  ===================================================================
-->
<template>
  <div class="mg-frame">
    <!-- ① 背景层：切图（IMAGE 填充节点）。src 必须从 index.html/fills 确认，不靠文件名猜 -->
    <img
      class="mg-bg"
      src="/static/REPLACE-page-assets/REPLACE背景@1x.png"
      alt=""
      draggable="false"
    />

    <!-- ② 背景层：纯 CSS（纯色/渐变/阴影矩形，提取 css 直接填，不切图） -->
    <div class="mg-card"></div>

    <!-- ③ 图标/头像：切图 -->
    <img
      class="mg-icon"
      src="/static/REPLACE-page-assets/REPLACE图标@1x.png"
      alt=""
      draggable="false"
    />

    <!-- ④ 文字层：position:absolute 叠加，用提取的文字样式 -->
    <div class="mg-text">REPLACE文字内容</div>

    <!-- ⑤ 可交互区域：记得开 pointer-events:auto -->
    <div class="mg-clickable" @click="onClick"></div>
  </div>
</template>

<script>
export default {
  name: "MgRestoredFrame",
  methods: {
    onClick() {
      // TODO: 交互逻辑
    },
  },
};
</script>

<style lang="less" scoped>
/* 帧容器：width/height = 提取 JSON 帧根节点 w/h */
.mg-frame {
  position: relative;
  width: 478px;   /* REPLACE: 帧宽 */
  height: 823px;  /* REPLACE: 帧高 */
  /* 容器不接收点击时，子节点按需开 pointer-events:auto */
  pointer-events: none;
}

/* ① 背景切图：铺满帧 */
.mg-bg {
  position: absolute;
  left: 0;
  top: 0;
  width: 478px;   /* REPLACE */
  height: 823px;  /* REPLACE */
  border-radius: 16px; /* REPLACE: 提取的 border-radius */
}

/* ② CSS 背景卡片：把提取 JSON 的 css 原样填进来 */
.mg-card {
  position: absolute;
  left: 0;    /* REPLACE */
  top: 0;     /* REPLACE */
  width: 0;   /* REPLACE */
  height: 0;  /* REPLACE */
  /* background / box-shadow / border / border-radius 抄提取值 */
}

/* ③ 图标切图：尺寸 = 提取 w/h（@2x 文件也用 1x 的 w/h，不除以 2） */
.mg-icon {
  position: absolute;
  left: 0;   /* REPLACE */
  top: 0;    /* REPLACE */
  width: 24px;  /* REPLACE */
  height: 24px; /* REPLACE */
}

/* ④ 文字：用提取的 font-size/font-weight/color/letter-spacing/line-height */
.mg-text {
  position: absolute;
  left: 24px;  /* REPLACE */
  top: 18px;   /* REPLACE */
  font-size: 18px;     /* REPLACE */
  font-weight: 600;    /* REPLACE */
  color: #ffffff;      /* REPLACE */
  white-space: nowrap;
}

/* ⑤ 可交互层：开启点击 */
.mg-clickable {
  position: absolute;
  left: 0;   /* REPLACE */
  top: 0;    /* REPLACE */
  width: 0;  /* REPLACE */
  height: 0; /* REPLACE */
  pointer-events: auto;
  cursor: pointer;
}
</style>
