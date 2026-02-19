import { TemplateDelegate } from 'handlebars'

declare const template: TemplateDelegate<{
  code: string
  brandName: string
  brandColor: string
  logoUrl?: string | null
  supportEmail?: string | null
}>
export default template
