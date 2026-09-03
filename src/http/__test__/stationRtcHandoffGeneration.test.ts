import { StationRtcTransport } from "../../rtc/stationRtcTransport";
import { Station } from "../station";

type StationHandoffInternals = {
  rtcConnectionGeneration: number;
  rtcTransport?: StationRtcTransport;
  isRtcHandoffFailureSuperseded: (
    transport: StationRtcTransport,
    connectionGeneration: number
  ) => boolean;
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
