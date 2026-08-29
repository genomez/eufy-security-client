import { EventEmitter } from "events";

import { connectAndWaitForRtcSession, StationRtcTransport } from "../stationRtcTransport";
import { RtcSession } from "../rtcSession";

class FakeRtcSession extends EventEmitter {
  public readonly close = jest.fn();

  constructor(private readonly connectImpl: () => Promise<void>) {
    super();
  }

  public connect(): Promise<void> {
    return this.connectImpl();
  }
}

const asRtcSession = (session: FakeRtcSession): RtcSession => session as unknown as RtcSession;

describe("connectAndWaitForRtcSession", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("cleans up the timeout when connect rejects before the connected event", async () => {
    const session = new FakeRtcSession(async () => {
      throw new Error("signaling failed");
    });

    await expect(connectAndWaitForRtcSession(asRtcSession(session), 15_000)).rejects.toThrow("signaling failed");

    expect(jest.getTimerCount()).toBe(0);
    expect(session.eventNames()).toEqual([]);
    jest.runOnlyPendingTimers();
  });

  it("rejects a timeout without leaving timers or event listeners", async () => {
    const session = new FakeRtcSession(() => new Promise<void>(() => undefined));
    const result = expect(connectAndWaitForRtcSession(asRtcSession(session), 15_000)).rejects.toThrow(
      "T9000 RTC handoff timeout"
    );

    jest.advanceTimersByTime(15_000);

    await result;
    expect(jest.getTimerCount()).toBe(0);
    expect(session.eventNames()).toEqual([]);
  });

  it("resolves on connected and removes its timeout and listeners", async () => {
    const session = new FakeRtcSession(async () => {
      session.emit("connected");
    });

    await expect(connectAndWaitForRtcSession(asRtcSession(session), 15_000)).resolves.toBeUndefined();

    expect(jest.getTimerCount()).toBe(0);
    expect(session.eventNames()).toEqual([]);
  });
});

describe("StationRtcTransport handoff failure", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps the working session and leaves no timer when replacement connect fails", async () => {
    const oldSession = new FakeRtcSession(async () => undefined);
    const replacement = new FakeRtcSession(async () => {
      throw new Error("replacement signaling failed");
    });
    const transport = new StationRtcTransport(
      "station",
      "admin",
      { authToken: "test", userId: "user", region: "US" },
      10_000
    );
    const internal = transport as unknown as {
      connected: boolean;
      session: RtcSession;
      createSession: () => RtcSession;
    };
    internal.connected = true;
    internal.session = asRtcSession(oldSession);
    internal.createSession = () => asRtcSession(replacement);

    await expect(transport.handoffConnect()).resolves.toBe(false);

    expect(internal.session).toBe(asRtcSession(oldSession));
    expect(oldSession.close).not.toHaveBeenCalled();
    expect(replacement.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.runOnlyPendingTimers();
  });
});
