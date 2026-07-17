import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VerificationCodeInput, sanitizeVerificationCode } from "./VerificationCodeInput";

describe("VerificationCodeInput", () => {
  it("keeps leading zeroes and accepts pasted digits as a string", () => {
    expect(sanitizeVerificationCode("00 12-34xyz56")).toBe("001234");
    expect(sanitizeVerificationCode("012345")).toBe("012345");
  });

  it("limits the code to six digits", () => {
    expect(sanitizeVerificationCode("123456789")).toBe("123456");
    expect(sanitizeVerificationCode("abcdef")).toBe("");
  });

  it("renders mobile and one-time-code accessibility attributes", () => {
    const markup = renderToStaticMarkup(
      <VerificationCodeInput
        id="code"
        value="012345"
        invalid
        describedBy="code-error"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('autoComplete="one-time-code"');
    expect(markup).toContain('maxLength="6"');
    expect(markup).toContain('aria-describedby="code-error"');
    expect(markup).toContain('value="012345"');
  });
});
