import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

interface BrandMarkProps {
  logoUrl?: string;
  logoIcon: string;
}

export default function BrandMark({ logoUrl, logoIcon }: BrandMarkProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = logoUrl?.trim();

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
      data-logo-icon={logoIcon}
    >
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt="شعار الاتحاد"
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Users className="h-7 w-7 text-navy-800" aria-label="رمز الاتحاد الاحتياطي" />
      )}
    </div>
  );
}
