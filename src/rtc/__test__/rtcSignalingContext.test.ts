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
    const phases: string[] = [];
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

    await expect(client.fetchSign({ reportPhase: (phase) => phases.push(phase) })).resolves.toBe("sign-value");

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
    expect(phases).toEqual([
      "fetch_sign_request_dispatching",
      "fetch_sign_request_dispatched",
      "fetch_sign_response_headers",
      "fetch_sign_body_read_start",
      "fetch_sign_body_read_complete",
    ]);
  });

  it("reports and rejects an explicitly aborted sign request", async () => {
    const phases: string[] = [];
    const abortController = new AbortController();
    jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener(
          "abort",
          () => reject(signal.reason instanceof Error ? signal.reason : new Error("aborted")),
          { once: true }
        );
      });
    });
    const client = new RtcSignalingClient({
      authToken: "test-auth-token",
      gtoken: "test-gtoken",
      stationSn: "station",
      region: "FR",
    });
    const request = client.fetchSign({
      signal: abortController.signal,
      reportPhase: (phase) => phases.push(phase),
    });

    abortController.abort(new Error("test sign abort"));

    await expect(request).rejects.toThrow("test sign abort");
    expect(phases).toEqual([
      "fetch_sign_request_dispatching",
      "fetch_sign_request_dispatched",
      "fetch_sign_request_aborted",
    ]);
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
