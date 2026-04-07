// macOS system alert sounds available in /System/Library/Sounds/
export const BUILTIN_SOUNDS = [
  "Basso", "Blow", "Bottle", "Frog", "Funk",
  "Glass", "Hero", "Morse", "Ping", "Pop",
  "Purr", "Sosumi", "Submarine", "Tink",
] as const

export type BuiltinSound = (typeof BUILTIN_SOUNDS)[number]

/**
 * Resolve a sound value. Pass-through: null = silent, string = name or path.
 * Used by platform adapters before calling OS notification commands.
 */
export function resolveSound(sound: string | null): string | null {
  return sound
}
