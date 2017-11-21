'use strict'
const promisify = use('promisify')
const rtfToHTML = promisify(require('@iarna/rtf-to-html').fromString)

module.exports = async rtf => {
  const html = await rtfToHTML(rtf)
  return '<!DOCTYPE html>' + html.replace(/<[/](\w+)><\1>/g, '')
}
