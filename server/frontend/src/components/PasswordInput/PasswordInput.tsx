import { useState } from "react";
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

export function PasswordInput({
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
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const inputId = id ?? name;

  return (
    <div className="password-input">
      {label && (
        <label className="password-input__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="password-input__field">
        <input
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
          aria-label={isVisible ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setIsVisible((currentValue) => !currentValue)}
        >
          {isVisible ? "Скрыть" : "Показать"}
        </button>
      </div>
      {error && <div className="password-input__error">{error}</div>}
    </div>
  );
}
