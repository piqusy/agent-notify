/**
 * Custom input prompt with ESC to cancel (via CANCEL sentinel).
 * No j/k — text fields need normal keyboard input.
 * Based on @inquirer/input source.
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

export interface InputConfig {
  message: string
  default?: string
  validate?: (value: string) => boolean | string | Promise<boolean | string>
  transformer?: (value: string, { isFinal }: { isFinal: boolean }) => string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const input: (config: InputConfig) => Promise<string | typeof CANCEL> =
  createPrompt((config: InputConfig, done: (value: string | typeof CANCEL) => void): string => {
    const theme = makeTheme({})
    const [status, setStatus] = useState<Status>("idle")
    const [defaultValue] = useState(config.default ?? "")
    const [errorMsg, setError] = useState<string | undefined>()
    const [value, setValue] = useState("")
    const prefix = usePrefix({ status, theme })

    useKeypress(async (key, rl) => {
      if (status !== "idle") return

      if (key.name === "escape") {
        setStatus("done")
        done(CANCEL)
        return
      }

      if (isEnterKey(key)) {
        const answer = value || defaultValue
        setStatus("loading")

        const isValid = await (config.validate?.(answer) ?? true)
        if (isValid === true) {
          setValue(answer)
          setStatus("done")
          done(answer)
        } else {
          setValue(rl.line)
          setStatus("idle")
          setError(typeof isValid === "string" ? isValid : "You must provide a valid value")
        }
        return
      }

      setValue(rl.line)
      setError(undefined)
    })

    const displayValue = value || defaultValue
    const transformer = config.transformer
    const transformedValue = transformer
      ? transformer(displayValue, { isFinal: status === "done" })
      : displayValue

    const message = theme.style.message(config.message, status)

    if (status === "done") {
      return `${prefix} ${message} ${theme.style.answer(transformedValue)}`
    }

    const defaultHint = defaultValue && !value ? colors.dim(` (${defaultValue})`) : ""
    const errorLine = errorMsg ? `\n${theme.style.error(errorMsg)}` : ""

    return `${prefix} ${message}${defaultHint} ${colors.cyan(value)}${errorLine}`
  })
