import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Enter · Four Wins" };

export default function LoginPage() {
  return <LoginForm />;
}
