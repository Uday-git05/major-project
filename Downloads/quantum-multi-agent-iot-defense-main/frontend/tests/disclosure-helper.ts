import { fireEvent } from "@testing-library/react";
export function toggle(node: Element, options?: { target: { open: boolean } }) {
  (node as HTMLDetailsElement).open = options?.target.open ?? true;
  fireEvent(node, new Event("toggle"));
}
