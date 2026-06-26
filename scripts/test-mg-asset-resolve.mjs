import {
  buildExportSettingsMap,
  buildNodeExportHints,
  resolveMgImageAsset,
  scanEmbeddedBase64,
} from './mastergo-asset-resolve.mjs'

let failed = 0
function ok(c, m) {
  if (!c) { console.error('FAIL', m); failed++ } else console.log('OK', m)
}

const fd = {
  exportSettings: [
    { id: '11:6171', fileName: '小头像@1x.png', constraint: { value: 1 }, format: 'PNG', name: '小头像' },
    { id: '11:6171', fileName: '小头像@2x.png', constraint: { value: 2 }, format: 'PNG', name: '小头像' },
  ],
}
const map = buildExportSettingsMap(fd)
ok(map.byId['11:6171'].fileName === '小头像@1x.png', 'prefer @1x exportSettings')

const el = { id: '11:6171', type: 'image', imageRef: '194072873611231/194975259148404/a5c69d1f932c7bd071035bc50ae0ffe9.png' }
const r = resolveMgImageAsset(el, {
  exportHints: map.byId,
  exportByName: map.byName,
  exportFiles: ['小头像@2x.png'],
  exportsDir: '/tmp',
  dataDir: '/tmp',
})
ok(r.file === '小头像@2x.png', 'resolve @2x alias')
ok(r.expectedPaths.includes('data/exports/小头像@1x.png'), 'expected path from exportSettings')

const b64 = scanEmbeddedBase64([{ label: 't', text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }])
ok(b64.length === 0, 'skip tiny base64 noise')

const child = {
  id: '11:6493',
  name: 'AI生成白寸衫女孩',
  parentId: '11:6492',
  type: 'image',
  imageRef: '194072873611231/194899954521575/ff5788578c52cb0a8174e9d6762fd3f1.png',
}
const parentHint = {
  '11:6492': { fileName: '默认头像@1x.png', name: '默认头像' },
}
const elementsById = {
  '11:6493': child,
  '11:6492': { id: '11:6492', name: '默认头像', parentId: '11:6762' },
}
const inh = resolveMgImageAsset(child, {
  exportHints: parentHint,
  exportByName: {},
  exportFiles: ['默认头像@1x.png'],
  elementsById,
})
ok(inh.file === '默认头像@1x.png', 'inherit export from parent frame')
ok(inh.inheritedFrom?.id === '11:6492', 'record inheritedFrom')

if (failed) process.exit(1)
console.log('mg-asset-resolve tests passed')
