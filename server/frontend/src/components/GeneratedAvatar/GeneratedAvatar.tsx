import { memo, useMemo, type CSSProperties } from "react";
import "./GeneratedAvatar.css";

export type GeneratedAvatarProps = {
  seed?: string | number | null;
  letter?: string | null;
  size?: number;
  className?: string;
  title?: string;
};

type AvatarCell = {
  row: number;
  col: number;
};

const gridSize = 5;
const visibleColumns = 3;
const cellSize = 14;
const cellGap = 3;
const gridTotalSize = gridSize * cellSize + (gridSize - 1) * cellGap;
const gridStart = (100 - gridTotalSize) / 2;
const minFilledCells = 6;
const maxFilledCells = 18;

function normalizeSeed(seed?: string | number | null, letter?: string | null): string {
  const normalizedSeed = seed === null || seed === undefined ? "" : String(seed).trim();

  if (normalizedSeed) {
    return normalizedSeed;
  }

  const normalizedLetter = letter?.trim();
  return normalizedLetter || "anonymous";
}

function hashSeed(seed: string): number[] {
  let hash = 2166136261;
  const bytes: number[] = [];

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    bytes.push((hash >>> 0) & 255);
    bytes.push((hash >>> 8) & 255);
  }

  while (bytes.length < 80) {
    hash ^= bytes.length + 97;
    hash = Math.imul(hash, 16777619);
    bytes.push((hash >>> 0) & 255);
    bytes.push((hash >>> 8) & 255);
    bytes.push((hash >>> 16) & 255);
  }

  return bytes;
}

function getAvatarColor(hash: number[]): string {
  const hue = (hash[0] * 3 + hash[7]) % 360;
  const saturation = 58 + (hash[13] % 14);
  const lightness = 54 + (hash[19] % 10);

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function buildPattern(hash: number[]): AvatarCell[] {
  const candidates: AvatarCell[] = [];
  const selected = new Set<string>();
  let hashIndex = 0;

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < visibleColumns; col += 1) {
      const mirroredCol = gridSize - 1 - col;
      const key = `${row}:${col}`;
      const byte = hash[hashIndex % hash.length];
      hashIndex += 1;

      candidates.push({ row, col });

      if (byte % 2 === 0) {
        selected.add(key);
        if (mirroredCol !== col) {
          selected.add(`${row}:${mirroredCol}`);
        }
      }
    }
  }

  let filledCells = selected.size;
  let fallbackIndex = hash[23] % candidates.length;

  while (filledCells < minFilledCells) {
    const candidate = candidates[fallbackIndex % candidates.length];
    const mirroredCol = gridSize - 1 - candidate.col;
    const beforeSize = selected.size;
    selected.add(`${candidate.row}:${candidate.col}`);
    if (mirroredCol !== candidate.col) {
      selected.add(`${candidate.row}:${mirroredCol}`);
    }
    filledCells += selected.size - beforeSize;
    fallbackIndex += 1;
  }

  const keys = Array.from(selected);
  while (keys.length > maxFilledCells) {
    const removeIndex = hash[(keys.length + 31) % hash.length] % keys.length;
    keys.splice(removeIndex, 1);
  }

  return keys
    .map((key) => {
      const [row, col] = key.split(":").map(Number);
      return { row, col };
    })
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

export const GeneratedAvatar = memo(function GeneratedAvatar({
  seed,
  letter,
  size = 40,
  className,
  title,
}: GeneratedAvatarProps) {
  const avatar = useMemo(() => {
    const normalizedSeed = normalizeSeed(seed, letter);
    const hash = hashSeed(normalizedSeed);

    return {
      color: getAvatarColor(hash),
      cells: buildPattern(hash),
      title: title || "Аватар пользователя",
    };
  }, [letter, seed, title]);

  const style = {
    "--generated-avatar-size": `${size}px`,
  } as CSSProperties;

  return (
    <span className={`generated-avatar${className ? ` ${className}` : ""}`} style={style} title={avatar.title}>
      <svg className="generated-avatar__svg" viewBox="0 0 100 100" role="img" aria-label={avatar.title}>
        <circle className="generated-avatar__background" cx="50" cy="50" r="49" />

        {avatar.cells.map((cell) => (
          <rect
            className="generated-avatar__cell"
            fill={avatar.color}
            key={`${cell.row}-${cell.col}`}
            x={gridStart + cell.col * (cellSize + cellGap)}
            y={gridStart + cell.row * (cellSize + cellGap)}
            width={cellSize}
            height={cellSize}
            rx="2"
          />
        ))}
      </svg>
    </span>
  );
});
