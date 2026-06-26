#!/usr/bin/env python3
"""
MeaXure HTML 数据提取脚本（Python 版）
========================================
从 Sketch MeaXure 导出的 index.html 中提取图层数据，支持多 artboard。
同时执行动态布局检测和元素类型识别。

用法：
  python extract-meaxure-data.py  <index.html>                # 提取第 0 个 artboard
  python extract-meaxure-data.py  <index.html>  <N>           # 提取第 N 个 artboard
  python extract-meaxure-data.py  <index.html>  --list        # 列出所有 artboard
  python extract-meaxure-data.py  <index.html>  N  --json     # 输出 JSON 而非文字报告

无依赖，兼容 Python 3.6+
"""

import json
import re
import sys
import os
import argparse
from typing import List, Dict, Any, Optional, Tuple


def parse_meaxure_data(html_path: str) -> dict:
    """从 index.html 中提取 let data = {...} 并解析为 Python dict。"""
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    start_marker = 'let data = '
    start = content.find(start_marker)
    if start == -1:
        raise ValueError(f'找不到 "let data = " in {html_path}')

    depth = 0
    i = start + len(start_marker)
    end = -1
    for j in range(i, len(content)):
        c = content[j]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = j + 1
                break

    if end == -1:
        raise ValueError('无法解析 MeaXure data 对象（括号不匹配？）')

    return json.loads(content[i:end])


def normalize_layer(layer: dict, z_index: int) -> dict:
    """把原始图层数据规范化为统一结构。"""
    rect = layer.get('rect', {})
    result = {
        'id': layer.get('objectID', ''),
        'name': layer.get('name', ''),
        'type': layer.get('type', ''),
        'z': z_index,
        'left': round(float(rect.get('x', 0)), 2),
        'top': round(float(rect.get('y', 0)), 2),
        'width': round(float(rect.get('width', 0)), 2),
        'height': round(float(rect.get('height', 0)), 2),
    }

    # 文字相关
    if layer.get('content') is not None:
        result['content'] = layer['content']
    if layer.get('css'):
        result['css'] = layer['css']
    if layer.get('textAlign'):
        result['textAlign'] = layer['textAlign']
    if layer.get('lineHeight') is not None:
        result['lineHeight'] = layer['lineHeight']
    if layer.get('fontSize') is not None:
        result['fontSize'] = layer['fontSize']
    if layer.get('fontFamily'):
        result['fontFamily'] = layer['fontFamily']

    # 视觉属性
    if layer.get('opacity') is not None and layer['opacity'] != 1:
        result['opacity'] = layer['opacity']
    if layer.get('rotation'):
        result['rotation'] = layer['rotation']

    # 填充/阴影/边框
    if layer.get('fills'):
        result['fills'] = layer['fills']
    if layer.get('shadows'):
        result['shadows'] = layer['shadows']
    if layer.get('borders'):
        result['borders'] = layer['borders']

    # 导出路径
    exportable = layer.get('exportable', [])
    if exportable:
        result['exports'] = [
            {'path': e.get('path', ''), 'format': e.get('format', ''), 'scale': e.get('scale', 1)}
            for e in exportable if e.get('path')
        ]

    return result


def flatten_layers(layers: list, z_start: int = 0) -> Tuple[List[dict], int]:
    """递归展平图层树（跳过 group，保留 children）。"""
    result = []
    z = z_start
    for layer in (layers or []):
        if layer.get('type') == 'group':
            children, z = flatten_layers(layer.get('layers', []), z)
            result.extend(children)
        else:
            result.append(normalize_layer(layer, z))
            z += 1
            if layer.get('layers'):
                children, z = flatten_layers(layer['layers'], z)
                result.extend(children)
    return result, z


