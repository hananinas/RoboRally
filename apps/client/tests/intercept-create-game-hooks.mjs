export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (!url.endsWith('/game/GameFactory.js')) return result
  const source = result.source.toString()
    .replace('export function createGame(', 'function __realCreateGame(')
    + `
export function createGame(mapName, name) {
  const game = __realCreateGame(mapName, name)
  globalThis.__onGameCreated?.(game)
  return game
}
`
  return { ...result, source }
}
