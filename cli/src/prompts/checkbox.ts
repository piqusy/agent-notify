/**
 * Custom checkbox prompt with j/k navigation and ESC to cancel.
 * Based on @inquirer/checkbox source.
 */
import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  useMemo,
  makeTheme,
  isUpKey,
  isDownKey,
  isSpaceKey,
  isNumberKey,
  isEnterKey,
  ValidationError,
  Separator,
} from "@inquirer/core"
import { cursorHide } from "@inquirer/ansi"
import colors from "yoctocolors-cjs"
import figures from "@inquirer/figures"
import { CANCEL } from "./cancel.js"

export { Separator }

// ---- Types ----------------------------------------------------------------

interface NormalizedChoice<V> {
  value: V
  name: string
  short: string
  checkedName: string
  description?: string
  disabled: boolean | string
  checked: boolean
}

type RawChoice<V> =
  | string
  | {
      value: V
      name?: string
      short?: string
      checkedName?: string
      description?: string
      disabled?: boolean | string
      checked?: boolean
    }

export interface CheckboxConfig<V> {
  message: string
  choices: ReadonlyArray<RawChoice<V> | Separator>
  pageSize?: number
  loop?: boolean
  required?: boolean
  validate?: (items: Array<NormalizedChoice<V>>) => boolean | string | Promise<boolean | string>
}

// ---- Helpers ----------------------------------------------------------------

const checkboxTheme = {
  icon: {
    checked: colors.green(figures.circleFilled),
    unchecked: figures.circle,
    cursor: figures.pointer,
  },
  style: {
    disabledChoice: (text: string) => colors.dim(`- ${text}`),
    renderSelectedChoices: <V>(selected: Array<NormalizedChoice<V>>) =>
      selected.map((c) => c.short).join(", "),
    description: (text: string) => colors.cyan(text),
  },
  helpMode: "always" as const,
}

function isSelectable<V>(item: NormalizedChoice<V> | Separator): item is NormalizedChoice<V> {
  return !Separator.isSeparator(item) && !item.disabled
}

function isChecked<V>(item: NormalizedChoice<V> | Separator): item is NormalizedChoice<V> {
  return isSelectable(item) && item.checked
}

function toggle<V>(item: NormalizedChoice<V> | Separator): NormalizedChoice<V> | Separator {
  return isSelectable(item) ? { ...item, checked: !item.checked } : item
}

function normalizeChoices<V>(
  choices: ReadonlyArray<RawChoice<V> | Separator>,
): Array<NormalizedChoice<V> | Separator> {
  return choices.map((choice): NormalizedChoice<V> | Separator => {
    if (Separator.isSeparator(choice)) return choice
    if (typeof choice === "string") {
      return {
        value: choice as unknown as V,
        name: choice,
        short: choice,
        checkedName: choice,
        disabled: false,
        checked: false,
      }
    }
    const name = choice.name ?? String(choice.value)
    return {
      value: choice.value,
      name,
      short: choice.short ?? name,
      checkedName: choice.checkedName ?? name,
      description: choice.description,
      disabled: choice.disabled ?? false,
      checked: choice.checked ?? false,
    }
  })
}

