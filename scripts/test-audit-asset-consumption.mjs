import {
	pngDimsFromBuffer,
	assetKey,
	aspectVerdict,
	rectOverlap,
	auditAssetConsumption,
} from './audit-asset-consumption.mjs'

let pass = 0, fail = 0
const eq = (got, want, label) => {
	const ok = JSON.stringify(got) === JSON.stringify(want)
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
	ok ? pass++ : fail++
	if (!ok) console.log(`   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
}

// pngDimsFromBuffer
const buf = Buffer.alloc(24)
buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47
buf.writeUInt32BE(286, 16); buf.writeUInt32BE(94, 20)
eq(pngDimsFromBuffer(buf), { w: 286, h: 94 }, 'pngDimsFromBuffer 读 IHDR')
eq(pngDimsFromBuffer(Buffer.alloc(10)), null, 'pngDimsFromBuffer 头太短=null')

// assetKey
eq(assetKey('大屏/小标题/月总指标量@2x.png'), '月总指标量', 'assetKey 去目录/@2x/扩展名')
eq(assetKey('编组 16备份.PNG'), '编组 16备份', 'assetKey 大小写扩展名')

// aspectVerdict
eq(aspectVerdict(144, 126, 286, 94).suggest, { fit: 'cover', position: 'left center' }, 'aspectVerdict 宽条塞方框→cover left')
eq(aspectVerdict(323, 93, 286, 86).distorted, false, 'aspectVerdict 比例相近→不失真')
eq(aspectVerdict(300, 50, 100, 100).suggest, { fit: 'contain', position: 'center center' }, 'aspectVerdict 宽框窄图→contain')
eq(aspectVerdict(0, 0, 1, 1).distorted, false, 'aspectVerdict 零尺寸→不失真')

// rectOverlap
eq(rectOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }), 1, 'rectOverlap 完全重叠=1')
eq(rectOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }), 0, 'rectOverlap 不相交=0')

// auditAssetConsumption 综合
const nodes = [
	{ id: 'a', name: 'icon', rect: { x: 0, y: 0, w: 144, h: 126 }, disposition: { kind: 'render-slice' }, attrs: { exports: [{ path: 'icon.png' }] } },
	{ id: 'b', name: 'gone', rect: { x: 0, y: 0, w: 10, h: 10 }, disposition: { kind: 'render-slice' }, attrs: { exports: [{ path: 'gone.png' }] } },
	{ id: 'c', name: 'ghost', rect: { x: 0, y: 0, w: 10, h: 10 }, disposition: { kind: 'render-vector' }, attrs: { css: ['opacity: 0.5'] } },
	{ id: 'd1', name: 'shareA', rect: { x: 0, y: 0, w: 100, h: 50 }, disposition: { kind: 'render-slice' }, attrs: { exports: [{ path: 'shared.png' }] } },
	{ id: 'd2', name: 'shareB', rect: { x: 0, y: 0, w: 200, h: 80 }, disposition: { kind: 'render-slice' }, attrs: { exports: [{ path: 'shared.png' }] } },
]
const dims = new Map([['icon', { w: 286, h: 94 }], ['shared', { w: 100, h: 50 }]])
const res = auditAssetConsumption(nodes, { get: (k) => (dims.has(k) ? dims.get(k) : null) }, new Set(['icon', 'shared', 'orphan']))
const types = res.issues.map((i) => i.type).sort()
eq(types, ['aspect-distort', 'empty-vector', 'missing-asset', 'shared-file', 'unused-asset'], 'auditAssetConsumption 命中五类')
eq(res.ok, false, 'missing-asset → ok=false')
eq(res.fitSuggest['icon'], { fit: 'cover', position: 'left center' }, 'fitSuggest 含失真切片建议')

// artifact 文本不算双渲染
const tNodes = [
	{ id: 't1', name: 'comp', rect: { x: 0, y: 0, w: 100, h: 20 }, disposition: { kind: 'live-text-static' }, attrs: { content: '月总指标量', css: [] } },
	{ id: 't2', name: 'frag', rect: { x: 0, y: 0, w: 100, h: 20 }, disposition: { kind: 'live-text-static' }, attrs: { content: '月总', css: ['border: 1px solid #979797'] } },
]
const tRes = auditAssetConsumption(tNodes, { get: () => ({ w: 1, h: 1 }) }, new Set())
eq(tRes.issues.filter((i) => i.type === 'text-fragment-overlap').length, 0, 'artifact 碎片文本不计双渲染')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