def detect_layout(all_layers: List[dict]) -> dict:
    """
    动态布局检测：按大背景 slice 的位置聚类识别面板。
    不要硬编码"一定是三列"。
    """
    large_bgs = [
        l for l in all_layers
        if l['type'] == 'slice' and l['width'] > 200 and l['height'] > 100
    ]

    headers = [b for b in large_bgs if b['top'] < 150]
    body_bgs = [b for b in large_bgs if b['top'] >= 150]

    # 按 left 聚类（阈值基于实际设计动态调整）
    all_lefts = sorted(set(b['left'] for b in body_bgs))
    
    # 简单三区间分类（可根据实际调整）
    left_panels = [b for b in body_bgs if b['left'] < 500]
    center_panels = [b for b in body_bgs if 500 <= b['left'] < 1400]
    right_panels = [b for b in body_bgs if b['left'] >= 1400]

    layout = {
        'header_count': len(headers),
        'left_panel_count': len(left_panels),
        'center_panel_count': len(center_panels),
        'right_panel_count': len(right_panels),
        'total_large_bgs': len(large_bgs),
    }

    # 生成组件架构建议
    components = []
    if headers:
        components.append('HeaderComponent（顶部标题区）')
    if left_panels:
        components.append('LeftPanel（左侧面板）')
    if center_panels:
        components.append('CenterPanel（中间面板）')
    if right_panels:
        components.append('RightPanel（右侧面板）')

    layout['suggested_components'] = components
    layout['panels'] = {
        'headers': [{'name': b['name'], 'x': b['left'], 'y': b['top'], 'w': b['width'], 'h': b['height']} for b in headers],
        'left': [{'name': b['name'], 'x': b['left'], 'y': b['top'], 'w': b['width'], 'h': b['height']} for b in left_panels],
        'center': [{'name': b['name'], 'x': b['left'], 'y': b['top'], 'w': b['width'], 'h': b['height']} for b in center_panels],
        'right': [{'name': b['name'], 'x': b['left'], 'y': b['top'], 'w': b['width'], 'h': b['height']} for b in right_panels],
    }

    return layout


def recognize_elements(all_layers: List[dict]) -> List[dict]:
    """
    识别特殊 UI 元素类型（表格/图表/输入框/分页等）。
    """
    recognized = []
    text_layers = [l for l in all_layers if l['type'] == 'text']
    slice_layers = [l for l in all_layers if l['type'] == 'slice']

    # 1. 顶部标题栏
    big_titles = [l for l in text_layers
                  if l['top'] < 150 and l.get('fontSize', 0) >= 20]
    if big_titles:
        recognized.append({
            'type': 'title-bar',
            'description': f'顶部标题栏，{len(big_titles)} 个大字号文字（≥20px）',
            'layers': [l['name'] for l in big_titles[:3]]
        })

    # 2. 图表区（含轴刻度特征）
    axis_patterns = re.compile(r'^\d{2}:\d{2}|^\d{3,4}$|^(00:00|06:00|12:00|18:00)')
    axis_texts = [l for l in text_layers if axis_patterns.match(str(l.get('content', '')))]
    if len(axis_texts) >= 3:
        recognized.append({
            'type': 'chart-area',
            'description': f'图表区，检测到 {len(axis_texts)} 个疑似坐标轴刻度文字',
            'note': '这些文字是识别参考，不要生成为 DOM 元素（由 ECharts 渲染）'
        })

    # 3. 查询输入框
    input_bgs = [l for l in slice_layers if l['width'] > 150 and 28 <= l['height'] <= 40]
    if input_bgs:
        for bg in input_bgs[:5]:
            # 检查左侧是否有标签文字
            labels = [t for t in text_layers
                      if abs(t['top'] - bg['top']) < 10 and
                      abs(t['left'] + t['width'] - bg['left']) < 30]
            if labels:
                recognized.append({
                    'type': 'search-input',
                    'description': f'查询输入框：{labels[0].get("content", "")[:20]} + 输入背景',
                    'rect': {'x': bg['left'], 'y': bg['top'], 'w': bg['width'], 'h': bg['height']}
                })

    # 4. 分页区
    page_btns = [l for l in slice_layers if 28 <= l['width'] <= 40 and 28 <= l['height'] <= 40]
    page_texts = [l for l in text_layers if '共有' in str(l.get('content', '')) or
                  str(l.get('content', '')).isdigit()]
    if len(page_btns) >= 3 and page_texts:
        recognized.append({
            'type': 'pagination',
            'description': f'分页区，{len(page_btns)} 个分页按钮'
        })

    return recognized


