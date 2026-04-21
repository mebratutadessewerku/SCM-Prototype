"use client";

import { Pencil, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";

type IconBtnProps = {
  onClick: () => void;
  "aria-label": string;
  className?: string;
};

export function TableEditIconButton({ onClick, "aria-label": ariaLabel, className }: IconBtnProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
    >
      <Pencil aria-hidden />
    </Button>
  );
}

export function TableDeleteIconButton({ onClick, "aria-label": ariaLabel, className }: IconBtnProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
    >
      <Trash aria-hidden />
    </Button>
  );
}
