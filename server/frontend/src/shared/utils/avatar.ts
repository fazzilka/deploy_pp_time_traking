const avatarColors = [
  "#8b735f",
  "#6f42c1",
  "#0969da",
  "#1a7f37",
  "#bf3989",
  "#bc4c00",
  "#57606a",
];

export function getAvatarColor(username: string): string {
  const source = username.trim().toLowerCase() || "time-tracking";
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % avatarColors.length;
  }

  return avatarColors[Math.abs(hash) % avatarColors.length];
}
