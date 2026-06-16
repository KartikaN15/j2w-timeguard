import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cached: Promise<string> | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "ssr";
  if (!cached) {
    cached = (async () => {
      const fp = await FingerprintJS.load();
      const res = await fp.get();
      return res.visitorId;
    })();
  }
  return cached;
}