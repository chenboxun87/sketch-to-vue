/**
 * MeaXure 静态切图 URL 解析（A 轨道 §3.9 消费侧标准实现）
 *
 * 要点：
 * - 保留 icon/、pic/ 等子目录（禁止 basename-only）
 * - Windows 绝对路径先 \ → /，再取 /assets/ 之后段
 * - 每段 encodeURIComponent，斜杠保留
 *
 * Vue 2 项目：复制为 pageDir/layerUrl.js，import resolveStaticPublicUrl from '@/utils/staticPublicUrl'
 */

/** @param {string} filePath MeaXure source.file 或已相对路径如 icon/feature-a.png */
export function relativeAssetPath(filePath) {
	const raw = String(filePath || '').replace(/\\/g, '/').trim()
	if (!raw) return ''
	if (raw.includes('/assets/')) {
		return raw.slice(raw.indexOf('/assets/') + '/assets/'.length)
	}
	return raw.replace(/^\/+/, '')
}

/**
 * @param {string} staticBase 如 `/static/my-module/design-assets`
 * @param {string} filePathOrRel
 * @param {(url: string) => string} [resolvePublic] 默认原样；Vue 项目传入 resolveStaticPublicUrl
 */
export function getLayerPublicPath(staticBase, filePathOrRel, resolvePublic = (u) => u) {
	const rel = relativeAssetPath(filePathOrRel)
	if (!rel) return ''
	const encoded = rel.split('/').map((seg) => encodeURIComponent(seg)).join('/')
	return resolvePublic(`${staticBase}/${encoded}`)
}

/** 全屏背景切片名（MeaXure 常见导出命名，非业务语义） */
export const FULLSCREEN_BACKDROP_BASENAMES = new Set([
	'BG备份.png',
	'BG.png',
	'backdrop.png',
	'背景.png',
	'background.png',
])

/** ghost 面积占画板比例低于此值时，禁止 backdrop 进入 icon 候选 */
export const SMALL_GHOST_AREA_RATIO = 0.35

export function isFullscreenBackdropFile(filePath, boardArea, gapRect) {
	const base = relativeAssetPath(filePath).split('/').pop() || ''
	if (!FULLSCREEN_BACKDROP_BASENAMES.has(base)) return false
	if (!gapRect || !boardArea) return true
	const area = (gapRect.w || 0) * (gapRect.h || 0)
	return area >= boardArea * 0.35
}