// ---- Prompt ----------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const checkbox: <V>(config: CheckboxConfig<V>) => Promise<V[] | typeof CANCEL> =
  createPrompt(<V>(config: CheckboxConfig<V>, done: (value: V[] | typeof CANCEL) => void): string => {
    const { pageSize = 7, loop = true, required, validate = () => true } = config
    const theme = makeTheme(checkboxTheme, {})

    const [status, setStatus] = useState<"idle" | "loading" | "done">("idle")
    const prefix = usePrefix({ status, theme })
    const [items, setItems] = useState<Array<NormalizedChoice<V> | Separator>>(
      normalizeChoices(config.choices),
    )
    const bounds = useMemo(() => {
      const first = items.findIndex(isSelectable)
      const last = items.findLastIndex(isSelectable)
      if (first === -1) {
        throw new ValidationError("[checkbox] No selectable choices. All choices are disabled.")
      }
      return { first, last }
    }, [items])

    const [active, setActive] = useState(bounds.first)
    const [errorMsg, setError] = useState<string | undefined>()

    useKeypress(async (key) => {
      if (status !== "idle") return

      if (key.name === "escape") {
        setStatus("done")
        done(CANCEL)
        return
      }

      if (isEnterKey(key)) {
        const selection = items.filter(isChecked) as Array<NormalizedChoice<V>>
        const isValid = await validate(selection)
        if (required && !items.some(isChecked)) {
          setError("At least one choice must be selected")
        } else if (isValid === true) {
          setStatus("done")
          done(selection.map((c) => c.value))
        } else {
          setError(typeof isValid === "string" ? isValid : "You must select a valid value")
        }
        return
      }

      if (isUpKey(key) || isDownKey(key) || key.name === "k" || key.name === "j") {
        const isUp = isUpKey(key) || key.name === "k"
        if (loop || (isUp && active !== bounds.first) || (!isUp && active !== bounds.last)) {
          const offset = isUp ? -1 : 1
          let next = active
          do {
            next = (next + offset + items.length) % items.length
          } while (!isSelectable(items[next]!))
          setActive(next)
        }
        return
      }

      if (isSpaceKey(key)) {
        setError(undefined)
        setItems(items.map((choice, i) => (i === active ? toggle(choice) : choice)))
        return
      }

      if (isNumberKey(key)) {
        const selectedIndex = Number(key.name) - 1
        let selectableIndex = -1
        const position = items.findIndex((item) => {
          if (Separator.isSeparator(item)) return false
          selectableIndex++
          return selectableIndex === selectedIndex
        })
        const selectedItem = items[position]
        if (selectedItem && isSelectable(selectedItem)) {
          setActive(position)
          setItems(items.map((choice, i) => (i === position ? toggle(choice) : choice)))
        }
        return
      }
    })

    const message = theme.style.message(config.message, status)
    let description: string | undefined
    const page = usePagination({
      items,
      active,
      renderItem({ item, isActive }: { item: NormalizedChoice<V> | Separator; isActive: boolean; index: number }) {
        if (Separator.isSeparator(item)) return ` ${item.separator}`
        if (item.disabled) {
          const label = typeof item.disabled === "string" ? item.disabled : "(disabled)"
          return (theme.style as typeof checkboxTheme.style).disabledChoice(`${item.name} ${label}`)
        }
        if (isActive) description = item.description
        const checkIcon = item.checked ? theme.icon.checked : theme.icon.unchecked
        const name = item.checked ? item.checkedName : item.name
        const color = isActive ? (x: string) => colors.cyan(x) : (x: string) => x
        const cursor = isActive ? theme.icon.cursor : " "
        return color(`${cursor}${checkIcon} ${name}`)
      },
      pageSize,
      loop,
    })

    if (status === "done") {
      const selection = items.filter(isChecked) as Array<NormalizedChoice<V>>
      const answer = theme.style.answer(
        (theme.style as typeof checkboxTheme.style).renderSelectedChoices(selection),
      )
      return [prefix, message, answer].filter(Boolean).join(" ")
    }

    const helpLine = colors.dim(
      [
        `${colors.bold("↑↓")}/${colors.bold("jk")} navigate`,
        `${colors.bold("space")} toggle`,
        `${colors.bold("enter")} submit`,
        `${colors.bold("esc")} cancel`,
      ].join("  "),
    )

    return [
      [prefix, message].filter(Boolean).join(" "),
      page,
      " ",
      description ? (theme.style as typeof checkboxTheme.style).description(description) : "",
      errorMsg ? theme.style.error(errorMsg) : "",
      helpLine,
    ]
      .filter(Boolean)
      .join("\n")
      .trimEnd() + cursorHide
  })