def print_report(artboard: dict, flat_layers: List[dict],
                 layout: dict, elements: List[dict]) -> None:
    """输出人类可读的分析报告。"""
    print(f"\n{'='*60}")
    print(f"Artboard: {artboard['name']}")
    print(f"Size: {artboard.get('width', '?')} × {artboard.get('height', '?')}")
    print(f"Total layers: {len(flat_layers)}")
    print(f"{'='*60}\n")

    # 图层类型统计
    type_counts = {}
    for l in flat_layers:
        type_counts[l['type']] = type_counts.get(l['type'], 0) + 1
    print("Layer types:")
    for t, count in sorted(type_counts.items()):
        print(f"  {t:<10} {count}")

    # 布局检测
    print(f"\nLayout detection:")
    print(f"  顶部区: {layout['header_count']} 个")
    print(f"  左侧面板: {layout['left_panel_count']} 个")
    print(f"  中间面板: {layout['center_panel_count']} 个")
    print(f"  右侧面板: {layout['right_panel_count']} 个")
    print(f"\nSuggested components:")
    for comp in layout['suggested_components']:
        print(f"  - {comp}")

    # 元素识别
    if elements:
        print(f"\nRecognized UI elements ({len(elements)}):")
        for el in elements:
            print(f"  [{el['type']}] {el['description']}")

    # 字体列表
    fonts = sorted(set(
        l.get('fontFamily', '') for l in flat_layers
        if l['type'] == 'text' and l.get('fontFamily')
    ))
    if fonts:
        print(f"\nFonts used ({len(fonts)}):")
        for f in fonts:
            print(f"  {f}")

    # 图层清单（前 30 条）
    print(f"\nLayer list (first 30 of {len(flat_layers)}):")
    print(f"  {'z':<4} {'type':<8} {'name':<30} {'x':>6} {'y':>6} {'w':>6} {'h':>6}")
    print(f"  {'-'*70}")
    for l in flat_layers[:30]:
        name = l['name'][:28]
        print(f"  {l['z']:<4} {l['type']:<8} {name:<30} "
              f"{l['left']:>6.0f} {l['top']:>6.0f} {l['width']:>6.0f} {l['height']:>6.0f}")
    if len(flat_layers) > 30:
        print(f"  ... and {len(flat_layers) - 30} more layers")


def main():
    parser = argparse.ArgumentParser(
        description='从 Sketch MeaXure index.html 提取图层数据'
    )
    parser.add_argument('html', help='MeaXure index.html 路径')
    parser.add_argument('artboard', nargs='?', default='0',
                        help='artboard 索引（默认 0）或 --list 列出所有')
    parser.add_argument('--list', action='store_true', help='列出所有 artboard')
    parser.add_argument('--json', action='store_true', help='输出 JSON 而非文字报告')
    parser.add_argument('--out', '-o', help='输出 JSON 到文件')
    args = parser.parse_args()

    data = parse_meaxure_data(args.html)
    artboards = data.get('artboards', [])

    if args.list or not artboards:
        print(f"Artboards ({len(artboards)}):")
        for i, ab in enumerate(artboards):
            print(f"  [{i}] {ab.get('name', '?')}  {ab.get('width')}×{ab.get('height')}")
        return

    try:
        idx = int(args.artboard)
    except ValueError:
        print(f"错误：artboard 索引必须是数字，got: {args.artboard}", file=sys.stderr)
        sys.exit(1)

    if idx >= len(artboards):
        print(f"错误：artboard {idx} 不存在（共 {len(artboards)} 个）", file=sys.stderr)
        sys.exit(1)

    artboard = artboards[idx]
    flat_layers, _ = flatten_layers(artboard.get('layers', []))
    layout = detect_layout(flat_layers)
    elements = recognize_elements(flat_layers)

    if args.json or args.out:
        output = {
            'source': args.html,
            'artboard': {
                'index': idx,
                'name': artboard.get('name'),
                'width': artboard.get('width'),
                'height': artboard.get('height'),
            },
            'layer_count': len(flat_layers),
            'layers': flat_layers,
            'layout': layout,
            'elements': elements,
        }
        json_str = json.dumps(output, ensure_ascii=False, indent=2)
        if args.out:
            with open(args.out, 'w', encoding='utf-8') as f:
                f.write(json_str)
            print(f"Extracted {len(flat_layers)} layers to {args.out}")
        else:
            print(json_str)
    else:
        print_report(artboard, flat_layers, layout, elements)


if __name__ == '__main__':
    main()
