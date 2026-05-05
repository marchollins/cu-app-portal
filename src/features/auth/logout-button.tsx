import React from "react";
import { logoutAction } from "./logout";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit">Log Out</button>
    </form>
  );
}
