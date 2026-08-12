/**
 * Workspace dışındaki klasörleri "sanki workspace altındaymış gibi" gösteren
 * kayıt defteri. Sadece depolama yapar; hangi ismin geçerli olduğu, çakışmanın
 * nasıl çözüleceği gibi kurallar `workspace.ts`'te — böylece iki modül
 * birbirini import etmek zorunda kalmıyor.
 *
 * Kayıtlar BELLEKTE: bot yeniden başlayınca bağlı projeler kaybolur ve tekrar
 * eklenmeleri gerekir. Kalıcılık istenirse tek yapılacak şey bu Map'i
 * `state.ts` üzerinden diske yazmak.
 */
const linked = new Map<string, string>();

export interface LinkedProject {
  name: string;
  path: string;
}

export function register(name: string, absolutePath: string): void {
  linked.set(name, absolutePath);
}

export function unregister(name: string): boolean {
  return linked.delete(name);
}

export function pathOf(name: string): string | undefined {
  return linked.get(name);
}

export function isLinked(name: string): boolean {
  return linked.has(name);
}

export function names(): string[] {
  return [...linked.keys()];
}

export function entries(): LinkedProject[] {
  return [...linked].map(([name, path]) => ({ name, path }));
}
