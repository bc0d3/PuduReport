// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  hint: string;
  shortcut?: string;
  side?: "right" | "bottom";
}

/** Boton con ayuda consistente para acciones compactas del shell. */
export function HintButton({ hint, shortcut, side = "right", children, ...props }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const id = useId();
  const clear = useCallback(() => window.clearTimeout(timer.current), []);
  const hide = useCallback(() => {
    clear();
    setOpen(false);
  }, [clear]);

  function show(delay = 350) {
    clear();
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }
  function leave() {
    clear();
    timer.current = window.setTimeout(() => setOpen(false), 100);
  }

  useLayoutEffect(() => {
    if (!open || !button.current || !tooltip.current) return;
    const anchor = button.current.getBoundingClientRect();
    const box = tooltip.current.getBoundingClientRect();
    const left =
      side === "right" ? anchor.right + 10 : anchor.left + (anchor.width - box.width) / 2;
    const top =
      side === "right" ? anchor.top + (anchor.height - box.height) / 2 : anchor.bottom + 10;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - box.height - 8)),
    });
  }, [open, side, hint, shortcut]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") hide();
    }
    window.addEventListener("keydown", dismiss);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);
  useEffect(() => clear, [clear]);

  return (
    <>
      <button
        {...props}
        ref={button}
        aria-describedby={
          [props["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined
        }
        onMouseEnter={(event) => {
          show();
          props.onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          leave();
          props.onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) show(0);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          hide();
          props.onBlur?.(event);
        }}
        onPointerDown={(event) => {
          hide();
          props.onPointerDown?.(event);
        }}
        onClick={(event) => {
          hide();
          props.onClick?.(event);
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={tooltip}
            id={id}
            role="tooltip"
            className="hint-bubble"
            style={position}
            onMouseEnter={clear}
            onMouseLeave={leave}
          >
            <span>{hint}</span>
            {shortcut && <kbd>{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
