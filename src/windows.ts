export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function spriteVisible(
  bounds: Bounds,
  size: number,
  displays: Bounds[],
): boolean {
  const width = (size * 384) / 448;
  const sprite = {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + bounds.height - 38 - size,
    width,
    height: size,
  };
  return displays.some(
    (d) =>
      Math.min(sprite.x + sprite.width, d.x + d.width) >
        Math.max(sprite.x, d.x) &&
      Math.min(sprite.y + sprite.height, d.y + d.height) >
        Math.max(sprite.y, d.y),
  );
}
export function resizedBounds(old: Bounds, size: number): Bounds {
  const width = Math.max(150, Math.round(size * 1.4)),
    height = size + 100;
  return {
    x: Math.round(old.x + old.width / 2 - width / 2),
    y: Math.round(old.y + old.height - height),
    width,
    height,
  };
}
