# Creative briefs for every reel genre

Owner: Codex. Source: 2026-11-01 **“Genres, style by type and category, and dislikes”** in [decisions.md](../coordination/decisions.md). These ten briefs translate the owner's “exceptionally good” story verdict into distinct formats. They are creative directions, not claims that the examples were executed or occurred. Verify any incident, commit, code or measured output before using it. Follow [RULES.md](RULES.md), including context before conflict, no premature answers, complete full forms, 60–90 s parts and spoken explanations over silent holds.

Pick style by category and genre, then rotate among fitting styles. Keep the causal sequence and distinctive micro-interaction even when the skin changes. A prediction pause must fit the silence limits. A cliffhanger creates a specific unresolved question; it does not replace the complete lesson in the current part.

## story

Hook: Rookie taps the heart on the first demo; it refuses to stay red while Senior asks which event the UI is waiting for.
Visual metaphor: Establish phone → request → database, then follow one tiny “like” receipt through the system; sketch or the category's next fitting style keeps the characters grounded.
Signature micro-interaction: The heart fills red within 300 ms, a faint pending marker travels with the request, and an explicitly demonstrated failure rolls it back at the spoken reveal.

## war-story

Hook: Open on a verified postmortem's concrete symptom: “The service was healthy. Users still couldn't finish checkout.” Establish the request path before the cascade.
Visual metaphor: In newsprint, a service map becomes a timeline of evidence; a growing queue physically blocks the one request viewers have been following. Label any recreated values as illustrative.
Signature micro-interaction: Each retry stamps a second ticket into the queue; the verified mitigation stops the stamp, and the queue drains in the same beat as the explanation.

## trace

Hook: “You pressed Enter. Where does the first byte actually go?” Put the destination and a small network map on screen before the journey starts.
Visual metaphor: One numbered packet moves through a blueprint or category-fitting diagram, carrying its headers like a luggage tag; define each acronym when first spoken.
Signature micro-interaction: The packet pauses only while its hop is explained, swaps its visible envelope at the correct layer, and lights the return path when the response arrives.

## commit-story

Hook: Use a verified StagOS or LineageOS change: show the user-visible bug first, then ask which assumption in the old code caused it; never display a hash.
Visual metaphor: A terminal-styled case file contains the real repository name, a few checked before/after diff lines and the bug → cause → patch sequence; keep the commit URL in sources.
Signature micro-interaction: The wrong line receives a small failure marker; on the spoken fix, one replacement line slides into place and the demonstrated behavior changes from failure to success.

## myth-vs-fact

Hook: Put one tempting claim in a character's mouth—“Adding an index always makes this query fast”—and establish the tiny table before testing it.
Visual metaphor: A paper-cutout claim card sits above two actual query shapes; the explanation removes the assumption underneath the claim instead of replacing it with another slogan.
Signature micro-interaction: The index badge snaps onto one path while the other still walks rows; reveal the condition that changes the result exactly when it is explained.

## predict-it

Hook: Show a short checked snippet or two-row transaction and ask one precise question; provide the needed inputs, but keep the result completely concealed.
Visual metaphor: In sketch or the next fitting category style, three candidate output cards sit face down beside the running example; use a brief spoken invitation to guess within the silence budget.
Signature micro-interaction: Only after the question finishes does the correct card flip; a single highlighted operation explains why the other candidates fail.

## build-along

Hook: “This six-line handler works once. Let's make the retry safe.” Show the request, tiny storage model and observed failure before introducing the change.
Visual metaphor: A terminal or blueprint workbench assembles a small real implementation, one meaningful line at a time; distinguish runnable code from shortened illustrative excerpts.
Signature micro-interaction: As the idempotency check is typed and explained, a duplicate request hits a visible stop marker while the first request's existing result slides back to the caller.

## versus

Hook: “Same filter screen, two designs: which one survives page 500?” Establish row count, freshness and interaction constraints before presenting a verdict.
Visual metaphor: In paper-cutout or editorial-dark, the same request token runs through database and client paths; keep a small, labeled ledger of the actual tradeoffs instead of decorative scores.
Signature micro-interaction: Change one stated constraint and the favored path switches sides; show the reason at that moment so the verdict remains conditional rather than universal.

## analogy

Hook: “Two librarians promise you the last copy. Which promise can the system keep?” Establish the real inventory record alongside the physical example.
Visual metaphor: A sketch library desk maps explicitly to database state and concurrent requests; label where the analogy stops matching the real system before drawing the conclusion.
Signature micro-interaction: Two hands reach for one checkout token; an atomic operation gives it to one hand, while the matching database row changes in sync with the explanation.

## interview

Hook: Ask a bounded design question after showing its inputs: “This feed has a celebrity with millions of followers. What breaks first?” Let the candidate make a plausible, specific mistake.
Visual metaphor: A sketch whiteboard has separate input, proposal and evidence areas; run the candidate's design against an illustrative workload before introducing the better answer.
Signature micro-interaction: The proposed fan-out visibly fills a work queue; after the interviewer names the failure, the candidate redraws one edge and the exceptional read path lights up.

## Creator acceptance

For each brief, the creator records the factual source or checked example, the first reveal frame, the signature state transition and its expectation, and the selected genre/style versus recent creator history. Do not attach every brief to the same two-person conversation. Trace may be narrator-led, build-along may center on code, and versus may use comparison alone. All still receive the same care in causal explanation, timing and readable visuals. The narrator remains separate from any cast character.
