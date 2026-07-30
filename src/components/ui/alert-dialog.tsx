"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";

const AlertDialog = DialogPrimitive.Root;
const AlertDialogPortal = DialogPrimitive.Portal;
const AlertDialogTitle = DialogPrimitive.Title;
const AlertDialogDescription = DialogPrimitive.Description;

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[61] grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-border bg-background p-5 shadow-xl outline-none",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
};
