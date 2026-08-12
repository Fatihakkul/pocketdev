/**
 * "Bu konuşmada aynı anda tek bir X" kuralı. Beş runner da bunu ayrı bir
 * `Set<number>` ile kuruyordu; hepsinde aynı hata riski vardı: `finally` unutulup
 * kilidin açık kalması, yani komutun bir daha hiç çalışmaması.
 *
 * `run()` kilidi kendisi bırakır — çağıranın `finally` yazması gerekmez.
 */
export class RunLock {
  private readonly active = new Set<string>();

  isActive(conversationId: string | number): boolean {
    return this.active.has(String(conversationId));
  }

  async run<T>(conversationId: string | number, busyMessage: string, task: () => Promise<T>): Promise<T> {
    const key = String(conversationId);
    if (this.active.has(key)) {
      throw new Error(busyMessage);
    }
    this.active.add(key);
    try {
      return await task();
    } finally {
      this.active.delete(key);
    }
  }
}

/**
 * Konuşma başına yaşayan, açıkça kapatılması gereken oturumlar (dev sunucu,
 * OTA linki). Kapatma mantığı oturumun kendisinde; burası yalnızca kayıt tutar
 * ve kapanış bittiğinde kaydı düşürür.
 */
export class SessionStore<T extends { stop(): Promise<void> | void }> {
  private readonly sessions = new Map<string, T>();

  get(conversationId: string | number): T | undefined {
    return this.sessions.get(String(conversationId));
  }

  has(conversationId: string | number): boolean {
    return this.sessions.has(String(conversationId));
  }

  set(conversationId: string | number, session: T): void {
    this.sessions.set(String(conversationId), session);
  }

  /** Kaydı düşürüp oturumu kapatır. Kayıt yoksa `false`. */
  async stop(conversationId: string | number): Promise<boolean> {
    const key = String(conversationId);
    const session = this.sessions.get(key);
    if (!session) return false;
    // Önce kaydı düşürüyoruz: kapatma sırasında gelen ikinci bir /stop aynı
    // oturumu tekrar kapatmaya çalışmasın.
    this.sessions.delete(key);
    await session.stop();
    return true;
  }

  /** Süreç kapanışında (SIGTERM/SIGINT) hepsini toplamak için. */
  stopAll(): void {
    for (const key of [...this.sessions.keys()]) {
      void this.stop(key);
    }
  }
}
