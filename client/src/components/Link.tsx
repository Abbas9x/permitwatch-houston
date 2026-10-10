import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from '../lib/router';

/** In-app link: real <a href> (works with middle-click / new tab), client-side navigation on plain click. */
export function Link({ href, onClick, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(href);
    window.scrollTo({ top: 0 });
  };
  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

/** Link to an external site, always opened safely in a new tab. */
export function ExternalLink({ href, children, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const safe = /^https?:\/\//i.test(href) ? href : '#';
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={className} {...rest}>
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
