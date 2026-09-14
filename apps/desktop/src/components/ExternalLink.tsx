import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "../toast";

interface ExternalLinkProps {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}

// A plain <a target="_blank"> does nothing in a Tauri webview — there's no
// browser tab for it to open into, and Tauri's opener plugin (see
// src-tauri/capabilities/default.json's opener:allow-open-url) doesn't
// auto-intercept link clicks, it has to be called explicitly. This hands
// the click to the OS's default browser instead.
export default function ExternalLink({ href, className, title, children }: ExternalLinkProps) {
  return (
    <a
      href={href}
      className={className}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href).catch((err) => toast.error(`Couldn't open link: ${err}`));
      }}
    >
      {children}
    </a>
  );
}
