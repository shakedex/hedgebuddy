import { Braces, Clock, Hash, FileText } from 'lucide-react'

export interface TemplateItem {
  label: string
  value: string
  icon: typeof Braces
  /** If set, this chip opens a format configurator before inserting. */
  configurable?: true
  /** Preset formats for configurable items. */
  presets?: { label: string; value: string; example: string }[]
}

export const DATE_PRESETS: TemplateItem['presets'] = [
  { label: 'Date (ISO)',      value: '{{date}}',                    example: '2026-04-11' },
  { label: 'US Date',         value: '{{date:MM/DD/YYYY}}',         example: '04/11/2026' },
  { label: 'EU Date',         value: '{{date:DD.MM.YYYY}}',         example: '11.04.2026' },
  { label: 'Compact',         value: '{{date:YYYYMMDD}}',           example: '20260411' },
  { label: 'Time 24h',        value: '{{date:HH:mm:ss}}',           example: '14:30:05' },
  { label: 'Time 24h short',  value: '{{date:HH:mm}}',              example: '14:30' },
  { label: 'Full datetime',   value: '{{datetime}}',                example: '2026-04-11T14:30:05Z' },
  { label: 'Date + Time',     value: '{{date:YYYY-MM-DD_HH-mm-ss}}', example: '2026-04-11_14-30-05' },
  { label: 'Unix timestamp',  value: '{{timestamp}}',               example: '1776192605' },
]

export const TEMPLATE_ITEMS: TemplateItem[] = [
  { label: 'App ID',        value: '{{app_id}}',        icon: Braces },
  { label: 'Event Name',    value: '{{event_name}}',    icon: Braces },
  { label: 'Event Summary', value: '{{event_summary}}', icon: FileText },
  { label: 'Date / Time',   value: '{{date}}',          icon: Clock, configurable: true, presets: DATE_PRESETS },
  { label: 'Counter',       value: '{{counter}}',       icon: Hash },
]
