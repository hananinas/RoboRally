export function isValidUsername(username: string): boolean {
  const length = Array.from(username).length
  return length >= 1 && length <= 30
}
