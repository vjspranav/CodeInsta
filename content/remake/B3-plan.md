# B3 plan: variety rewrite of the 30 remakes

Status: plan only (written by a Claude subagent, 2026-11-02). Nothing here changes a script. Claude rewrites `content/remake/claude/*`, Codex rewrites `content/remake/gpt/*`, both from this file.

Source decision: "Reels must not look the same" (decisions.md, 2026-11-02) and the B2 split entries. Gate the rewrites must pass: the primary world is on screen at least 50% of the runtime; sketch-only beats (whiteboard notes, glossary cards) at most one third; at least one signature micro-interaction; cast shaped by the story; every reel keeps its 60-90 s length, full-form glossary, no early answers, no emojis, no hashes on screen, voice never ahead of the screen.

## 0. Rules this plan follows

1. Worlds: `phone`, `db`, `term.session`, `debugger`, `browser.network`, `incident`, `netmap`, `memgrid`, `device.boot`, `review`. "whiteboard" below means the old sketch board, used as a secondary at most (and as the primary in exactly one reel, see 5.3).
2. No two reels of one series share a primary world. Across the 30, no world is primary more than 6 times (debugger 6 and term.session 6 are at the cap; do not add a seventh to either).
3. At most 3 reels may stay mostly whiteboard. This plan uses 1 (ssa-02).
4. No invented facts. Every "keep" entry below comes from the current script or its listed source. Anything else is marked `needs research: <what>`. Numbers shown in a world (metrics, row counts, plan costs, stack frames) must be either (a) captured from a real local run, or (b) a labelled illustrative value; never an unlabelled made-up measurement. The GPT scripts already label fictional or illustrative setups; keep those labels spoken.
5. Voice split. Claude reels = "how it works inside" (internals, theory): the world shows the mechanism moving. GPT reels = "build it, break it, debug it": the world shows a tool session, a failure and a fix.
6. Hooks: the first 3 seconds are one concrete picture plus one short line, never a title card, never the answer. All 30 hooks open differently (a paused debugger, a red build line, a pull-request comment, a pager, two phones, a green health check, ...). Titles change only when the new one is a better hook.
7. Cast: 1 to 4 speakers, each with a named role and a reason to be in the story. The narrator stays separate from the cast and only sets scenes. The old default (Rookie plus Senior in nearly every reel) is retired: it appears in no reel of this plan. Cast sizes used: 1 (x2), 2 (x19), 3 (x8), 4 (x1).
8. Style and genre are unchanged from the current scripts (genre forces style for predict-it and interview = sketch, commit-story = terminal). Consecutive reels in a series already differ in style, and per the new feed rule they now also differ in world. If a world's native skin clashes with the declared style, the world wins and the style flips to the nearest fitting one (note it in the script).
9. Wave tags: W1 = only needs worlds that exist today (phone, db, term.session); W2 = needs debugger, memgrid or netmap (Claude-built); W3 = needs review, incident, browser.network or device.boot (Codex-built).

## 1. Series: aosp-build-system (Claude)

### build-01 | W3
- File: `content/remake/claude/aosp-build-system-01.json`
- Current title: Why did Android replace Makefiles with Android.bp? (versus, terminal)
- Proposed title: Why can't a tool read Android.mk without running it?
- Primary world: review (a pull request "Convert hello from Android.mk to Android.bp", Android.mk on the left of the diff, Android.bp on the right). Secondary: term.session (short, for the Soong output file).
- Hook: a pull-request page opens and an inline comment lands on the `ifeq` line: "What does this file build?" Dev: "Run it and see." Mia: "That's the problem."
- Signature micro-interaction: the review thread on the `ifeq` line stays open until the parser listing of the .bp side appears with no build run; then the thread flips to Resolved and the Approve button turns green.
- Cast: Mia (tooling dev and reviewer, writes the tool that lists modules), Dev (build veteran, author of the PR).
- Keep: Android.mk `ifeq` is code, so what it builds is only known by running it; Android.bp is declarative data with a module type and properties, no loops or ifs; per-architecture differences are nested properties; the Blueprint library parses every Android.bp, Soong defines module types such as cc_binary, Soong writes out/soong/build.ninja and Ninja runs it; mutators clone each module into variants (architecture, core or vendor, shared or static) so the phone gets arm64 and arm builds of hello; verdict: arbitrary logic per file favours Make, a fast graph a tool can read favours Blueprint. Sources: source.android.com androidbp reference and the Soong repo.
- needs research: the exact Android.mk / Android.bp text for the "hello" example is whatever the current script already shows; do not add new properties.

### build-02 | W2
- File: `content/remake/claude/aosp-build-system-02.json`
- Current title: How do Soong, Kati and ninja split the work in one m? (trace, blueprint)
- Proposed title: One letter, three programs: what does `m` really run?
- Primary world: debugger (stepping into soong_ui with the call stack and a "children started" panel). Secondary: term.session (the `m` prompt at the start and out/ listing at the end).
- Hook: debugger already paused on a breakpoint at the start of soong_ui, one frame on the call stack, a single `m` in the terminal strip. Lena: "One keystroke started all of this. Let's freeze it mid-flight."
- Signature micro-interaction: stepping through the program, each step launches a visible child (Soong, then Kati, then one Ninja) and the stack panel grows and shrinks; when the combined Ninja file is written, an include arrow from it lights both generated files.
- Cast (1 speaker): Lena (build engineer thinking aloud at the debugger). The narrator opens and closes the scene.
- Keep: `m` runs build/soong/soong_ui.bash in make mode and starts soong_ui, the conductor; Soong reads every Android.bp and writes out/soong/build.ninja; Kati (a GNU make clone) reads Android.mk and the product config and writes a second Ninja file; soong_ui writes one combined file that includes both; Soong also writes a makefile that Kati includes so make's image rules can package Soong modules; one Ninja process runs the real compiler commands over the merged graph; results land under out/target/product in a folder named for the device. Sources: source.android.com build docs and the Soong repo.
- needs research: real function and file names inside build/soong/ui/build for the stack frames (do not show names that were not read in the repo); fallback if not verifiable: show the processes as a labelled process tree instead of a call stack.

