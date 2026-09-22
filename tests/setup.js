import $ from 'jquery'

globalThis.$ = $
globalThis.jQuery = $
window.$ = $
window.jQuery = $

$.fn.sortable = function () {
  return this
}
