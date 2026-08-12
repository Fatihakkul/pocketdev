import type { Context, MiddlewareFn } from "telegraf";
import { setOwnerId } from "../core/state.js";
import { m } from "../i18n/index.js";
import { currentClaimCode, currentOwnerId, decideAuth } from "./ownership.js";

export const requireAuthorizedUser: MiddlewareFn<Context> = async (ctx, next) => {
  const message = ctx.message;
  const text = message && "text" in message ? message.text : undefined;

  const decision = decideAuth({
    userId: ctx.from?.id,
    ownerId: currentOwnerId(),
    text,
    claimCode: currentClaimCode(),
  });

  switch (decision.kind) {
    case "allow":
      await next();
      return;

    case "claim-ok":
      setOwnerId(decision.userId);
      console.log(`Bot sahiplenildi: user id=${decision.userId}`);
      await ctx.reply(m().auth.claimed);
      return;

    case "claim-bad":
      await ctx.reply(m().auth.wrongCode);
      return;

    default:
      console.warn(`Rejected message from unauthorized user id=${ctx.from?.id ?? "unknown"}`);
      return;
  }
};
