import "./LoadingSkeleton.css";

type LoadingSkeletonVariant = "page" | "cards" | "list" | "profile";

type LoadingSkeletonProps = {
  label: string;
  variant?: LoadingSkeletonVariant;
};

export function LoadingSkeleton({ label, variant = "page" }: LoadingSkeletonProps) {
  const itemCount = variant === "list" ? 5 : 3;

  return (
    <div
      className={`loading-skeleton loading-skeleton--${variant}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="loading-skeleton__sr-only">{label}</span>

      {variant !== "cards" && variant !== "list" && (
        <div className="loading-skeleton__heading" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}

      <div className="loading-skeleton__items" aria-hidden="true">
        {Array.from({ length: itemCount }, (_, index) => (
          <div className="loading-skeleton__item" key={index}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
