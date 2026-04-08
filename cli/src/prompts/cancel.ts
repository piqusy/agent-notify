/**
 * Shared cancel sentinel for all custom prompts.
 *
 * When ESC is pressed, prompts call `done(CANCEL as any)`. The returned
 * promise then resolves with CANCEL rather than rejecting, letting
 * @inquirer/core clean up normally. The `ask()` wrapper converts that
 * resolved-with-CANCEL back into a thrown `ExitPromptError` so callers
 * only need to catch one error type.
 */
import { ExitPromptError } from "@inquirer/core"

/** Opaque sentinel value returned by prompts when the user presses ESC. */
export const CANCEL = Symbol("cancel")

/**
 * Wraps any custom prompt so that a CANCEL resolution becomes an
 * ExitPromptError rejection.
 *
 * @example
 *   const value = await ask(myPrompt({ message: "Pick one", choices }))
 */
export async function ask<T>(promise: Promise<T | typeof CANCEL>): Promise<T> {
  const result = await promise
  if (result === CANCEL) throw new ExitPromptError()
  return result as T
}
