/**
 * A select prompt that mirrors @inquirer/select but adds:
 *  - "p" keybinding to preview/play the currently highlighted choice
 *  - "j" / "k" vim-style up/down navigation
 *  - ESC to cancel (via CANCEL sentinel, not throw)
 */
import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  makeTheme,
  isEnterKey,
  isUpKey,
  isDownKey,
  ExitPromptError,
  type Status,
} from "@inquirer/core"
import colors from "yoctocolors-cjs"
import { CANCEL } from "./cancel.js"

// ---- Types ----------------------------------------------------------------

export interface SelectChoice<V> {
  name: string
  value: V
  short?: string
  description?: string
  disabled?: boolean | string
}

export interface SelectWithPreviewConfig<V> {
  message: string
  choices: SelectChoice<V>[]
  default?: V
  pageSize?: number
  loop?: boolean
  /** Called with the current choice value when user presses "p" */
  onPreview?: (value: V) => void
}

// ---- Prompt ---------------------------------------------------------------

const selectTheme = {
  icon: { cursor: "❯" },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const selectWithPreview: <V>(config: SelectWithPreviewConfig<V>) => Promise<V | typeof CANCEL> =
  createPrompt(
  <V>(config: SelectWithPreviewConfig<V>, done: (value: V | typeof CANCEL) => void): string => {
    const { choices, pageSize = 7, loop = true, onPreview } = config
    const theme = makeTheme(selectTheme, {})

    const firstEnabled = choices.findIndex((c) => !c.disabled)
    const defaultIndex =
      config.default !== undefined
        ? choices.findIndex((c) => c.value === config.default)
        : firstEnabled

    const [active, setActive] = useState(defaultIndex === -1 ? 0 : defaultIndex)
    const [status, setStatus] = useState<Status>("idle")

    const prefix = usePrefix({ status, theme })

    useKeypress((key) => {
      if (status === "done") return

      if (key.name === "escape") {
        setStatus("done")
        done(CANCEL)
        return
      }

      if (isEnterKey(key)) {
        const choice = choices[active]
        if (choice && !choice.disabled) {
          setStatus("done")
          done(choice.value)
        }
        return
      }

      if (isUpKey(key) || isDownKey(key) || key.name === "k" || key.name === "j") {
        const direction = (isUpKey(key) || key.name === "k") ? -1 : 1
        let next = active
        let attempts = 0
        do {
          next = (next + direction + choices.length) % choices.length
          attempts++
        } while (choices[next]?.disabled && attempts < choices.length)
        setActive(next)
        return
      }

      if (key.name === "p" && onPreview) {
        const choice = choices[active]
        if (choice && !choice.disabled) {
          onPreview(choice.value)
        }
        return
      }
    })

    const page = usePagination({
      items: choices,
      active,
      renderItem: ({
        item,
        isActive,
      }: {
        item: SelectChoice<V>
        index: number
        isActive: boolean
      }) => {
        if (item.disabled) {
          const label =
            typeof item.disabled === "string" ? item.disabled : "disabled"
          return colors.dim(`  ${item.name} (${label})`)
        }
        if (isActive) {
          return colors.cyan(`${(selectTheme.icon as { cursor: string }).cursor} ${item.name}`)
        }
        return `  ${item.name}`
      },
      pageSize,
      loop,
    })

    const currentChoice = choices[active]
    const description =
      status !== "done" && currentChoice?.description
        ? `\n${colors.cyan(currentChoice.description)}`
        : ""

    const helpBindings: string[] = [
      `${colors.bold("↑↓")}/${colors.bold("jk")} navigate`,
      `${colors.bold("enter")} select`,
    ]
    if (onPreview) {
      helpBindings.push(`${colors.bold("p")} preview sound`)
    }
    helpBindings.push(`${colors.bold("esc")} cancel`)
    const helpTip =
      status !== "done" ? `\n${colors.dim(helpBindings.join("  "))}` : ""

    const header = `${prefix} ${theme.style.message(config.message, status)}`

    if (status === "done") {
      const answer =
        currentChoice?.short ?? currentChoice?.name ?? String(currentChoice?.value)
      return `${header} ${theme.style.answer(answer)}`
    }

    return `${header}\n${page}${description}${helpTip}`
  },
)
