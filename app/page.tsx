import TogetherApp from "./together-app";
import { requireUser } from "./auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  return <TogetherApp displayName={user.displayName} />;
}
