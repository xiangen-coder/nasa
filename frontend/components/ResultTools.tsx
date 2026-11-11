"use client";

import { useRef } from "react";
import { PanelRightOpen, X } from "lucide-react";

type ResultAction = {
  label: string;
  select: () => void;
  primary?: boolean;
};

export default function ResultTools({ actions }: { actions: ResultAction[] }) {
  const drawer = useRef<HTMLDialogElement>(null);

  return (
    <div className="result-tools">
      <button
        type="button"
        className="result-tools-trigger button subtle"
        aria-haspopup="dialog"
        aria-controls="result-tools-drawer"
        onClick={() => drawer.current?.showModal()}
      >
        <PanelRightOpen size={18} aria-hidden="true" />
        Result tools
      </button>
      <dialog
        ref={drawer}
        id="result-tools-drawer"
        className="result-tools-drawer"
        aria-labelledby="result-tools-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) drawer.current?.close();
        }}
      >
        <div className="result-tools-panel">
          <header>
            <h2 id="result-tools-title">Result tools</h2>
            <button
              type="button"
              className="round-button"
              aria-label="Close result tools"
              onClick={() => drawer.current?.close()}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="result-tools-actions">
            {actions.map(({ label, select, primary }) => (
              <button
                key={label}
                type="button"
                className={primary ? "button primary" : "button subtle"}
                onClick={() => {
                  drawer.current?.close();
                  select();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </dialog>
    </div>
  );
}
