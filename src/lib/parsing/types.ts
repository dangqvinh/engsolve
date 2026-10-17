export interface ParsedOption { label: string; text: string }
export interface ParsedQuestion {
  number: number | null
  text: string
  options: ParsedOption[]
  warnings: string[]
}
export type AnswerKeyMap = Record<number, string>
