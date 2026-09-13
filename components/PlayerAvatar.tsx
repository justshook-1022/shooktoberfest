/* eslint-disable @next/next/no-img-element */

type PlayerAvatarProps = {
  name: string;
  src?: string | null;
  size?: "small" | "medium" | "large";
};

export default function PlayerAvatar({ name, src, size = "medium" }: PlayerAvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "?";

  return (
    <span className={`player-avatar player-avatar-${size}`} title={name}>
      {src ? <img src={src} alt={`${name} profile`} /> : <span aria-label={`${name} profile photo not added`}>{initials}</span>}
    </span>
  );
}
