import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { looksLikeStaleSession } from "../../src/claude/claudeRunner.js";

/**
 * Bu karar yanlış olduğunda kullanıcı sessizce hafızasını kaybediyor: eskiden
 * HER hata oturumu siliyordu, yani her deploy (çocuk süreç öldürülüyor) ve 10
 * dakikayı aşan her uzun görev konuşma geçmişini uçuruyordu.
 */
describe("looksLikeStaleSession", () => {
  test("a timeout does not mean the session is stale", () => {
    assert.equal(looksLikeStaleSession({ timedOut: true, message: "timed out" }), false);
  });

  test("a terminated process does not mean the session is stale", () => {
    // Deploy sırasında pm2 süreci yeniden başlatırken tam olarak bu oluyor.
    assert.equal(looksLikeStaleSession({ isTerminated: true, message: "killed" }), false);
  });

  test("a signal does not mean the session is stale", () => {
    assert.equal(looksLikeStaleSession({ signal: "SIGTERM", message: "killed" }), false);
  });

  test("an ordinary non-zero exit is treated as a stale session", () => {
    assert.equal(looksLikeStaleSession({ exitCode: 1, message: "no conversation found" }), true);
  });

  test("a plain error is treated as a stale session", () => {
    assert.equal(looksLikeStaleSession(new Error("unexpected token in JSON")), true);
  });

  test("a missing error object does not crash the check", () => {
    assert.equal(looksLikeStaleSession(undefined), true);
    assert.equal(looksLikeStaleSession(null), true);
  });
});
