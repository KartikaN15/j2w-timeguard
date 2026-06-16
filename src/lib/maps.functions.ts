import { createServerFn } from "@tanstack/react-start";

export const expandMapUrl = createServerFn({ method: "GET" })
  .validator((url: unknown) => {
    if (typeof url !== "string") throw new Error("URL must be a string");
    return url;
  })
  .handler(async ({ data: url }) => {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; J2WAttendance/1.0)",
        },
      });
      return { finalUrl: res.url };
    } catch {
      return { finalUrl: null };
    }
  });
