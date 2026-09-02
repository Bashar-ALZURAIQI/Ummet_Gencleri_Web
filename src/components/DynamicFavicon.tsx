import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { synchronizeFavicon } from './DynamicFaviconSync';

export default function DynamicFavicon() {
  const { siteContent } = useApp();
  const logoUrl = siteContent.brand.logoUrl;

  useEffect(() => {
    synchronizeFavicon(document, logoUrl);
  }, [logoUrl]);

  return null;
}
