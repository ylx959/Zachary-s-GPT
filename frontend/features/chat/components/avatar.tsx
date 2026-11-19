import { colorFor, initialOf } from "@/lib/format";

type AvatarProps = {
  /** Text the initial is taken from. */
  label: string;
  /** Key for the stable color; defaults to the label. */
  colorKey?: string;
  color?: string;
  size?: number;
};

export function Avatar({ label, colorKey, color, size = 36 }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: color ?? colorFor(colorKey ?? label),
      }}
    >
      {initialOf(label)}
    </span>
  );
}
