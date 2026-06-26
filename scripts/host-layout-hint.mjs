/**
 * Step 0-A0 辅助：从 _all_elements 推断设计稿页面壳（侧栏/顶栏）与嵌入 BasicLayout 时的 CONTENT_SHIFT。
 * 输出供 _host_layout_hint.json；启发式结果须人工确认，confidence 低时勿盲信。
 */

function round(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/**
 * @param {{ w: number, h: number, x?: number, y?: number }} board
 * @param {Array<{ id?: string, name?: string, type?: string, rect?: { x,y,w,h }, content?: string, opacity?: number }>} elements
 */
export function detectHostLayoutHint(board, elements) {
  const bw = board.w;
  const bh = board.h;
  const visible = (elements || []).filter((e) => e.rect && e.type !== 'unknown' && e.opacity !== 0);

  const hint = {
    version: 1,
    board: { w: bw, h: bh },
    contentShift: { x: 0, y: 0 },
    stage: { w: bw, h: bh },
    confidence: { x: 0, y: 0, overall: 0 },
    chromeDetected: false,
    evidence: { shiftX: [], shiftY: [] },
    recommendations: {
      /** true=建议嵌入+SHIFT；false=建议全屏或 shift=0；null=信号不足 */
      embedBasicLayout: null,
      scaleStrategyEmbed: 'widthFillVerticalScroll',
      scaleStrategyFullscreen: 'letterboxMinVwVh',
      routingEmbed: 'BasicLayout.children nested path',
      routingFullscreen: 'top-level route parallel to BasicLayout',
    },
    warnings: [],
  };

  if (!bw || !bh || !visible.length) {
    hint.warnings.push('画板尺寸或元素列表为空，无法推断');
    hint.decision = deriveHostDecision(hint, {});
    return hint;
  }

  const EDGE = 12;
  const MIN_SIDEBAR_W = 100;
  const MIN_SIDEBAR_H_RATIO = 0.35;
  const MAX_SHIFT_X_RATIO = 0.35;
  const MAX_SHIFT_Y_RATIO = 0.15;
  const MIN_WIDE_W = Math.min(400, bw * 0.2);
  const MIN_CONTENT_COL_W = Math.min(320, bw * 0.18);

  // --- shiftX：左缘高面板 + 可选竖分隔 + 内容列起始 x ---
  const leftPanels = visible.filter((e) => {
    const r = e.rect;
    return (
      r.x <= EDGE &&
      r.w >= MIN_SIDEBAR_W &&
      r.h >= bh * MIN_SIDEBAR_H_RATIO &&
      ['slice', 'shape', 'group'].includes(e.type)
    );
  });

  const dividers = visible.filter((e) => {
    const r = e.rect;
    return r.w <= 24 && r.h >= bh * MIN_SIDEBAR_H_RATIO && r.x >= 80 && r.x <= bw * 0.22;
  });

  let sidebarRight = 0;
  for (const e of leftPanels) {
    const right = round(e.rect.x + e.rect.w);
    sidebarRight = Math.max(sidebarRight, right);
    hint.evidence.shiftX.push({
      kind: 'left-edge-panel',
      id: e.id,
      name: e.name,
      right,
      rect: e.rect,
    });
  }

  if (leftPanels.length) {
    for (const e of dividers) {
      const right = round(e.rect.x + e.rect.w);
      sidebarRight = Math.max(sidebarRight, right);
      hint.evidence.shiftX.push({
        kind: 'vertical-divider',
        id: e.id,
        name: e.name,
        right,
        rect: e.rect,
      });
    }
  }

  const wideInContentColumn = visible.filter((e) => {
    const r = e.rect;
    if (leftPanels.length) {
      // 内容列起始 x 应在侧栏右缘附近，勿取更靠右的卡片（如 x=293）
      if (r.x < sidebarRight - 10 || r.x > sidebarRight + 28) return false;
    } else {
      return false;
    }
    return r.w >= MIN_CONTENT_COL_W && r.h >= 32;
  });
  const contentStartXs = wideInContentColumn.map((e) => e.rect.x);
  const minContentX = contentStartXs.length ? Math.min(...contentStartXs) : null;

  let shiftX = 0;
  if (leftPanels.length) {
    if (minContentX != null && minContentX >= sidebarRight - 15 && minContentX <= sidebarRight + 40) {
      shiftX = Math.round(minContentX);
      hint.evidence.shiftX.push({ kind: 'content-column-min-x', value: shiftX });
    } else if (sidebarRight > 0) {
      shiftX = Math.ceil(sidebarRight);
      if (minContentX != null && Math.abs(minContentX - shiftX) <= 20) {
        shiftX = Math.round(minContentX);
        hint.evidence.shiftX.push({ kind: 'content-column-snap', value: shiftX });
      }
    }
  }

  if (shiftX <= 0 || shiftX > bw * MAX_SHIFT_X_RATIO) {
    if (shiftX > bw * MAX_SHIFT_X_RATIO) {
      hint.warnings.push(`shiftX=${shiftX} 超过画板宽度 ${(MAX_SHIFT_X_RATIO * 100).toFixed(0)}%，已归零`);
    }
    shiftX = 0;
    if (!leftPanels.length) hint.evidence.shiftX = [];
  }

  // --- shiftY：内容区多节标题同行 或 大面板最小 y（仅当 shiftX>0 或存在顶栏宽条）---
  let shiftY = 0;

  const topFullWidthBars = visible.filter((e) => {
    const r = e.rect;
    return r.y <= EDGE && r.h >= 32 && r.h <= 120 && r.w >= bw * 0.5;
  });

  if (shiftX > 0 || topFullWidthBars.length) {
    const maxSectionTitleY = bh * 0.12;
    const sectionTitles = visible.filter(
      (e) =>
        e.type === 'text' &&
        e.rect.x >= shiftX - 5 &&
        e.rect.y <= maxSectionTitleY &&
        e.rect.h <= 40 &&
        typeof e.content === 'string' &&
        e.content.length >= 2 &&
        e.content.length <= 12 &&
        !/[\/／]/.test(e.content)
    );
    const yBuckets = {};
    for (const e of sectionTitles) {
      const y = Math.round(e.rect.y);
      if (!yBuckets[y]) yBuckets[y] = [];
      yBuckets[y].push(e);
    }
    const titleRows = Object.entries(yBuckets)
      .filter(([, arr]) => arr.length >= 2)
      .sort((a, b) => Number(a[0]) - Number(b[0])); // 取最靠上的节标题行

    if (titleRows.length) {
      shiftY = Number(titleRows[0][0]);
      hint.evidence.shiftY.push({
        kind: 'section-title-row',
        y: shiftY,
        count: titleRows[0][1].length,
        samples: titleRows[0][1].slice(0, 4).map((e) => e.content),
      });
    } else {
      const panels = visible.filter((e) => {
        const r = e.rect;
        return (
          r.x >= shiftX - 5 &&
          r.w >= Math.min(250, bw * 0.15) &&
          r.h >= 80 &&
          ['slice', 'shape', 'group'].includes(e.type)
        );
      });
      if (panels.length) {
        shiftY = Math.round(Math.min(...panels.map((e) => e.rect.y)));
        hint.evidence.shiftY.push({ kind: 'content-panel-min-y', y: shiftY });
      } else if (topFullWidthBars.length) {
        shiftY = Math.round(
          Math.max(...topFullWidthBars.map((e) => round(e.rect.y + e.rect.h)))
        );
        hint.evidence.shiftY.push({ kind: 'top-full-width-bar-bottom', y: shiftY });
      }
    }
  }

  if (shiftY > bh * MAX_SHIFT_Y_RATIO) {
    hint.warnings.push(
      `shiftY=${shiftY} 超过画板高度 ${(MAX_SHIFT_Y_RATIO * 100).toFixed(0)}%，已归零`
    );
    shiftY = 0;
    hint.evidence.shiftY = hint.evidence.shiftY.filter((e) => e.kind !== 'content-panel-min-y');
  }

  // shiftX=0 时不应单独保留 shiftY（避免无侧栏设计误判顶栏）
  if (shiftX === 0 && shiftY > 0 && !topFullWidthBars.length) {
    hint.warnings.push('未检测到侧栏但存在 shiftY，已归零 shiftY');
    shiftY = 0;
    hint.evidence.shiftY = [];
  }

  hint.contentShift = { x: shiftX, y: shiftY };
  hint.stage = { w: bw - shiftX, h: bh - shiftY };
  hint.chromeDetected = shiftX > 0 || shiftY > 0;

  hint.confidence.x = leftPanels.length
    ? Math.min(1, 0.45 + leftPanels.length * 0.12 + (dividers.length ? 0.15 : 0))
    : 0;
  hint.confidence.y =
    shiftY > 0
      ? hint.evidence.shiftY.some((e) => e.kind === 'section-title-row')
        ? 0.88
        : 0.55
      : 0;
  hint.confidence.overall = hint.chromeDetected
    ? shiftY > 0
      ? Math.min(hint.confidence.x, hint.confidence.y)
      : hint.confidence.x * 0.7
    : 0.92;

  if (hint.chromeDetected && hint.confidence.overall >= 0.5) {
    hint.recommendations.embedBasicLayout = true;
    hint.recommendations.note =
      '检测到设计稿页面壳；嵌入 BasicLayout 时应用 contentShift，路由用 children 嵌套';
  } else if (!hint.chromeDetected) {
    hint.recommendations.embedBasicLayout = false;
    hint.recommendations.note =
      '未检测到明显侧栏/顶栏壳层；全屏 letterbox 或 contentShift=0 嵌入均可';
  } else {
    hint.recommendations.embedBasicLayout = null;
    hint.recommendations.note =
      'chrome 信号弱，请人工对照 preview 确认 contentShift 后再写 Index.vue';
  }

  hint.decision = deriveHostDecision(hint, {});
  return hint;
}

const HOST_THRESHOLDS = { embedResolved: 0.7, minConsider: 0.5 };
const ARCH_VALUES = ['layerStack', 'anchorComponents'];
const HOST_VALUES = ['embed', 'fullscreen'];
const SCALE_VALUES = ['widthFillVerticalScroll', 'letterboxMinVwVh'];

function scaleFromHost(hostValue) {
  return hostValue === 'embed' ? 'widthFillVerticalScroll' : 'letterboxMinVwVh';
}

/**
 * @mutates decision — 直接修改 decision 对象属性（host / scale / renderArchitecture）。
 * 调用方须确保传入局部对象而非共享引用。
 */
function applyConfirm(decision, confirm) {
  let applied = false;
  if (decision.host.status === 'needs_confirmation' && HOST_VALUES.includes(confirm.host)) {
    decision.host = { value: confirm.host, confidence: decision.host.confidence, status: 'resolved', source: 'confirm' };
    applied = true;
    if (decision.scale.status === 'needs_confirmation' && !SCALE_VALUES.includes(confirm.scale)) {
      decision.scale = { value: scaleFromHost(confirm.host), status: 'resolved', source: 'confirm' };
    }
  }
  if (decision.scale.status === 'needs_confirmation' && SCALE_VALUES.includes(confirm.scale)) {
    decision.scale = { value: confirm.scale, status: 'resolved', source: 'confirm' };
    applied = true;
  }
  if (decision.renderArchitecture.status === 'needs_confirmation' && ARCH_VALUES.includes(confirm.renderArchitecture)) {
    decision.renderArchitecture = { value: confirm.renderArchitecture, source: 'confirm', status: 'resolved' };
    applied = true;
  }
  return applied;
}

/**
 * 由 hint 计算唯一决策。arch 仅接受枚举值；confirm 覆盖 needs_confirmation 项。
 * @param {{confidence?:{overall?:number}, chromeDetected?:boolean}} hint
 * @param {{arch?:string|null, confirm?:object|null}} opts
 */
export function deriveHostDecision(hint, opts = {}) {
  const { arch = null, confirm = null } = opts;
  const thresholds = { ...HOST_THRESHOLDS };
  const overall = (hint && hint.confidence && Number(hint.confidence.overall)) || 0;
  const chrome = !!(hint && hint.chromeDetected);

  let host;
  if (chrome && overall >= thresholds.embedResolved) {
    host = { value: 'embed', confidence: overall, status: 'resolved' };
  } else if (!chrome) {
    host = { value: 'fullscreen', confidence: overall, status: 'resolved' };
  } else if (overall >= thresholds.minConsider) {
    host = { value: 'embed', confidence: overall, status: 'needs_confirmation' };
  } else {
    host = { value: null, confidence: overall, status: 'needs_confirmation' };
  }

  let scale;
  if (host.status === 'resolved') {
    scale = { value: scaleFromHost(host.value), status: 'resolved' };
  } else {
    scale = { value: null, status: 'needs_confirmation' };
  }

  let renderArchitecture;
  if (arch && ARCH_VALUES.includes(arch)) {
    renderArchitecture = { value: arch, source: 'input', status: 'resolved' };
  } else {
    renderArchitecture = { value: null, source: null, status: 'needs_confirmation' };
  }

  const decision = { host, scale, renderArchitecture, status: 'needs_confirmation', thresholds };

  if (confirm && typeof confirm === 'object') {
    if (applyConfirm(decision, confirm)) decision.confirmApplied = true;
  }

  decision.status =
    decision.host.status === 'resolved' &&
    decision.scale.status === 'resolved' &&
    decision.renderArchitecture.status === 'resolved'
      ? 'resolved'
      : 'needs_confirmation';

  return decision;
}
