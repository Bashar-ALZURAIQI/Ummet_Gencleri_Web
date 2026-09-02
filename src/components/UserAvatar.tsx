import { useEffect, useMemo, useState } from 'react';
import { getAvatarPublicUrl } from '../services/avatarService';
import {
  avatarAltText,
  avatarFallbackInitial,
  resolveUserAvatarSource,
} from '../domain/userAvatarPolicy';

export interface UserAvatarProps {
  name?: string | null;
  photo?: string | null;
  avatarPath?: string | null;
  updatedAt?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export default function UserAvatar({
  name,
  photo,
  avatarPath,
  updatedAt,
  className = 'h-16 w-16',
  imageClassName = '',
  fallbackClassName = 'bg-navy-700 text-white',
}: UserAvatarProps) {
  const source = useMemo(
    () => resolveUserAvatarSource({ photo, avatarPath, updatedAt }, getAvatarPublicUrl),
    [avatarPath, photo, updatedAt],
  );
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [source]);

  const sharedClassName = `${className} shrink-0 overflow-hidden rounded-full`;
  if (source && !imageFailed) {
    return (
      <img
        src={source}
        alt={avatarAltText(name)}
        className={`${sharedClassName} object-cover ${imageClassName}`.trim()}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${sharedClassName} inline-flex items-center justify-center font-extrabold ${fallbackClassName}`.trim()}
      role="img"
      aria-label={avatarAltText(name)}
    >
      {avatarFallbackInitial(name)}
    </span>
  );
}