### build-03 | W1
- File: `content/remake/claude/aosp-build-system-03.json`
- Current title: Why did one stale package name stop a StagOS build? (commit-story, terminal)
- Proposed title: keep.
- Primary world: term.session (a case-file terminal session running the failing `m`, then viewing the makefile diff). Secondary: none (the diff is rendered by code.editor inside the terminal).
- Hook: a StagOS build terminal stops on one red line: "includes non-existent modules in PRODUCT_PACKAGES". Sam: "I haven't added a package all week."
- Signature micro-interaction: the stale line gets a failure marker; at the spoken fix one replacement line slides into the list and the rerun output changes from the red error to a clean start; PRODUCT_PACKAGES shrinks by one name.
- Cast: Sam (release engineer on the broken build), Dara (StagOS maintainer who knows why the recovery target went away).
- Keep: real commit in StagOS/android_build_make ("Remove non existent snapuserd.recovery package", URL stays in `sources`, no hash on screen); PRODUCT_PACKAGES accumulates across every inherited makefile, scalars like PRODUCT_NAME take the most derived value; every name must match a real module; the stale name is snapuserd.recovery, left over after the recovery target was removed in an earlier change; fix deletes it from both Virtual A/B compression makefiles; the commit's test note is to run m and the error is gone. Source: the commit URL plus the new-device doc.

## 2. Series: compilers-ssa-and-ir (Claude)

### ssa-01 | W2
- File: `content/remake/claude/compilers-ssa-and-ir-01.json`
- Current title: Why does SSA need phi nodes? (story, newsprint)
- Proposed title: Which x does the join read: x1 or x2?
- Primary world: debugger (a tiny IR program paused at the join block, watch panel showing x1, x2 and c). Secondary: whiteboard (only for the dominator-frontier placement, under a third).
- Hook: a debugger paused at the first line of the join block with the watch panel showing `c`, `x1`, `x2`; Kai: "Which one does this read?"
- Signature micro-interaction: run twice, once with c true and once with c false; the "read x2" the optimizer chose is shown wrong on the first run (red mark on the watch line); after the phi line is inserted the join line reads the right value on both runs.
- Cast: Kai (junior compiler dev whose optimizer folds constants), Noor (optimizer lead).
- Keep: renaming gives single assignment but cannot choose x1 vs x2 at a join; the optimizer picks x2, the last one it saw, and ships a bug whenever c is true; a phi at the top of the join picks x1 from the then block and x2 from the else block; Cytron's algorithm places the fewest phis: for each variable start from its defining blocks and take the iterated dominance frontier (blocks they reach but do not strictly dominate); renaming is one walk down the dominator tree, each use takes the newest name above it; LLVM mem2reg uses the same idea on stack slots. Sources: Cytron et al. (ACM DOI) and LLVM Passes doc.
- needs research: none beyond the labelled illustrative constants chosen for the watch panel.

