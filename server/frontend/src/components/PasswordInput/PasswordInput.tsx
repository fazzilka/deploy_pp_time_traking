import { forwardRef, useState } from "react";
import "./PasswordInput.css";

type PasswordInputProps = {
  id?: string;
  name?: string;
  label?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  required?: boolean;
  minLength?: number;
  onChange: (value: string) => void;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  {
    id,
    name,
    label,
    value,
    placeholder,
    autoComplete,
    error,
    required,
    minLength,
    onChange,
  },
  ref,
) {
  const [isVisible, setIsVisible] = useState(false);
  const inputId = id ?? name;
  const toggleLabel = isVisible ? "Скрыть пароль" : "Показать пароль";
  const toggleIcon = isVisible ? "●" : "○";

  function togglePasswordVisibility() {
    setIsVisible((currentValue) => !currentValue);
  }

  return (
    <div className="password-input">
      {label && (
        <label className="password-input__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="password-input__field">
        <input
          ref={ref}
          id={inputId}
          name={name}
          type={isVisible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="password-input__toggle"
          type="button"
          aria-label={toggleLabel}
          onClick={togglePasswordVisibility}
        >
          <span aria-hidden="true">{toggleIcon}</span>
        </button>
      </div>
      {error && <div className="password-input__error">{error}</div>}
    </div>
  );
});
