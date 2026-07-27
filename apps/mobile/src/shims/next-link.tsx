import { Link as RLink, type LinkProps as RLinkProps } from "react-router-dom";
import type { ReactNode, CSSProperties, MouseEventHandler } from "react";

type Props = {
  href: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler;
  prefetch?: boolean;
};

/** Shim for next/link → react-router. */
export default function Link({ href, children, className, style, onClick }: Props) {
  return (
    <RLink to={href} className={className} style={style} onClick={onClick as RLinkProps["onClick"]}>
      {children}
    </RLink>
  );
}
