import { redirect } from "next/navigation";
import { getUser } from "../auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";
export default async function Login() {
  if (await getUser()) redirect("/");
  return <LoginForm />;
}
