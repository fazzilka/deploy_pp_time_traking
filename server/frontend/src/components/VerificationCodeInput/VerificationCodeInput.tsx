import { forwardRef } from "react";

export function sanitizeVerificationCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

type VerificationCodeInputProps = {
  id: string;
  value: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
};

export const VerificationCodeInput = forwardRef<HTMLInputElement, VerificationCodeInputProps>(
  function VerificationCodeInput({ id, value, invalid = false, describedBy, onChange }, ref) {
    return (
      <input
        ref={ref}
        id={id}
        className="auth-code-input"
        value={value}
        onChange={(event) => onChange(sanitizeVerificationCode(event.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        required
      />
    );
  },
);
