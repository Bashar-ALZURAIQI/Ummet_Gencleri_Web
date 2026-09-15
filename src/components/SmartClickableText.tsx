import { Fragment } from 'react';
import { tokenizeSmartText } from '../domain/smartTextLinks.ts';

export default function SmartClickableText({ text }: { text: string }) {
  const tokens = tokenizeSmartText(text);
  return (
    <>
      {tokens.map((token, index) =>
        token.type === 'link' && token.href ? (
          <a
            key={index}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="font-semibold text-navy-700 underline decoration-navy-200 underline-offset-2 hover:text-navy-900"
          >
            {token.value}
          </a>
        ) : (
          <Fragment key={index}>{token.value}</Fragment>
        ),
      )}
    </>
  );
}