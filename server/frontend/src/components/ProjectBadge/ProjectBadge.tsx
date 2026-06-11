import type { CSSProperties } from "react";
import type { ProjectBadge as ProjectBadgeType } from "../../shared/types/project";
import "./ProjectBadge.css";

type ProjectBadgeProps = {
  project?: ProjectBadgeType | null;
  fallback?: boolean;
};

export function ProjectBadge({ project, fallback = false }: ProjectBadgeProps) {
  if (!project && !fallback) {
    return null;
  }

  const color = project?.color ?? "#8b949e";
  const label = project?.name ?? "Без проекта";

  return (
    <span className="project-badge" style={{ "--project-color": color } as CSSProperties}>
      <span className="project-badge__dot" aria-hidden="true" />
      <span className="project-badge__text">{label}</span>
    </span>
  );
}
