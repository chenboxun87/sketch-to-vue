<template>
  <img
    v-if="isImage && imgSrc"
    :data-mg-id="element.id"
    :data-mg-name="element.name"
    :style="computedStyle"
    :src="imgSrc"
    :alt="element.name || ''"
  />
  <div
    v-else-if="visible"
    :data-mg-id="element.id"
    :data-mg-name="element.name"
    :style="computedStyle"
    v-html="innerHtml"
  />
</template>

<script>
import {
  buildMgBoxStyle,
  buildMgTextStyle,
  richTextSegmentsToHtml,
  imageStyle,
} from '@/utils/designToVue/mgStyle'

export default {
  name: 'MgElementRenderer',
  props: {
    element: { type: Object, required: true },
    assetFilename: { type: String, default: '' },
    assetBase: { type: String, default: '/static/nt-ai-agent-dialog/assets' },
  },
  computed: {
    visible() {
      return this.element && this.element.renderAs !== 'skip'
    },
    isText() {
      return this.element.renderAs === 'text' || this.element.type === 'text'
    },
    isImage() {
      return this.element.renderAs === 'img' || this.element.type === 'image'
    },
    imgSrc() {
      if (!this.isImage) return ''
      const file = this.assetFilename || this.element.exportSlice
      if (!file || String(file).startsWith('css:')) return ''
      return `${this.assetBase}/${encodeURIComponent(file)}`
    },
    innerHtml() {
      if (!this.isText || this.isImage) return undefined
      if ((this.element.richTextSegments || []).length) {
        return richTextSegmentsToHtml(this.element.richTextSegments)
      }
      if (this.element.content) {
        return String(this.element.content)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      }
      return undefined
    },
    computedStyle() {
      const el = this.element
      if (this.isText) {
        const st = buildMgTextStyle(el)
        st.display = 'block'
        return st
      }
      if (this.isImage) {
        return imageStyle(el, this.imgSrc)
      }
      return buildMgBoxStyle(el)
    },
  },
}
</script>
