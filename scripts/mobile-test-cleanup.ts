// Deletes the Maestro test member's feedback, messages, likes, dislikes, views and topic_requests.
// Never deletes the user or anyone else's data; refuses when MAESTRO_EMAIL is an owner address.
//   set -a; . ./.env.local; set +a; npx tsx scripts/mobile-test-cleanup.ts
import { cleanupTestMember, realDeps } from "./mobile-test-user";

const { db, env } = realDeps();
cleanupTestMember({ db, env, log: (m) => console.log(m) }).catch((e) => {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
});
