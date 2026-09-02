import { MegaHTTPApi, megaLoginHash, type MegaSession } from "../megaApi";
import { ResponseErrorCode } from "../types";

jest.mock("../../logging", () => {
  const stub = { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), trace: jest.fn() };
  return new Proxy({}, { get: () => stub });
});

/**
 * Exercises the REAL EufySecurity.registerMegaPushToken (not a copy) by invoking it with a minimal
 * mocked `this`, so the best-effort v6-push wiring is genuinely covered:
 *  - no register when there is no valid v6 session (not-yet-migrated account);
 *  - register when a valid session exists;
 *  - a v6 failure is swallowed (never propagates — legacy push is unaffected).
 *
 * Importing the full EufySecurity class would pull in P2P/MQTT/etc.; calling the method off the
 * prototype with a stub context keeps the test light while still testing the shipped code path.
 */
import { EufySecurity } from "../../eufysecurity";

type MegaStub = Pick<MegaHTTPApi, "hasValidSession" | "registerPushToken" | "exportSession">;

const openudid = "abc123".padEnd(32, "0");
const session: MegaSession = {
  ab: "US",
  openudid,
  cloud_token: "cloud-token",
  cloud_token_expiration: 9999999999,
  user_id: "user-id",
};

function withSession(mega: Pick<MegaHTTPApi, "hasValidSession" | "registerPushToken">): MegaStub {
  return {
    ...mega,
    exportSession: jest.fn().mockReturnValue(session),
  } as unknown as MegaStub;
}

function makeCtx(mega: MegaStub | undefined, opts?: { failGetMega?: boolean }) {
  const warn = jest.fn();
  const ctx = {
    megaApi: mega as MegaHTTPApi | undefined,
    config: { username: "user@example.com", password: "pass", country: "US" },
    persistentData: { openudid },
    writePersistentData: jest.fn(),
    getMegaApi: jest.fn(async () => {
      if (opts?.failGetMega) throw new Error("init failed");
      return mega as MegaHTTPApi;
    }),
  } as unknown as EufySecurity;
  return { ctx, warn };
}

const register = (ctx: EufySecurity, token: string) =>
  (EufySecurity.prototype as unknown as { registerMegaPushToken(t: string): Promise<void> }).registerMegaPushToken.call(
    ctx,
    token
  );

describe("EufySecurity.registerMegaPushToken (v6 best-effort)", () => {
  afterEach(() => jest.clearAllMocks());

  it("registers when a valid v6 session exists", async () => {
    const mega = withSession({
      hasValidSession: () => true,
      registerPushToken: jest.fn().mockResolvedValue({ code: 0, msg: "ok" }),
    });
    const { ctx } = makeCtx(mega);
    await register(ctx, "tok");
    expect(mega.registerPushToken).toHaveBeenCalledWith("tok");
    expect(mega.registerPushToken).toHaveBeenCalledTimes(1);
    expect(mega.exportSession).toHaveBeenCalledWith(megaLoginHash("user@example.com", "pass", openudid));
    expect((ctx as unknown as { persistentData: { megaApi?: MegaSession } }).persistentData.megaApi).toBe(session);
    expect((ctx as unknown as { writePersistentData: jest.Mock }).writePersistentData).toHaveBeenCalledTimes(1);
  });

  it.each([
    ResponseErrorCode.CODE_NEED_NEGOTIATE_KEY,
    ResponseErrorCode.CODE_SIGNATURE_ERROR,
  ])("retries once after identity rejection code %s and persists the refreshed session", async (code) => {
    const mega = withSession({
      hasValidSession: () => true,
      registerPushToken: jest
        .fn()
        .mockResolvedValueOnce({ code, msg: "get identity error" })
        .mockResolvedValueOnce({ code: 0, msg: "ok" }),
    });
    const { ctx } = makeCtx(mega);
    await register(ctx, "tok");
    expect(mega.registerPushToken).toHaveBeenCalledTimes(2);
    expect(mega.registerPushToken).toHaveBeenNthCalledWith(1, "tok");
    expect(mega.registerPushToken).toHaveBeenNthCalledWith(2, "tok");
    expect(mega.exportSession).toHaveBeenCalledTimes(1);
    expect((ctx as unknown as { persistentData: { megaApi?: MegaSession } }).persistentData.megaApi).toBe(session);
    expect((ctx as unknown as { writePersistentData: jest.Mock }).writePersistentData).toHaveBeenCalledTimes(1);
  });

  it("stops after one identity retry and does not persist another rejected session", async () => {
    const mega = withSession({
      hasValidSession: () => true,
      registerPushToken: jest.fn().mockResolvedValue({
        code: ResponseErrorCode.CODE_NEED_NEGOTIATE_KEY,
        msg: "get identity error",
      }),
    });
    const { ctx } = makeCtx(mega);
    await expect(register(ctx, "tok")).resolves.toBeUndefined();
    expect(mega.registerPushToken).toHaveBeenCalledTimes(2);
    expect(mega.exportSession).not.toHaveBeenCalled();
    expect((ctx as unknown as { writePersistentData: jest.Mock }).writePersistentData).not.toHaveBeenCalled();
  });

  it("skips register when there is no valid session", async () => {
    const mega = withSession({ hasValidSession: () => false, registerPushToken: jest.fn() });
    const { ctx } = makeCtx(mega);
    await register(ctx, "tok");
    expect(mega.registerPushToken).not.toHaveBeenCalled();
    expect(mega.exportSession).not.toHaveBeenCalled();
    expect((ctx as unknown as { writePersistentData: jest.Mock }).writePersistentData).not.toHaveBeenCalled();
  });

  it("never throws when the v6 register rejects (legacy push unaffected)", async () => {
    const mega = withSession({
      hasValidSession: () => true,
      registerPushToken: jest.fn().mockRejectedValue(new Error("401")),
    });
    const { ctx } = makeCtx(mega);
    await expect(register(ctx, "tok")).resolves.toBeUndefined();
    expect(mega.exportSession).not.toHaveBeenCalled();
    expect((ctx as unknown as { writePersistentData: jest.Mock }).writePersistentData).not.toHaveBeenCalled();
  });

  it("never throws when getMegaApi itself fails", async () => {
    const { ctx } = makeCtx(undefined, { failGetMega: true });
    await expect(register(ctx, "tok")).resolves.toBeUndefined();
  });

  it("does not throw on a non-zero register code", async () => {
    const mega = withSession({
      hasValidSession: () => true,
      registerPushToken: jest.fn().mockResolvedValue({ code: 10000, msg: "fail" }),
    });
    const { ctx } = makeCtx(mega);
    await expect(register(ctx, "tok")).resolves.toBeUndefined();
    expect(mega.registerPushToken).toHaveBeenCalledTimes(1);
    expect(mega.exportSession).not.toHaveBeenCalled();
    expect((ctx as unknown as { writePersistentData: jest.Mock }).writePersistentData).not.toHaveBeenCalled();
  });
});
