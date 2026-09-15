import { StationRtcTransport } from "../../rtc/stationRtcTransport";
import { Station } from "../station";

type StationHandoffInternals = {
  rtcConnectedAt?: number;
  rtcConnectionGeneration: number;
  rtcTransport?: StationRtcTransport;
  getRtcHandoffRetryBudget: (delayMs?: number) => {
    canRetry: boolean;
    primarySessionAgeMs?: number;
    safeSessionAgeMs: number;
    remainingSafeMs: number;
    retryTimeoutMs: number;
    delayMs: number;
  };
  isRtcHandoffFailureSuperseded: (transport: StationRtcTransport, connectionGeneration: number) => boolean;
};

const transport = (connected: boolean, commandReady: boolean): StationRtcTransport =>
  ({
    isConnected: () => connected,
    isCommandChannelReady: () => commandReady,
  }) as StationRtcTransport;

describe("Station RTC handoff generation guard", () => {
  it("recognizes a healthy newer primary connection", () => {
    const currentTransport = transport(true, true);
    const station = Object.create(Station.prototype) as StationHandoffInternals;
    station.rtcConnectionGeneration = 2;
    station.rtcTransport = currentTransport;

    expect(station.isRtcHandoffFailureSuperseded(currentTransport, 1)).toBe(true);
  });

  it("does not suppress a current or unhealthy handoff failure", () => {
    const currentTransport = transport(true, true);
    const station = Object.create(Station.prototype) as StationHandoffInternals;
    station.rtcConnectionGeneration = 2;
    station.rtcTransport = currentTransport;

    expect(station.isRtcHandoffFailureSuperseded(currentTransport, 2)).toBe(false);
    expect(station.isRtcHandoffFailureSuperseded(transport(true, true), 1)).toBe(false);

    const stalledTransport = transport(true, false);
    station.rtcTransport = stalledTransport;
    expect(station.isRtcHandoffFailureSuperseded(stalledTransport, 1)).toBe(false);
  });
});

describe("Station RTC handoff retry budget", () => {
  const originalSafeSessionMs = process.env.RTC_HANDOFF_SAFE_SESSION_MS;
  const originalConnectTimeoutMs = process.env.RTC_CONNECT_TIMEOUT_MS;
  const originalMinRetryMs = process.env.RTC_HANDOFF_MIN_RETRY_MS;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-15T12:00:00Z"));
    delete process.env.RTC_HANDOFF_SAFE_SESSION_MS;
    delete process.env.RTC_CONNECT_TIMEOUT_MS;
    delete process.env.RTC_HANDOFF_MIN_RETRY_MS;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalSafeSessionMs === undefined) delete process.env.RTC_HANDOFF_SAFE_SESSION_MS;
    else process.env.RTC_HANDOFF_SAFE_SESSION_MS = originalSafeSessionMs;
    if (originalConnectTimeoutMs === undefined) delete process.env.RTC_CONNECT_TIMEOUT_MS;
    else process.env.RTC_CONNECT_TIMEOUT_MS = originalConnectTimeoutMs;
    if (originalMinRetryMs === undefined) delete process.env.RTC_HANDOFF_MIN_RETRY_MS;
    else process.env.RTC_HANDOFF_MIN_RETRY_MS = originalMinRetryMs;
  });

  const stationAtAge = (ageMs: number): StationHandoffInternals => {
    const station = Object.create(Station.prototype) as StationHandoffInternals;
    station.rtcConnectedAt = Date.now() - ageMs;
    return station;
  };

  it("allows a full replacement timeout while the retained session is young", () => {
    expect(stationAtAge(270_000).getRtcHandoffRetryBudget()).toMatchObject({
      canRetry: true,
      primarySessionAgeMs: 270_000,
      safeSessionAgeMs: 335_000,
      remainingSafeMs: 65_000,
      retryTimeoutMs: 45_000,
    });
  });

  it("shortens a retry to the remaining safe session lifetime", () => {
    expect(stationAtAge(325_000).getRtcHandoffRetryBudget()).toMatchObject({
      canRetry: true,
      remainingSafeMs: 10_000,
      retryTimeoutMs: 10_000,
    });
  });

  it("rejects a retry or backoff that would cross the safe deadline", () => {
    expect(stationAtAge(331_000).getRtcHandoffRetryBudget()).toMatchObject({
      canRetry: false,
      remainingSafeMs: 4_000,
      retryTimeoutMs: 4_000,
    });
    expect(stationAtAge(301_000).getRtcHandoffRetryBudget(30_000)).toMatchObject({
      canRetry: false,
      remainingSafeMs: 4_000,
      retryTimeoutMs: 4_000,
      delayMs: 30_000,
    });
  });
});
