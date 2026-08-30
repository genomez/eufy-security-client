jest.mock("../../logging", () => {
  const stub = { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), trace: jest.fn() };
  return new Proxy({}, { get: () => stub });
});

import { defaultSignalingRegionForCountry, RtcSignalingClient } from "../rtcSignaling";

describe("RtcSignalingClient regional signaling context", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("uses the EU host and web portal headers for FR", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: "sign-value" }),
    } as Response);
    const client = new RtcSignalingClient({
      authToken: "secret-auth-token",
      gtoken: "secret-gtoken",
      stationSn: "station",
      region: "FR",
    });

    await expect(client.fetchSign()).resolves.toBe("sign-value");

    expect(fetchMock).toHaveBeenCalledWith("https://security-smart-eu.eufylife.com/v1/smart/nvr/ws/sign", {
      headers: {
        "Web-Country": "FR",
        "X-Auth-Token": "secret-auth-token",
        "App-Name": "eufy_mega",
        "Model-Type": "WEB",
        GToken: "secret-gtoken",
        Origin: "https://security.eufy.com",
      },
    });
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Country");
    expect(headers).not.toHaveProperty("Language");
    expect(headers).not.toHaveProperty("X-Auth-User");
  });

  it("retains the current default host outside the isolated FR test", () => {
    const client = new RtcSignalingClient({
      authToken: "secret-auth-token",
      gtoken: "secret-gtoken",
      stationSn: "station",
      region: "US",
    });

    expect(client.getWsUrl()).toBe("wss://security-smart.eufylife.com/v1/rtc/ws/join?reqtype=nvr");
  });

  it("preserves an explicit signaling-host override", () => {
    const client = new RtcSignalingClient({
      authToken: "secret-auth-token",
      gtoken: "secret-gtoken",
      stationSn: "station",
      region: "FR",
      smartHost: "signaling.test.invalid",
    });

    expect(client.getWsUrl()).toBe("wss://signaling.test.invalid/v1/rtc/ws/join?reqtype=nvr");
  });

  it("uses the EU cluster in the FR WebSocket auth payload", () => {
    expect(defaultSignalingRegionForCountry("FR")).toBe("EU");
    expect(defaultSignalingRegionForCountry(" fr ")).toBe("EU");
    expect(defaultSignalingRegionForCountry("US")).toBe("US");
    expect(defaultSignalingRegionForCountry()).toBe("US");
  });
});
