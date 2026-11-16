"use client";

export function MemberExportPrintButton() {
  return <button className="button-primary" onClick={() => window.print()} type="button">Print / Save as PDF</button>;
}