### ssa-02 | W1 (the one whiteboard reel)
- File: `content/remake/claude/compilers-ssa-and-ir-02.json`
- Current title: What is a dominator tree, and why does every optimizer query it? (predict-it, terminal)
- Proposed title: Which block is D's closest dominator?
- Primary world: whiteboard (four blocks A, B, C, D as a graph; the tree growing beside it). Secondary: term.session (the compiler printing the tree).
- Why whiteboard: the whole lesson is the shape of one four-node graph and the tree built from it; no real session or debugger shows it better, and predict-it is forced to sketch style. It is kept to 60% or less sketch beats by moving all three candidate cards, the card flip and the tree growth into animated board elements, with the terminal output as the second half.
- Hook: pencil circles block D in a four-block diamond; three face-down answer cards (B, C, A) slide in; Ravi: "Which block is D's closest dominator?"
- Signature micro-interaction: the correct card flips only after the question finishes; two highlighted paths (A, C, D and A, B, D) draw, B and C both go grey, A stays lit.
- Cast: Priya (optimizer intern, quick to guess), Ravi (LLVM maintainer asking one question at a time), plus Cara (reads the card out loud) only if a third voice helps pacing.
- Keep: X dominates Y when every path from the entry A to Y goes through X; closest dominator of D is A; immediate dominators form a tree rooted at the entry; passes ask it: is a definition above every use, can code hoist out of a loop, is an edge a loop back to a dominator; D is where B and C stop dominating, that frontier is where a phi belongs; Cooper, Harvey and Kennedy build the tree by visiting blocks in reverse postorder and intersecting predecessors' answers until nothing changes. Sources: the Rice dom.pdf paper and the LLVM LangRef.
- needs research: the real tool command and output for the terminal half (for example LLVM's print of the dominator tree); if not verified, label the output illustrative.

### ssa-03 | W3
- File: `content/remake/claude/compilers-ssa-and-ir-03.json`
- Current title: What is getelementptr in LLVM IR, really? (myth-vs-fact, editorial-dark)
- Proposed title: Does getelementptr read memory? Jo bets lunch it does.
- Primary world: review (a pull request with the three IR lines; inline comments). Secondary: term.session (arm64 output).
- Hook: a pull-request comment from Jo on the GEP line: "GEP fetches the array element. It's in the name." A "lunch" bet badge sits next to it; Mina: "Bet accepted."
- Signature micro-interaction: Jo's comment thread gets a Suggested change; the address-arithmetic line is highlighted separately from the load line, then the GEP line visibly "touches no memory" (a memory icon stays grey) while the load lights it; the thread resolves and the bet badge flips to Jo.
- Cast: Jo (author, sure about it, bets lunch), Mina (compiler maintainer reviewer), Ace (approving lead, one line to end).
- Keep: LLVM IR nests module, function, basic blocks, instructions; each block ends with exactly one terminator (ret, br, switch); phi nodes may only open a block; every value has a type; GEP takes a base pointer and an index and computes p plus i times four, touching no memory; the load on the next line does the access; splitting them keeps address math optimizable like any arithmetic; on arm64 clang folds the pair into one load with the index shifted left by two. Sources: LLVM LangRef and the GetElementPtr doc.
- needs research: the actual arm64 assembly text (one load with shifted index) from a real clang run.

## 3. Series: distributed-consensus (Claude)

### cons-01 | W2
- File: `content/remake/claude/distributed-consensus-01.json`
- Current title: How does Raft elect a leader when the old one dies? (story, blueprint)
- Proposed title: The leader's cable is kicked at 3 a.m.: who leads next?
- Primary world: netmap (S1, S2, S3, heartbeat pulses on the links, election timers as rings, a crown). Secondary: none (a pager card as a sketch opener).
- Hook: three nodes with a crown on S1 and steady heartbeat pulses; the cable to S1 is pulled and the pulses stop mid-link. Ana: "Silence. Do the others just wait?"
- Signature micro-interaction: each follower's election timer ring refills on a heartbeat; with no pulse, S2's ring runs out first, vote requests fly, the crown moves; a later split-vote replay shows S2 and S3 both starting and no crown landing.
- Cast: Ana (on-call engineer), Ben (distributed-systems veteran), Cy (the on-call at the other site, one message, brings the S3 view).
- Keep: followers use a random timer, 150 to 300 ms in the Raft paper; a heartbeat resets it; S2's fires first, it becomes a candidate, adds one to its term, votes for itself and asks for votes; each server gives one vote per term, persisted to disk first, only to a candidate whose log is at least as up to date; two of three is a majority and S2 leads term 2; split vote: both vote for themselves, the term ends with no leader, timers re-randomize and one usually wins in a new term; a message with a higher term makes returning S1 step down. Sources: Raft paper and raft.github.io.

### cons-02 | W1
- File: `content/remake/claude/distributed-consensus-02.json`
- Current title: Why can't a Raft leader commit old entries by counting replicas? (interview, sketch)
- Proposed title: A majority had it. It still vanished.
- Primary world: db (five servers' logs as five small tables: index, term, value; rows appear, are copied and overwritten). Secondary: none.
- Hook: a red COMMITTED stamp on a log slot held by 3 of 5 servers; Mira: "Rule: a majority has it, so it's committed. Agree?" Theo: "Always."
- Signature micro-interaction: the proposed rule's stamp is applied, then the term-5 leader overwrites that slot on every server and the stamp tears off; the corrected rule then redraws one edge (counting only current-term entries) and a no-op row appends and commits everything before it.
- Cast: Mira (interviewer asking bounded questions), Theo (candidate, fast and too sure).
- Keep: five servers, entries tagged with their term; alpha leads term 2, copies its entry to beta; alpha crashes, epsilon wins term 3 with gamma and delta votes, writes its own entry in that slot; epsilon crashes, alpha restarts, wins term 4, copies its term-2 entry to gamma; three servers hold it; alpha crashes again, epsilon returns, its last entry is term 3 so beta, gamma, delta vote for it, epsilon leads term 5 and overwrites the slot everywhere; fix: never count replicas for old-term entries, only for the leader's own term; one current-term entry on a majority commits everything before it; many implementations append a no-op on election. Source: Raft paper (Figure 8).

### cons-03 | W1
- File: `content/remake/claude/distributed-consensus-03.json`
- Current title: How do Paxos prepare and accept choose exactly one value? (analogy, paper-cutout)
- Proposed title: Two couriers, one lunch order: who gets written down?
- Primary world: phone (two phones, one per courier, each with an "order lunch" app and a ticket number). Secondary: db (three clerks' notebooks as three tables).
- Hook: two phones side by side; Dana's taps tacos and Eli's taps sushi at the same moment, both show a spinner, three notebooks below stay blank.
- Signature micro-interaction: promise and accept messages travel from phone to notebooks; when Eli's prepare comes back with "tacos accepted under ticket 1", his phone's sushi selection is replaced by tacos; the three notebooks end with the same entry, and toasts on both phones show the one chosen order.
- Cast (4): Dana (courier who wants tacos), Eli (courier who wants sushi), Clerk A and Clerk B (short lines reporting what each notebook holds). The narrator only labels the analogy break at the end.
- Keep: three clerks, two couriers, exactly one order may ever be chosen; Dana takes ticket 1, A and B promise to ignore lower tickets and report nothing accepted yet, Dana writes "ticket one, tacos", two of three notebooks say tacos so tacos are chosen; Eli takes ticket 2, B reports tacos accepted under ticket 1, C reports nothing, so Eli must propose the highest-numbered accepted value and ends up with "ticket two, tacos"; where the analogy stops: real acceptors write state to disk before replying, couriers can outbid each other forever so real systems elect a leader; any two majorities share a clerk. Source: Lamport, Paxos Made Simple.

## 4. Series: networking-protocol-internals (Claude)

### net-01 | W2
- File: `content/remake/claude/networking-protocol-internals-01.json`
- Current title: How do Reno, CUBIC and BBR decide how fast to send? (versus, editorial-dark)
- Proposed title: One link, three senders: who keeps the queue empty?
- Primary world: netmap (three senders feeding one bottleneck router with a visible buffer and a live window counter). Secondary: term.session (`ss` and a sysctl).
- Hook: three sender nodes pour packet trains into a bottleneck router; a buffer bar beside it climbs while every sender still reads "healthy". Tess: "Full buffer. We're winning, right?"
- Signature micro-interaction: a loss event halves Reno's window and CUBIC's cubic curve climbs back; BBR's sender paces at the measured rate and the buffer bar drops to a thin line; flip the link to random loss and the loss-based senders back off every time while BBR keeps going.
- Cast: Tess (network engineer who trusts loss as a signal), Omar (engineer who trusts measurement).
- Keep: Reno doubles its window each round trip until a threshold, then adds one segment per round trip, halves on loss; CUBIC (Linux default) grows along a cubic curve from the last loss, flattening near the old maximum then probing beyond; both wait for loss, so the router buffer is full by then; BBR measures bottleneck bandwidth and minimum round-trip time and paces to the bandwidth-delay product, so the queue stays short; random loss (a flaky radio) makes loss-based senders back off, BBR does not treat each loss as congestion; on Linux the algorithm is a sysctl and `ss` shows each connection's window and round trip time. Sources: RFC 9438 and the ACM Queue BBR article.
- needs research: real `ss -ti` and `sysctl net.ipv4.tcp_congestion_control` lines (capture locally) for the terminal strip.

### net-02 | W3
- File: `content/remake/claude/networking-protocol-internals-02.json`
- Current title: Why does TCP have TIME_WAIT, and what does it protect? (myth-vs-fact, sketch)
- Proposed title: "TIME_WAIT is a leak": a bug report that gets closed
- Primary world: incident (a chat channel plus a dashboard line of sockets in TIME_WAIT; a bug ticket Nova files). Secondary: term.session (`ss` and `sysctl net.ipv4.tcp_tw_reuse`).
- Hook: the dashboard line "sockets in TIME_WAIT" climbs and Nova's chat message lands over it: "These sockets are dead. TIME_WAIT is a leak. Filing a bug."
- Signature micro-interaction: the "Switch it off" fix card gets a red hold when Kit shows the lost-final-ACK case (FIN resent, reset sent back) and a delayed old segment hitting a reused four-tuple; the ticket status flips to "not a bug" and the `tcp_tw_reuse` toggle is shown as the safe knob for outgoing connections.
- Cast (3): Nova (ops engineer who files a bug on sight), Kit (network engineer who has read the RFC), Pim (the service owner whose client runs out of ports).
- Keep: the side that closes first sits in TIME_WAIT; reason one: if the last ACK is lost the server resends its FIN and the client must still exist or it answers with a reset; reason two: a delayed old segment could hit a new connection reusing the same four-tuple (both addresses and both ports); wait is twice the maximum segment lifetime, fixed at sixty seconds in Linux, compiled in; running out of ports: `tcp_tw_reuse` lets new outgoing connections reuse a TIME_WAIT socket, using TCP timestamps to reject old segments; it is a guarantee with a timer. Source: RFC 9293.
- needs research: the dashboard values are illustrative (label them) or captured from a local `ss -s`.

### net-03 | W3
- File: `content/remake/claude/networking-protocol-internals-03.json`
- Current title: How does TLS 1.3 reach encryption in one round trip? (trace, blueprint)
- Proposed title: What is that purple bar in the Network tab?
- Primary world: browser.network (devtools waterfall with the connection phases of one HTTPS request). Secondary: netmap (client and server with packets for ClientHello and ServerHello).
- Hook: devtools Network tab, one request bar appears and its TLS segment lights up; Wen: "Before one page byte moves, two computers agree on a secret, in public."
- Signature micro-interaction: the waterfall bar is annotated step by step; the ClientHello packet carrying the key share crosses the netmap, then the rest of the handshake turns into a lock icon (encrypted); round-trip ticks on the timeline show one for TLS 1.3 against two for TLS 1.2; early data is shown with a "replay" warning flag.
- Cast (2): Wen (frontend dev who sees the bar but not what is inside), Imani (security engineer who explains it).
- Keep: each side makes a one-time key pair; ClientHello carries the browser's public half (an X25519 key share, guessing which group the server accepts); ServerHello carries the server's public half; both run ECDHE and mix with HKDF to the same handshake secrets, nobody sends a secret; everything after ServerHello is encrypted (EncryptedExtensions, Certificate, CertificateVerify, Finished); client verifies chain, signature and Finished, then sends its own Finished and the request; one round trip, TLS 1.2 needed two; with a pre-shared key from an earlier visit early data rides the first flight and can be replayed, so only for requests safe to repeat. Source: RFC 8446.
- needs research: real devtools timing breakdown must come from a real recorded request (or be drawn as unlabelled-number bars only).

## 5. Series: os-virtual-memory (Claude)

### vm-01 | W2
- File: `content/remake/claude/os-virtual-memory-01.json`
- Current title: How does a 4-level x86-64 page walk turn a virtual address into a physical one? (analogy, newsprint)
- Proposed title: Four lookups to read one byte: the page walk
- Primary world: memgrid (a 48-bit address split into four 9-bit slices and a 12-bit offset, four tables in RAM, CR3). Secondary: none (the building analogy is drawn as labels on the tables).
- Hook: a parcel label with five numbers lands next to four stacked directories; Mo: "Four numbers pick rows on four floors?"
- Signature micro-interaction: CR3 lights the top table, each slice indexes one row, the highlighted entry points to the next table, a final entry points to the frame; the walk is then run again with every table read marked as a slow RAM access, then a TLB hit skips the whole chain.
- Cast: Mo (new parcel clerk), Ines (veteran who knows the building).
- Keep: virtual address is 48 bits, four nine-bit indexes then a twelve-bit offset; CR3 holds the physical address of the top directory, index times eight picks the entry; each entry's address bits name the next table (pud, pmd, pte), last entry names the frame, add the offset; where the analogy stops: the directories are in RAM, so a TLB miss means four dependent reads; TLBs cache finished translations, a huge page stops the walk early; Linux names: pgd, p4d, pud, pmd, pte; with four levels p4d is folded away. Source: docs.kernel.org page tables.

### vm-02 | W1
- File: `content/remake/claude/os-virtual-memory-02.json`
- Current title: Does a context switch always flush the TLB? (myth-vs-fact, terminal)
- Proposed title: "Every context switch flushes the TLB": true or a relic?
- Primary world: term.session (Abi inspects the CPU flag and the kernel doc, Zed's claim is typed as a shell comment and challenged). Secondary: whiteboard (two small TLB tables tagged with PCID, under a third).
- Hook: Zed types his claim as the first line of a shell; Abi runs a one-line check for the PCID CPU feature and the answer line appears. Zed: "It has to flush. Physics."
- Signature micro-interaction: two TLB entries for the same virtual page with different frames collide when untagged (the second hits the wrong frame, red); with the PCID tag in the low twelve bits of CR3 they sit side by side; setting bit 63 on the CR3 write turns the "flush" arrow into a dashed, skipped one.
- Cast: Zed (repeats rules read years ago), Abi (kernel developer who reads the manual).
- Keep: the TLB caches virtual page to frame, hit is instant, miss is a page walk; two processes can use the same virtual page for different frames, so untagged entries must be flushed; without PCID loading CR3 on a switch drops every non-global entry; with PCID the low twelve bits of CR3 tag each entry, both entries coexist, bit 63 set on the CR3 write says do not flush; Arm64 tags entries with an ASID held in the TTBR; cleaning other cores differs (x86 sends interrupts, arm64 broadcasts TLB invalidate instructions); a flush is a choice, not a law. Source: docs.kernel.org x86 tlb.
- needs research: the real command and output for the PCID check (for example the cpuinfo flag); label as illustrative if not captured on a real machine.

### vm-03 | W2
- File: `content/remake/claude/os-virtual-memory-03.json`
- Current title: What exactly happens on a page fault? (trace, editorial-dark)
- Proposed title: The CPU stopped mid-instruction. Is that a crash?
- Primary world: debugger (a kernel-side stack with the fault, CR2 in the register panel, the faulting instruction highlighted). Secondary: memgrid (the page table entry being filled in).
- Hook: a debugger paused on one memory instruction, register panel shows an address in CR2; Tomas: "The CPU just stopped. Is that a crash?"
- Signature micro-interaction: the call stack unfolds into the handler frames; a decision tree branches on VMA found or not, permissions, and PTE state (empty, swap, write-protected), each branch lighting once; finally the same instruction re-executes and the memory panel shows the walk succeeding; a SIGSEGV branch is shown as the failing alternative.
- Cast (2): Tomas (newcomer whose program touched a never-used page), Gus (kernel developer who owns the debugger session).
- Keep: the address lands in CR2 and Linux enters exc_page_fault; first question: does a VMA (a memory region the process owns) cover the address; no VMA or a permission violation gives SIGSEGV; otherwise handle_pte_fault reads the page table entry: empty gets a zeroed page or a file's data, a swap entry is read back, a write-protected entry is copied on write; a minor fault finds the page already in memory and only fixes the entry, a major fault waits for disk or swap; the handler returns, the same instruction retries and the walk now succeeds. Source: docs.kernel.org process_addrs.
- needs research: the real frame names between exc_page_fault and handle_pte_fault (for example intermediate frames) before they are shown in the stack panel.

## 6. Series: aosp-boot-sequence (GPT)

### boot-01 | W3
- File: `content/remake/gpt/aosp-boot-sequence-01.json`
- Current title: Debug the verified boot chain (myth-vs-fact, blueprint)
- Proposed title: My signature verifies. Why won't the phone boot it?
- Primary world: device.boot (Isha's test phone after flashing a rebuilt image, boot screen and the bootloader's refusal). Secondary: term.session (avbtool inspecting vbmeta).
- Hook: a test phone's boot screen stops on a warning, a tool window beside it shows "signature OK". Isha: "My signature verifies with test.pem. Why does it refuse?"
- Signature micro-interaction: two gates are drawn on the boot path; the key gate stays closed while the signature check is green ("the device must accept this key"), then an older image meets the rollback gate and a lower rollback index is stamped REJECTED even with a valid signature.
- Cast: Isha (platform engineer with the failing test phone), Kai (bench colleague who turns the terminal toward the metadata). Narrator only for the fictional-lab setting.
- Keep: fictional AOSP lab (keep the spoken "fictional"); a valid signature proves signing under a key, device trust depends on the bootloader accepting that key; signed vbmeta descriptors bind or delegate verification of partition images; rollback protection compares each rollback index in vbmeta with the device's stored value and rejects a lower one even when the signature is valid; the repair habit: verify the descriptor chain, use the key the test device accepts, compare rollback state before flashing. Source: AVB README in external/avb.
- needs research: real `avbtool info_image` field names and the real boot-failure screen wording (do not invent device messages); a StagOS or LineageOS commit touching vbmeta or AVB would let this be a real commit-story (owner preference).

### boot-02 | W1
- File: `content/remake/gpt/aosp-boot-sequence-02.json`
- Current title: Why your init service never starts (trace, terminal)
- Proposed title: keep.
- Primary world: term.session (adb shell on a lab build: the .rc file, the service state). Secondary: none (upgrade to device.boot only if it is ready in time).
- Hook: `ls` shows the demo binary in place, then a process listing for it prints nothing. Isha: "It's declared, the binary exists, and there is no process."
- Signature micro-interaction: the service block is shown with `disabled` highlighted, a "class start" trigger passes it by (dashed), then the missing `trigger` action line is typed and the service state flips from stopped to running.
- Cast (2): Isha (platform engineer), Lior (init owner who reads the log with her).
- Keep: fictional lab; service definition does not equal launch; the `disabled` option means class startup will not start it, an action must request `start demo`; init queues matching actions and runs their commands in order; starting a process does not guarantee readiness, check service state and coordinate readiness separately; check init events, service state and logs after boot. Sources: init README (android17-release and main).
- needs research: the real property (`init.svc.<name>`) and log lines; label as illustrative unless captured.

### boot-03 | W2
- File: `content/remake/gpt/aosp-boot-sequence-03.json`
- Current title: Why root cannot rewrite ro properties (story, blueprint)
- Proposed title: I'm root. Why does setprop on ro.* fail?
- Primary world: debugger (stepping through the property-set path in property_service.cpp: the SELinux permission check and the read-only rule as two separate branches). Secondary: device.boot (the adb shell prompt and the failed setprop line).
- Hook: a root shell prompt and a `setprop` on a ro property returns a failure; the debugger beside it pauses on the check. Isha: "I have root. Why did the write fail?"
- Signature micro-interaction: stepping, the first branch (SELinux label check) turns green, the second (existing read-only value) turns red and returns; a new branch is then shown: change the build-time producer, rebuild, and the property appears at boot.
- Cast (3): Isha (platform engineer with the failing write), Mara (lab engineer who explains the two gates), Pat (reviewer who asks for a policy-approved writable property for runtime state). Pat has one line.
- Keep: fictional `ro.demo.mode` on a disposable test image; SELinux policy decides whether this caller may set the property's labeled type; the property service also rejects replacing an existing read-only ro value; root does not bypass either check; writable properties still need an allowed name and permission for their labeled type; fix the boot-time producer and rebuild; runtime state needs a writable property with appropriate policy. Sources: init/property_service.cpp and the SELinux doc.
- needs research: the real function names and error text in property_service.cpp; a real StagOS or LineageOS commit about a property producer would give this a real-commit variant.

## 7. Series: compilers-optimization-debugging (GPT)

### copt-01 | W1
- File: `content/remake/gpt/compilers-optimization-debugging-01.json`
- Current title: Ask Clang why the loop stayed scalar (build-along, newsprint)
- Proposed title: keep.
- Primary world: term.session (compile the prefix-sum with remark flags, read the output, edit, recompile). Secondary: none.
- Hook: `clang -O3` on a prefix sum prints a missed-vectorization remark pointing at one source line; Nia: "Clang is broken. O3 and still scalar."
- Signature micro-interaction: the source line named by the remark is highlighted in the code pane, the dependency arrow from iteration i to i+1 is drawn on it, then a second, copy-style loop compiles with a different remark (possible overlap) and a runtime-check path appears; the restrict promise is shown as a warning stamp.
- Cast: Nia (author who blames the compiler), Dev (staff engineer who asks for evidence). 
- Keep: a prefix sum has a loop-carried dependency (each iteration reads the previous result); Clang prints success, missed and analysis remarks that separate safety blockers from cost-model choices; in this illustrative prefix sum a remark points to the dependency, check the source line first; a separate copy loop may have overlapping pointers, so the compiler may need runtime checks; use restrict only when callers guarantee no overlap; a vectorized loop is not automatically faster: inspect target instructions (remainder and runtime-check paths) and benchmark realistic lengths and alignment. Sources: Clang UsersManual and LLVM Vectorizers doc.
- needs research: real remark text from a compile of the exact shown loop (capture locally); the flags `-Rpass`, `-Rpass-missed`, `-Rpass-analysis` are from the Clang user manual.

### copt-02 | W3
- File: `content/remake/gpt/compilers-optimization-debugging-02.json`
- Current title: The overflow guard that disappears (predict-it, sketch)
- Proposed title: keep.
- Primary world: review (a pull request with the guard function and a deliberately hidden result). Secondary: term.session (UBSan run).
- Hook: a PR diff for an overflow guard `n + 1 < n` appears with the result of calling it hidden behind a face-down card; the reviewer asks: "What does it return for INT_MAX?"
- Signature micro-interaction: three candidate cards sit face down; only after the question finishes does the correct card flip, and the guard line is greyed out as if removed; then the UBSan run reports the signed overflow when the line executes.
- Cast: Nia (author who thinks the check catches every overflow), Rhea (reviewer who follows the arithmetic).
- Keep: the guard does the overflow first; INT_MAX is the boundary; for signed C integers an unrepresentable result is undefined behavior, not guaranteed wraparound; a compiler reasons about defined executions where n + 1 is greater than n, so the branch cannot be true; compile a harness with UndefinedBehaviorSanitizer and pass the maximum int; check the range before adding or use checked arithmetic; a sanitizer reports executed paths and does not prove unseen inputs safe. Sources: LLVM LangRef and the UBSan doc.
- needs research: real UBSan report line from a local run.

### copt-03 | W2
- File: `content/remake/gpt/compilers-optimization-debugging-03.json`
- Current title: Choose the sanitizer for the failure (versus, editorial-dark)
- Proposed title: Three bugs, three sanitizers: which one catches which?
- Primary world: debugger (three failing cases: a stale pointer, a signed overflow, two threads on one counter; thread panel and call stacks). Secondary: term.session (build lines with the sanitizer flags).
- Hook: a debugger tab strip shows three stopped sessions side by side (stale pointer, overflow, two thread stacks on the same counter); Rin: "One sanitizer flag for all of them. Quick."
- Signature micro-interaction: each case is re-run with a candidate sanitizer; only the matching one lights an error report, the others stay silent (shown as clean runs); then the thread race run shows two stacks touching one variable and the "cannot combine ASan and TSan" build error appears as a stop marker.
- Cast (3): Rin (developer who wants one flag), Sol (staff engineer mapping bug to tool), Bea (triage lead who brought the three reports).
- Keep: AddressSanitizer instruments memory accesses to catch many out-of-bounds and use-after-free errors, costs memory and runtime, reports cover executed paths; UndefinedBehaviorSanitizer checks selected undefined operations including signed integer overflow, reports only when a checked operation executes; ThreadSanitizer detects data races and cannot be combined with AddressSanitizer in one build per the Clang docs; run ASan with UBSan on representative tests, TSan in a separate build; clean runs cover only exercised paths. Sources: the three Clang sanitizer docs.
- needs research: real report text for each sanitizer from a small local repro.

## 8. Series: databases-hands-on-ops (GPT)

### dbops-01 | W1
- File: `content/remake/gpt/databases-hands-on-ops-01.json`
- Current title: Find the first wrong row estimate (interview, sketch)
- Proposed title: keep.
- Primary world: db (a small orders table, the plan tree with estimated vs actual rows per node). Secondary: term.session (psql showing the EXPLAIN ANALYZE text).
- Hook: a plan tree appears with `rows=` estimates next to actuals and one node glows; Mira: "Customer_id is the filter. Index, done?" Dev hides a sticky note labelled "proposed index".
- Signature micro-interaction: starting at the leaves, a marker walks up the tree comparing estimate to actual and stops at the first big mismatch; after ANALYZE refreshes statistics the estimate on that node snaps to the real number, and the loops multiplier is shown applying to per-loop rows.
- Cast: Mira (interviewer), Dev (candidate who proposes the index; hides the answer). Narrator minimal.
- Keep: EXPLAIN ANALYZE executes the statement (use a safe SELECT, writes have side effects); compare estimated and actual rows from the plan leaves upward; rows and times for repeated nodes are per-loop averages, multiply by loops, parent times include children; refresh stale statistics with ANALYZE and rerun; if estimates stay wrong investigate the data distribution rather than forcing the index. Sources: PostgreSQL EXPLAIN docs.
- needs research: a real EXPLAIN ANALYZE capture from a local Postgres with a genuine estimate mismatch (do not hand-write plan numbers).

### dbops-02 | W1
- File: `content/remake/gpt/databases-hands-on-ops-02.json`
- Current title: DELETE did not shrink the table (myth-vs-fact, editorial-dark)
- Proposed title: keep.
- Primary world: term.session (psql: DELETE, then size and dead-tuple queries, then VACUUM). Secondary: db (heap pages with dead row versions greyed out, then reused by new inserts).
- Hook: a table size query printed before and after a big DELETE shows the same number; Mira: "The rows are gone. Why is the file the same?"
- Signature micro-interaction: deleted row versions turn grey but stay in the page; ordinary VACUUM marks the space reusable (grey cells outlined as free) while the file size line does not move; a later insert fills a grey cell; VACUUM FULL is shown as a rewrite with a lock badge.
- Cast: Mira (ops engineer who ran the cleanup), Dev (database engineer who reads the stats), plus Ops-bot only as a log source (not a speaker).
- Keep: MVCC keeps old row versions until no transaction needs them; ordinary VACUUM makes dead space reusable inside the relation and usually does not return it to the operating system; dead-tuple estimates and autovacuum timestamps are clues, not exact bloat measurements; check blockers (old transactions) and vacuum capacity before lowering the scale factor; VACUUM FULL rewrites the table, needs extra disk space and an ACCESS EXCLUSIVE lock; next inserts can reuse the space. Sources: PostgreSQL routine-vacuuming and sql-vacuum docs.
- needs research: real before/after size and dead-tuple counts from a local run.

### dbops-03 | W3
- File: `content/remake/gpt/databases-hands-on-ops-03.json`
- Current title: Find the transaction holding your lock (trace, blueprint)
- Proposed title: The account update froze. Who is blocking it?
- Primary world: incident (support chat plus a dashboard line of waiting sessions; a console panel for pg_blocking_pids). Secondary: term.session.
- Hook: a support ticket lands in the incident channel, "I can't save my account", and the dashboard's waiting-sessions line goes up by one; Mira: "The account update freezes."
- Signature micro-interaction: two session lanes (A and B); B's UPDATE waits, `pg_blocking_pids` returns a pid that is highlighted on A's lane; A is shown idle in transaction; rolling back A in the console releases B and the dashboard line drops and the ticket flips to resolved.
- Cast (3): Mira (engineer who opened the second session), Dev (on-call DBA), Noor (support lead relaying the customer message).
- Keep: PID means Process Identifier; find the waiting session in pg_stat_activity, ask pg_blocking_pids which sessions block it; inspect each blocker's state and transaction start, idle in transaction can still hold locks; row locks are stored on disk, a waiter commonly waits on the holder's transaction ID in pg_locks, so do not match only on relation; verify who is waiting; fix: roll back the forgotten transaction, confirm B resumes, fix the application's transaction scope. Sources: PostgreSQL functions-info, view-pg-locks, monitoring-stats.
- needs research: real pg_stat_activity / pg_blocking_pids outputs from a two-session local repro; dashboard values illustrative or taken from that run.

## 9. Series: distributed-failure-stories (GPT)

### fail-01 | W1
- File: `content/remake/gpt/distributed-failure-stories-01.json`
- Current title: Make stale leaders fail at the storage boundary (analogy, paper-cutout)
- Proposed title: A lease expired. The old worker still wrote.
- Primary world: db (a document row with a `fence` column, writes arriving one by one). Secondary: whiteboard (librarian and checkout-slip analogy cutouts, under a third).
- Hook: a write from worker A with token 41 slides toward a row whose fence column reads 42; Tess: "The lease expired. Why is it still writing?"
- Signature micro-interaction: A's write is rejected at the storage boundary with the fence compared in one step; contrast replay without the check, where the older write overwrites the newer draft; the conditional update (accept only if token is at least the stored one) is shown as one atomic move.
- Cast: Tess (engineer who treats the expiring lease as a kill switch), Gil (distributed-systems engineer who puts the check at storage). Narrator only for the analogy and the fictional-incident label.
- Keep: fictional shared-file incident with illustrative tokens (keep the spoken label); a lease is time-limited permission, not a remote kill switch, a worker can pause, lose contact and resume; each acquisition needs a higher fencing token carried with every protected write; storage remembers the highest accepted token and atomically rejects lower ones; check and write must be atomic, otherwise two requests could read the old value before either stores its token; worker A sends token 41 while storage remembers 42. Source: Kleppmann, How to do distributed locking.

### fail-02 | W2
- File: `content/remake/gpt/distributed-failure-stories-02.json`
- Current title: Measure the retry amplification (build-along, blueprint)
- Proposed title: One payment request becomes 27. How?
- Primary world: netmap (client, service, storage, with packets multiplying on each hop and a counter). Secondary: term.session (the retry code edited in place).
- Hook: one packet leaves the client, splits to three at the service, then to nine at storage, with a counter running to 27; Tess: "Three attempts per layer. What could go wrong?"
- Signature micro-interaction: the retry loops are removed one by one in the editor strip and the packet count on the map collapses; jitter is shown as scattered retry times against a synchronized spike; a timeout shows the write as "unknown" until the same idempotency key returns the stored result.
- Cast: Tess (engineer who drew the payment path), Marek (reviewer who counts the attempts), and Prism (the payment provider's idempotency contract, shown as a card, not a speaker).
- Keep: payment path client, service, storage; three attempts per layer including the first try yields twenty-seven downstream tries for one request; backoff alone can synchronize clients, add jitter by choosing a random delay in a capped exponential window; one layer owns retries; bound attempts and the overall deadline, a retry budget limits recovery traffic across requests; a timeout means unknown, not failed, the write may have committed before the reply was lost; reuse one idempotency key per operation under the provider's deduplication contract, covering the retry window; count application attempts separately from transport retransmissions. Source: AWS Builders' Library on timeouts, retries and backoff with jitter.

### fail-03 | W3
- File: `content/remake/gpt/distributed-failure-stories-03.json`
- Current title: Green health check, broken requests (interview, sketch)
- Proposed title: keep.
- Primary world: browser.network (devtools: a /health request returning instantly in green next to a stuck database-backed read). Secondary: incident (dashboard shown green, chat with the customer's complaint).
- Hook: devtools Network tab with a green, instant health request and a data request below it that never finishes; Tess: "The monitor says healthy. So who's wrong?"
- Signature micro-interaction: the two requests are overlaid on the dependency map (health answers locally, the read goes to the database and waits); then restarting every ready service is tried and shown adding load; finally a bounded read probe from the customer's location appears beside the green check as a second witness and turns red.
- Cast (3): Tess (engineer who sees the green dashboard), Dev (staff engineer playing the interviewer), Amara (the customer whose read stalls, one message).
- Keep: interview drill; the health check answers locally without querying the database; gray failure means one observer sees success while the user-facing path is impaired; slice errors and tail latency by route, zone, shard and caller instead of one average; readiness proves only its configured test passed, synchronized restarts can add load; use bounded representative reads from relevant caller locations with route-level errors and latency, limited so probes add no pressure. Source: Microsoft Research, Gray Failure paper.
- needs research: if the network tab is drawn from a real capture of a local repro, record it; otherwise label all timings illustrative.

## 10. Series: os-syscalls-and-processes (GPT)

### sys-01 | W1
- File: `content/remake/gpt/os-syscalls-and-processes-01.json`
- Current title: Find the startup wait with strace (build-along, terminal)
- Proposed title: The service hangs before its first log line. Where?
- Primary world: term.session (strace with follow-forks and elapsed-time flags; a /proc fd link check). Secondary: none.
- Hook: a service starts and prints nothing; the last strace line (a poll on fd 7) never returns while the cursor blinks. Ren: "It hangs before its first log."
- Signature micro-interaction: the filter is typed flag by flag (-f, -T, the syscall list); when the poll line finally returns its elapsed time appears at the end of the line; the fd number is followed to a socket entry through its descriptor link, and the same capture is repeated after the fix with the wait gone.
- Cast (1 speaker): Ren (Linux engineer who owns the hanging service and works the terminal aloud). The narrator introduces the service and its owner Jo.
- Keep: strace follows children with -f, prints elapsed syscall time with -T, and records network, read, poll and futex calls; a pending poll means waiting for readiness, not burning CPU; elapsed time appears when the call returns; -yy helps decode the descriptor; inspect the process's descriptor link and nearby calls; a socket suggests a network path, a futex wait points toward synchronization, neither alone proves the root cause; repeat startup after the fix, tracing adds overhead so treat timing as diagnostic. Sources: man pages for strace, poll, proc_pid_fd.
- needs research: real strace output from a local reproduction (the script's service is fictional; label the setup but capture real lines).

### sys-02 | W2
- File: `content/remake/gpt/os-syscalls-and-processes-02.json`
- Current title: See fork, exec and spawn from outside (predict-it, sketch)
- Proposed title: Does the PID change after execve?
- Primary world: memgrid (parent and child page mappings: shared frames after fork, replaced image after exec, shared memory under vfork). Secondary: term.session (illustrative trace excerpt).
- Hook: a process box with a PID above it and an `execve` arrow pointing at it, two face-down answer cards beside it (same PID, new PID); Jo: "Predict: after execve, does the child's PID change?"
- Signature micro-interaction: the card flips only after the question; fork makes a second process box mapping the same frames (copy-on-write marked), execve then swaps the contents of the one box while the PID tag stays; vfork shows the parent greyed out until the child execs or exits.
- Cast: Jo (engineer tracing a shell launching a child), Ren (engineer who explains from the memory view).
- Keep: the excerpt is illustrative, shells and libraries pick different system calls (say so); exec replaces the current process image with a new program, it does not create a second process, the child keeps its identifier; fork creates a child with a separate address space, commonly copy-on-write; vfork temporarily shares memory and suspends the parent thread until the child execs or exits; Linux clone flags select sharing (memory, file descriptors); POSIX spawn packages process creation, file actions, attributes and exec; libc details vary. Sources: man pages for fork, execve, clone, posix_spawn.

### sys-03 | W2
- File: `content/remake/gpt/os-syscalls-and-processes-03.json`
- Current title: Stop logging inside signal handlers (story, newsprint)
- Proposed title: A friendly log line in a SIGTERM handler broke shutdown
- Primary world: debugger (the call stack showing printf, then a signal frame stacked on its half-finished state). Secondary: none.
- Hook: debugger paused with `printf` mid-call on the stack and a SIGTERM arriving; a new handler frame appears above it. Jo: "It's a tiny handler. I just log why we stopped."
- Signature micro-interaction: the stack grows a handler frame over printf's frame, the stdio buffer view shows half-updated state, the second printf call corrupts it (red mark); the fix removes the call, sets a flag, and a signalfd read in the event loop shows the ordinary log line printed safely.
- Cast (3): Jo (service author who wants a helpful shutdown log), Hana (systems engineer who keeps handlers tiny), Dev (on-call who sees garbled shutdown logs). Dev has two lines.
- Keep: fictional Linux worker; a signal can interrupt printf while its shared buffer is half updated, calling it again may corrupt output, many library routines share this problem; no allocation or formatted logging in the handler, use async-signal-safe functions and minimal state; in a single-threaded program set a volatile signal-atomic flag and do cleanup in ordinary code; on Linux block chosen signals before starting worker threads, create a signalfd and read records in the normal loop (Linux-specific); sigaction installs a tiny fallback; neither handler should call printf or malloc. Sources: signal-safety(7), signalfd(2), sigaction(2).
- needs research: whether to show real gdb stack output; if shown it must be captured from a small local repro.

## 11. World-coverage table

| World | Primary count | Secondary count | Primary reels |
|---|---:|---:|---|
| debugger | 6 | 0 | build-02, ssa-01, vm-03, boot-03, copt-03, sys-03 |
| term.session | 6 | 13 | build-03, vm-02, boot-02, copt-01, dbops-02, sys-01 |
| review | 3 | 0 | build-01, ssa-03, copt-02 |
| netmap | 3 | 1 | cons-01, net-01, fail-02 |
| db | 3 | 2 | cons-02, dbops-01, fail-01 |
| browser.network | 2 | 0 | net-03, fail-03 |
| incident | 2 | 1 | net-02, dbops-03 |
| memgrid | 2 | 1 | vm-01, sys-02 |
| phone | 1 | 0 | cons-03 |
| device.boot | 1 | 1 | boot-01 |
| whiteboard (mostly) | 1 | 3 | ssa-02 |
| (no secondary) | n/a | 8 | build-03, cons-01, cons-02, vm-01, boot-02, copt-01, sys-01, sys-03 |
| Total | 30 | 30 | |

Checks: cap of 6 respected (debugger 6, term.session 6); whiteboard-primary 1 of an allowed 3; no series repeats a primary (every series has three different primaries).

Note on term.session as a secondary (13): keep it to short command strips (at most 15% of runtime) so it does not make the reels look alike.

## 12. Series that need research

| Series | What to research |
|---|---|
| aosp-build-system | Real file and function names inside build/soong/ui/build for the stack in build-02 (fallback: process tree); the exact Android.mk and Android.bp text already in the script (no new properties). |
| compilers-ssa-and-ir | Verified print of the dominator tree by a real LLVM tool (ssa-02); real arm64 assembly for the GEP and load pair (ssa-03). |
| networking-protocol-internals | Real `ss` and sysctl lines (net-01, net-02); a real recorded devtools timing for net-03; label every dashboard value illustrative if not captured. |
| os-virtual-memory | The PCID check output (vm-02); real frames between exc_page_fault and handle_pte_fault (vm-03). |
| aosp-boot-sequence | Real avbtool info_image fields, device boot-failure wording, init state properties and log lines, property_service.cpp function names and the setprop failure text; a real StagOS or LineageOS commit for a commit-story variant (owner preference). |
| compilers-optimization-debugging | Real clang remark text, UBSan and ASan/TSan report text from small local repros. |
| databases-hands-on-ops | Real EXPLAIN ANALYZE, pg_relation_size, dead-tuple and pg_blocking_pids output from local Postgres runs (nothing hand-written). |
| os-syscalls-and-processes | Real strace output from a local reproduction; optional real gdb stack for sys-03. |
| distributed-consensus, distributed-failure-stories | No research needed; they are labelled illustrative or follow the cited papers. |

## 13. Suggested rewrite order

Wave 1 (worlds that exist: phone, db, term.session). 11 reels, can start now:
1. Claude: cons-02 (db), cons-03 (phone + db), build-03 (term.session), vm-02 (term.session), ssa-02 (whiteboard + term).
2. GPT (Codex): dbops-01 (db + term), dbops-02 (term + db), fail-01 (db), sys-01 (term), copt-01 (term), boot-02 (term).
Do the local-capture research for dbops-01/02, sys-01 and copt-01 first so their terminal output is real.

Wave 2 (needs debugger, memgrid or netmap, built by Claude): 11 reels.
3. Claude: ssa-01, build-02, vm-03 (debugger); vm-01 (memgrid); cons-01, net-01 (netmap).
4. GPT: boot-03, copt-03, sys-03 (debugger); sys-02 (memgrid); fail-02 (netmap).

Wave 3 (needs review, incident, browser.network or device.boot, built by Codex): 8 reels.
5. Claude: build-01, ssa-03 (review); net-02 (incident); net-03 (browser.network).
6. GPT: copt-02 (review); dbops-03 (incident); fail-03 (browser.network); boot-01 (device.boot).

Within each wave keep one reel from each series before starting a second reel of the same series, so the feed gets varied worlds early and consecutive series reels never share a world.

## 14. Things this plan could not settle

- No verified StagOS or LineageOS commit exists in the 15 GPT scripts and only one (build-03) in the Claude set. The boot-sequence series is the best place for more real commits; marked needs research.
- Every metric, plan, trace and report value is deliberately left as "capture from a real local run or label illustrative"; the rewriters must not fill them in from memory.
- Whether the gate counts the one whiteboard reel (ssa-02) as passing the 50% primary-world rule depends on whether the whiteboard is registered as a world; if not, ssa-02 should use term.session as primary and keep the board as a secondary (term.session would then be 7, so move vm-02 to a whiteboard-led build).
