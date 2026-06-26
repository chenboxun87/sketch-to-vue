# sceneGraph fixtures

- `tiny-tree.json` — 最小可控的合成场景图，供 `test-scene-graph.mjs` / `test-detect-chart-subtrees.mjs` / `test-gen-vue-from-scene-graph.mjs` 使用。

- `_int_out/`（不入库）— 由 `test-scene-graph-integration.mjs` 在本地存在真实导出源时自动生成的中间产物目录。
  - 该目录包含完整提取产物（`_all_elements.json` / `scene-graph.json` / base64 缩略图等），**体量大且会内嵌具体设计内容**，因此不随技能分发。
  - 跑集成测试时设置环境变量指向你自己的 MeaXure 导出（`index.html` + `assets/`）即可重新生成；源不存在时该测试会自动 SKIP，不影响其余回归。
