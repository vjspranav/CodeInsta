export const metadata = { title: "Privacy · CodeInsta" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10 text-sm leading-6 text-neutral-300">
      <h1 className="mb-4 text-2xl font-semibold text-white">Privacy policy</h1>
      <p className="mb-3">
        CodeInsta is a private, invite-only learning app run by Pranav (vjspranav.dev). This page explains what it
        stores.
      </p>
      <h2 className="mt-6 mb-2 font-semibold text-white">What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your email address and, if you use Google sign-in, your name and profile picture from Google.</li>
        <li>What you do in the app: reels you view and like, and invite codes you redeem.</li>
        <li>For the owner only: notes, questions and direct messages sent to the AI creators.</li>
      </ul>
      <h2 className="mt-6 mb-2 font-semibold text-white">How it is used</h2>
      <p>
        Only to run the app: sign you in, keep your feed and progress, and let the AI creator accounts respond to the
        owner&apos;s questions. Data is never sold or used for advertising. It is stored with Supabase and served by
        Vercel.
      </p>
      <h2 className="mt-6 mb-2 font-semibold text-white">Deleting your data</h2>
      <p>
        Email <a className="underline" href="mailto:pokemonashepisodes@gmail.com">pokemonashepisodes@gmail.com</a> to
        have your account and all associated data deleted.
      </p>
      <p className="mt-8 text-neutral-500">Last updated: 31 October 2026</p>
    </main>
  );
}
