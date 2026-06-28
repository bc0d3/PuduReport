// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, footer }: Props) {
  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        {footer && (
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
