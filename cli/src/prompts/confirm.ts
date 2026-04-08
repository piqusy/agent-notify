/**
 * Custom confirm prompt with:
 *  - j/k or y/n to toggle between Yes and No
 *  - ESC to cancel (via CANCEL sentinel)
 * Based on @inquirer/confirm source.
 */
import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isEnterKey,
  makeTheme,
  type Status,
} from "@inquirer/core"
import colors from "yoctocolors-cjs"
import { CANCEL } from "./cancel.js"

export interface ConfirmConfig {
  message: string
  default?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const confirm: (config: ConfirmConfig) => Promise<boolean | typeof CANCEL> =
  createPrompt((config: ConfirmConfig, done: (value: boolean | typeof CANCEL) => void): string => {
    const defaultValue = config.default !== false  // default: true
    const theme = makeTheme({})
    const [status, setStatus] = useState<Status>("idle")
    const [value, setValue] = useState<boolean>(defaultValue)
    const [interacted, setInteracted] = useState(false)
    const prefix = usePrefix({ status, theme })

    useKeypress((key, rl) => {
      if (status !== "idle") return

      if (key.name === "escape") {
        setStatus("done")
        done(CANCEL)
        return
      }

      if (isEnterKey(key)) {
        setStatus("done")
        done(value)
        return
      }

      // y/n direct toggle
      if (key.name === "y") {
        setValue(true)
        setInteracted(true)
        return
      }
      if (key.name === "n") {
        setValue(false)
        setInteracted(true)
        return
      }

      // Fallback: interpret typed character
      setValue(/^(y|yes)/i.test(rl.line))
      setInteracted(true)
    })

    const defaultHint = defaultValue ? "Y/n" : "y/N"
    const message = theme.style.message(config.message, status)

    if (status === "done") {
      const answer = theme.style.answer(value ? "Yes" : "No")
      return `${prefix} ${message} ${answer}`
    }

    const current = interacted
      ? colors.cyan(value ? "Yes" : "No")
      : colors.dim(defaultHint)

    const helpTip = colors.dim(
      `  ${colors.bold("y")} yes  ${colors.bold("n")} no  ${colors.bold("enter")} confirm  ${colors.bold("esc")} cancel`,
    )
    return `${prefix} ${message} ${current}\n${helpTip}`
  })
