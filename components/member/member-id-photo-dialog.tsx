"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export function MemberIdPhotoDialog({ photoUrl, triggerLabel }: { photoUrl: string; triggerLabel: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  function openDialog() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
    setIsOpen(false);
  }

  return <>
    <button aria-haspopup="dialog" className="button-outline member-id-photo-trigger" onClick={openDialog} type="button">{triggerLabel}</button>
    <dialog aria-label="Submitted ID photo" className="member-id-photo-dialog" onClose={() => setIsOpen(false)} ref={dialogRef}>
      <header><h3 className="display-font">Submitted ID photo</h3><button aria-label="Close ID photo" className="button-secondary" onClick={closeDialog} type="button">Close</button></header>
      {isOpen ? <Image alt="Your submitted identity document" className="member-id-photo-image" height={1200} src={photoUrl} unoptimized width={900} /> : null}
    </dialog>
  </>;
}