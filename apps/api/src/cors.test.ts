import { describe, expect, it } from "vitest";
import { getAllowedOrigins, resolveCorsOrigin } from "./cors";

describe("API CORS origins", () => {
  it("allows both local web development origins", () => {
    expect(getAllowedOrigins()).toEqual(
      new Set(["http://localhost:3000", "http://localhost:3001"]),
    );
  });

  it("allows exact configured production and preview origins", () => {
    const configured =
      "https://stratin.vercel.app, https://stratin-git-main.vercel.app/";

    expect(resolveCorsOrigin("https://stratin.vercel.app", configured)).toBe(
      "https://stratin.vercel.app",
    );
    expect(
      resolveCorsOrigin("https://stratin-git-main.vercel.app", configured),
    ).toBe("https://stratin-git-main.vercel.app");
  });

  it("rejects lookalike, wildcard, and malformed origins", () => {
    const configured = "https://stratin.vercel.app, *";

    expect(
      resolveCorsOrigin("https://stratin.vercel.app.attacker.test", configured),
    ).toBeUndefined();
    expect(
      resolveCorsOrigin("https://attacker.test", configured),
    ).toBeUndefined();
    expect(resolveCorsOrigin("not-an-origin", configured)).toBeUndefined();
  });
});
