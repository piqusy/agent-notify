import { PassThrough } from "node:stream"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExitPromptError } from "@inquirer/core"
import { ask, CANCEL } from "../prompts/cancel.js"
import { checkbox, Separator } from "../prompts/checkbox.js"
import { confirm } from "../prompts/confirm.js"
import { input } from "../prompts/input.js"
import { selectWithPreview } from "../prompts/select-with-preview.js"

type PromptInput = PassThrough & {
  isTTY: boolean
  setRawMode: (mode: boolean) => void
}

type PromptContext = {
  input: PromptInput
  output: PassThrough
  clearPromptOnDone: boolean
}

const KEY_DELAY_MS = 5

function createPromptContext(): PromptContext {
  const input = new PassThrough() as PromptInput
  input.isTTY = true
  input.setRawMode = () => undefined
  const output = new PassThrough()
  return { input, output, clearPromptOnDone: true }
}

function sleep(ms = KEY_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
}

async function runPrompt<TResult, TConfig>(
  prompt: (config: TConfig, context?: PromptContext) => Promise<TResult>,
  config: TConfig,
  keys: string[],
): Promise<{ answer: TResult; rendered: string }> {
  const context = createPromptContext()
  let rendered = ""
  context.output.on("data", (chunk: Buffer | string) => {
    rendered += chunk.toString()
  })

  const promptPromise = prompt(config, context)
  await sleep()

  for (const key of keys) {
    context.input.write(key)
    await sleep()
  }

  const answer = await promptPromise
  await sleep()
  return { answer, rendered: stripAnsi(rendered) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ask", () => {
  it("returns resolved prompt values unchanged", async () => {
    await expect(ask(Promise.resolve("done"))).resolves.toBe("done")
  })

  it("turns the CANCEL sentinel into an ExitPromptError", async () => {
    await expect(ask(Promise.resolve(CANCEL))).rejects.toBeInstanceOf(ExitPromptError)
  })
})

describe("confirm", () => {
  it("supports y/n toggles before confirming", async () => {
    const { answer } = await runPrompt(confirm, { message: "Continue?", default: false }, ["y", "\r"])
    expect(answer).toBe(true)
  })

  it("returns CANCEL on escape", async () => {
    const { answer } = await runPrompt(confirm, { message: "Continue?" }, ["\u001b"])
    expect(answer).toBe(CANCEL)
  })
})

describe("input", () => {
  it("shows validation feedback and accepts a later valid value", async () => {
    const { answer, rendered } = await runPrompt(
      input,
      {
        message: "Project name",
        validate: (value: string) => value.length > 0 || "A value is required",
      },
      ["\r", "o", "k", "\r"],
    )

    expect(answer).toBe("ok")
    expect(rendered).toContain("A value is required")
  })

  it("returns CANCEL on escape", async () => {
    const { answer } = await runPrompt(input, { message: "Project name" }, ["\u001b"])
    expect(answer).toBe(CANCEL)
  })
})

describe("selectWithPreview", () => {
  it("skips disabled choices, previews on highlight, and returns the selected value", async () => {
    const previews = vi.fn()

    const { answer } = await runPrompt(
      selectWithPreview,
      {
        message: "Sound",
        choices: [
          { name: "Morse", value: "morse" },
          { name: "Blocked", value: "blocked", disabled: "missing" },
          { name: "Submarine", value: "submarine" },
        ],
        previewOnHighlight: true,
        onPreview: previews,
      },
      ["j", "\r"],
    )

    expect(answer).toBe("submarine")
    expect(previews.mock.calls).toEqual([["morse"], ["submarine"]])
  })

  it("supports manual preview with the p key", async () => {
    const previews = vi.fn()

    const { answer } = await runPrompt(
      selectWithPreview,
      {
        message: "Sound",
        choices: [
          { name: "Morse", value: "morse" },
          { name: "Submarine", value: "submarine" },
        ],
        onPreview: previews,
      },
      ["j", "p", "\r"],
    )

    expect(answer).toBe("submarine")
    expect(previews).toHaveBeenCalledTimes(1)
    expect(previews).toHaveBeenCalledWith("submarine")
  })

  it("returns CANCEL on escape", async () => {
    const { answer } = await runPrompt(
      selectWithPreview,
      {
        message: "Sound",
        choices: [{ name: "Morse", value: "morse" }],
      },
      ["\u001b"],
    )

    expect(answer).toBe(CANCEL)
  })
})

describe("checkbox", () => {
  it("toggles multiple selections while skipping separators and disabled choices during navigation", async () => {
    const { answer } = await runPrompt(
      checkbox,
      {
        message: "Events",
        choices: [
          { name: "Done", value: "done" },
          new Separator("---"),
          { name: "Blocked", value: "blocked", disabled: "unavailable" },
          { name: "Question", value: "question" },
        ],
      },
      [" ", "j", " ", "\r"],
    )

    expect(answer).toEqual(["done", "question"])
  })

  it("shows the required-selection error before allowing submission", async () => {
    const { answer, rendered } = await runPrompt(
      checkbox,
      {
        message: "Events",
        choices: [{ name: "Done", value: "done" }],
        required: true,
      },
      ["\r", " ", "\r"],
    )

    expect(answer).toEqual(["done"])
    expect(rendered).toContain("At least one choice must be selected")
  })

  it("returns CANCEL on escape", async () => {
    const { answer } = await runPrompt(
      checkbox,
      {
        message: "Events",
        choices: [{ name: "Done", value: "done" }],
      },
      ["\u001b"],
    )

    expect(answer).toBe(CANCEL)
  })
})
