# CodeInsta launch library plan

Status: working draft (owner: Claude orchestrator). Source of truth for what ships at launch. Decisions it implements are in `docs/coordination/decisions.md` (entries of 2026-11-01: genres, style by genre and category, visual kits per scenario, tech-news and papers, reel length 60-90 s with parts, launch library). Topic paths, series and owners come from `content/curriculum.md` and are unchanged: Claude and GPT stay disjoint per topic path.

**300 reels** = 150 `@claude.explains` + 150 GPT. 53 series. 12 long topics are split into 2 parts (24 reels). Every reel is 60-90 s, declares `genre` and `style`, and passes the full QA gate (including `--all-styles`) before upload.

## 0. Legend

**Genres** (10, from the decision): `story`, `war-story`, `trace`, `commit-story`, `myth-vs-fact`, `predict-it`, `build-along`, `versus`, `analogy`, `interview`.

**Styles** (the six ids in `render/src/styles/index.ts`): `sketch`, `editorial-dark`, `blueprint`, `terminal`, `paper-cutout`, `newsprint`. Forced by genre (decision): `war-story`=newsprint, `commit-story`=terminal, `predict-it` and `interview`=sketch. Otherwise the category affinity list below, rotated so neighbouring reels in a series differ in genre AND style (the two parts of a split topic share one style on purpose).

| category | affinity styles used |
|---|---|
| aosp | terminal, blueprint (editorial-dark as fallback) |
| os, compilers | newsprint, terminal, editorial-dark |
| distributed, networking, databases | sketch, blueprint (databases also editorial-dark) |
| linkers, virtualization, architecture | terminal/blueprint, blueprint/terminal/editorial-dark, blueprint/editorial-dark/newsprint |
| product-design | paper-cutout, editorial-dark |
| ml | sketch, editorial-dark |
| papers, tech-news | newsprint, editorial-dark, sketch (papers) / terminal (news) |
| `analogy` anywhere except aosp/news | may also use paper-cutout (my assumption, widens variety) |

**Visual kits** (from the decision "visualization follows the scenario"). `*` = a matching action already exists in `render/src/schema.ts` (phone.*, db.*, cache.*, term.type, code.show, commit.story, `layout:split`); the rest are planned kits the renderer must still add (each with QA expectations and `--all-styles`). Reels list the kits they need; the pilot exercises all of them.

| kit | scenario | | kit | scenario |
|---|---|---|---|---|
| seq.diagram | request flows, handshakes, protocols | | build.graph | build/dependency graph |
| tree | AST, dominators, B-tree, process/scheduler trees | | file.tree | partitions, ELF layout, directory trees |
| timeline.track | scheduler, boot/init, events, clocks | | token.stream | lexer tokens, tokenization |
| packet.flow | packets on a wire, replication traffic | | ir.regalloc | IR, register allocation, asm |
| code.editor* | typing and diff | | page.table | page walk, TLB, EPT |
| chart.plot | loss curve, latency, scatter, benchmarks | | proc.table | process/thread/task table |
| db.table* | tables, rows moving | | matrix | matrix multiply, tensors |
| db.join* | step-by-step join / query | | neuron.diagram | neurons, layers |
| phone* | phone UI, taps, toasts | | wireframe | UI wireframes, filter UI vs query plan |
| memory.map | address space, rings, buffers, heap | | cache.clock | hit/miss with clock/TTL |
| split.compare* | A vs B | | commit.story* | a real StagOS/LineageOS fix (no hashes on screen) |
| terminal* | shell, logcat, perf output | |  |  |

## 1. Summary

### Category x creator

| category | claude | gpt | total | series |
|---|---:|---:|---:|---:|
| aosp | 21 | 22 | 43 | 8 |
| os | 21 | 21 | 42 | 8 |
| compilers | 15 | 15 | 30 | 6 |
| distributed | 16 | 17 | 33 | 6 |
| networking | 6 | 7 | 13 | 2 |
| databases | 6 | 7 | 13 | 2 |
| linkers | 6 | 6 | 12 | 2 |
| virtualization | 6 | 6 | 12 | 2 |
| architecture | 6 | 6 | 12 | 2 |
| product-design | 9 | 12 | 21 | 4 |
| ml | 18 | 11 | 29 | 5 |
| papers | 15 | 15 | 30 | 5 |
| tech-news | 5 | 5 | 10 | 1 |
| **total** | **150** | **150** | **300** | 53 |

Reel counts include part-2 rows (12 splits: Claude 4, GPT 8). ml reels are all five ladder levels; at runtime the feed still serves the ladder adaptively, the library just has every level ready.

### Genre mix (every genre >= 10, none over 30%)

| genre | total | share | claude | gpt | categories |
|---|---:|---:|---:|---:|---|
| trace | 48 | 16.0% | 30 | 18 | aosp 8, os 6, ml 6, compilers 5, papers 5, distributed 4, product-design 4, networking 2, linkers 2, virtualization 2, architecture 2, databases 1, tech-news 1 |
| story | 41 | 13.7% | 12 | 29 | aosp 6, distributed 6, product-design 5, papers 5, os 3, compilers 3, databases 3, ml 3, networking 2, virtualization 2, linkers 1, architecture 1, tech-news 1 |
| predict-it | 39 | 13.0% | 19 | 20 | aosp 5, os 5, compilers 5, ml 5, papers 4, distributed 3, product-design 3, networking 2, linkers 2, architecture 2, databases 1, virtualization 1, tech-news 1 |
| versus | 36 | 12.0% | 23 | 13 | os 5, aosp 4, compilers 4, distributed 4, ml 4, product-design 3, papers 3, databases 2, virtualization 2, tech-news 2, networking 1, linkers 1, architecture 1 |
| myth-vs-fact | 34 | 11.3% | 20 | 14 | os 5, papers 5, compilers 4, distributed 4, aosp 3, ml 3, databases 2, linkers 2, product-design 2, networking 1, virtualization 1, architecture 1, tech-news 1 |
| analogy | 31 | 10.3% | 23 | 8 | os 5, ml 5, papers 5, compilers 3, aosp 2, distributed 2, product-design 2, tech-news 2, networking 1, databases 1, linkers 1, virtualization 1, architecture 1 |
| build-along | 28 | 9.3% | 3 | 25 | os 6, aosp 4, compilers 4, distributed 3, networking 2, virtualization 2, architecture 2, databases 1, linkers 1, product-design 1, ml 1, papers 1 |
| interview | 18 | 6.0% | 11 | 7 | distributed 4, os 2, ml 2, papers 2, compilers 1, networking 1, databases 1, linkers 1, virtualization 1, architecture 1, product-design 1, tech-news 1 |
| war-story | 13 | 4.3% | 4 | 9 | os 5, distributed 3, compilers 1, networking 1, databases 1, architecture 1, tech-news 1 |
| commit-story | 12 | 4.0% | 5 | 7 | aosp 11, linkers 1 |

Tentative genres: the 5 trending-paper slots and the 10 tech-news slots have a planned genre now, but the creator may switch it once the real story is known (the count stays >= 10 for every genre either way, with room: smallest margin is war-story / commit-story).

### Style and kit mix

| style | reels | share |
|---|---:|---:|
| sketch | 82 | 27.3% |
| editorial-dark | 57 | 19.0% |
| blueprint | 45 | 15.0% |
| newsprint | 45 | 15.0% |
| terminal | 44 | 14.7% |
| paper-cutout | 27 | 9.0% |

Kit usage (reels): code.editor 98, terminal 93, timeline.track 83, chart.plot 69, split.compare 66, tree 66, seq.diagram 63, memory.map 49, db.table 47, proc.table 32, file.tree 31, matrix 26, packet.flow 22, phone 17, neuron.diagram 17, build.graph 13, ir.regalloc 13, commit.story 12, wireframe 12, token.stream 9, page.table 7, cache.clock 7, db.join 5.

## 2. Series tables (curriculum order)

Columns: `#` (library id; `P0` = produced in the Batch 0 pilot), creator, topic path (the canonical `topic` id), title (hook question), part, genre, style, visual kits, sources needed. Sources are the minimum to attach in `sources`; every URL is checked at production time.

### Category: aosp

#### aosp-build-system (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L001 | claude | aosp/build/soong-blueprint | Why did Android replace Makefiles with Android.bp? | - | versus | terminal | split.compare, code.editor, build.graph | cs.android.com paths + source.android.com doc |
| L002 | claude | aosp/build/kati-ninja-pipeline | How do Soong, Kati and ninja split the work in a single `m` invocation? | - | trace | blueprint | build.graph, terminal, seq.diagram | cs.android.com paths + source.android.com doc |
| L003 | claude | aosp/build/product-makefile-inheritance | How does `inherit-product` turn one device.mk into a full PRODUCT_PACKAGES list? | - | commit-story | terminal | commit.story, file.tree, code.editor | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L004 | claude | aosp/build/ninja-incremental | How does ninja know exactly what to rebuild after you touch one header? | - | predict-it | sketch | build.graph, terminal | cs.android.com paths + source.android.com doc |
| L005 | claude | aosp/build/dynamic-partitions-super | Why does modern Android pack system, vendor and product into one `super` partition? | - | myth-vs-fact | terminal | file.tree, memory.map, split.compare | cs.android.com paths + source.android.com doc |

#### aosp-treble-hals (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L006 P0 | claude | aosp/treble/system-vendor-split | What did Project Treble actually separate, and why can a GSI boot on your phone? | - | story | blueprint | file.tree, split.compare, phone | cs.android.com paths + source.android.com doc |
| L007 | claude | aosp/treble/vintf-manifests | How do the device manifest and framework compatibility matrix decide if an OTA is allowed? | - | commit-story | terminal | commit.story, code.editor, file.tree | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L008 | claude | aosp/hal/hidl-vs-aidl | Why did Google deprecate HIDL for stable AIDL HALs? | - | versus | blueprint | split.compare, code.editor, seq.diagram | cs.android.com paths + source.android.com doc |
| L009 | claude | aosp/hal/hwservicemanager | How does a client find a HAL: hwservicemanager vs servicemanager vs `lazy` HALs? | - | trace | editorial-dark | seq.diagram, tree, terminal | cs.android.com paths + source.android.com doc |
| L010 | claude | aosp/treble/vndk-linker-namespaces | How does the VNDK keep vendor code from linking against private system libraries? | - | commit-story | terminal | commit.story, tree, code.editor | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |

#### aosp-binder-ipc (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L011 | claude | aosp/binder/driver-transaction | What really happens in the kernel between `transact()` and `onTransact()`? | 1/2 | trace | terminal | seq.diagram, memory.map, timeline.track | cs.android.com paths + source.android.com doc |
| L012 | claude | aosp/binder/driver-transaction | Part 2: And the reply? How does the answer travel back, and what if the server died mid-call? | 2/2 | trace | terminal | seq.diagram, memory.map, timeline.track | cs.android.com paths + source.android.com doc |
| L013 | claude | aosp/binder/parcel-marshalling | How does a Parcel flatten objects, fds and binder handles across processes? | - | analogy | blueprint | memory.map, code.editor | cs.android.com paths + source.android.com doc |
| L014 | claude | aosp/binder/death-recipients | How does Android know a remote service died, and what is `linkToDeath` really watching? | - | commit-story | terminal | commit.story, seq.diagram, code.editor | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L015 | claude | aosp/binder/servicemanager-context | Why is handle 0 special, and how does servicemanager enforce who may register services? | - | myth-vs-fact | blueprint | tree, seq.diagram, file.tree | cs.android.com paths + source.android.com doc |
| L016 | claude | aosp/binder/oneway-async-buffers | What does `oneway` change, and why can async binder transactions exhaust the buffer? | - | predict-it | sketch | memory.map, timeline.track, chart.plot | cs.android.com paths + source.android.com doc |

#### aosp-art-runtime (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L017 | claude | aosp/art/dex-bytecode-format | Why is dex register-based, and what is in a .dex file's string, type and method tables? | - | versus | terminal | split.compare, code.editor, file.tree | cs.android.com paths + source.android.com doc |
| L018 | claude | aosp/art/dex2oat-compiler-filters | What do `verify`, `speed-profile` and `everything` actually compile? | - | predict-it | sketch | terminal, timeline.track, build.graph | cs.android.com paths + source.android.com doc |
| L019 | claude | aosp/art/jit-profile-guided-compilation | How does ART mix interpreter, JIT and profile-guided AOT after an app install? | - | trace | blueprint | timeline.track, code.editor, proc.table | cs.android.com paths + source.android.com doc |
| L020 | claude | aosp/art/concurrent-copying-gc | How does ART's concurrent copying collector avoid long pauses with a read barrier? | - | analogy | newsprint | memory.map, timeline.track | cs.android.com paths + source.android.com doc |
| L021 | claude | aosp/art/boot-image-app-image | What is in `boot.art`, and why does a boot image speed up every app start? | - | commit-story | terminal | commit.story, file.tree, code.editor | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |

#### aosp-boot-sequence (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L022 | gpt | aosp/boot/avb-boot-chain | How does verified boot chain trust from ROM to `vbmeta` to your system image? | - | trace | terminal | timeline.track, tree, file.tree | cs.android.com paths + source.android.com doc |
| L023 | gpt | aosp/boot/init-rc-actions | How do `init.rc` actions, triggers and services decide what starts when? | - | build-along | blueprint | code.editor, terminal, timeline.track | cs.android.com paths + source.android.com doc |
| L024 | gpt | aosp/boot/init-property-service | Why does `setprop` on a `ro.` property fail, and who really owns property_service? | - | commit-story | terminal | commit.story, code.editor, terminal | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L025 | gpt | aosp/boot/zygote-fork-app-start | How does zygote fork a new app in milliseconds without reloading the framework? | 1/2 | story | blueprint | timeline.track, phone, proc.table | cs.android.com paths + source.android.com doc |
| L026 | gpt | aosp/boot/zygote-fork-app-start | Part 2: The app process is forked: how does it become your app, and what does the first frame cost? | 2/2 | story | blueprint | timeline.track, phone, proc.table | cs.android.com paths + source.android.com doc |
| L027 P0 | gpt | aosp/boot/system-server-startup | What is the order in which system_server brings up AMS, WMS and PMS? | - | commit-story | terminal | commit.story, timeline.track, terminal, proc.table | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |

#### aosp-selinux-android (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L028 | gpt | aosp/selinux/contexts-and-labels | How do `file_contexts` and `ls -Z` map a path to a type like `vendor_file`? | - | predict-it | sketch | terminal, file.tree, tree | cs.android.com paths + source.android.com doc |
| L029 | gpt | aosp/selinux/avc-denials-audit2allow | How do you read a `avc: denied` line and write the smallest correct allow rule? | - | commit-story | terminal | commit.story, terminal, code.editor | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L030 | gpt | aosp/selinux/domain-transitions | How does `init` move a daemon into its own domain with `type_transition`? | - | trace | blueprint | tree, seq.diagram, proc.table | cs.android.com paths + source.android.com doc |
| L031 | gpt | aosp/selinux/neverallow-cts | Why does your 'quick' allow rule fail the build with a neverallow violation? | 1/2 | story | sketch | code.editor, terminal, build.graph | cs.android.com paths + source.android.com doc |
| L032 | gpt | aosp/selinux/neverallow-cts | Part 2: The smallest correct fix that passes neverallow and CTS | 2/2 | story | sketch | code.editor, terminal, build.graph | cs.android.com paths + source.android.com doc |
| L033 | gpt | aosp/selinux/vendor-sepolicy-split | How is policy split across system, system_ext, vendor and odm, and what is the compat mapping? | - | commit-story | terminal | commit.story, file.tree, code.editor | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |

#### aosp-hands-on-build (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L034 | gpt | aosp/build/lunch-and-m-targets | What do `lunch`, `m`, `mma` and `mm` really build, and how do you target one module? | - | build-along | terminal | terminal, build.graph | cs.android.com paths + source.android.com doc |
| L035 | gpt | aosp/build/vendor-image | How do you build and inspect only `vendor.img` and see what's inside? | - | predict-it | sketch | terminal, file.tree, memory.map | cs.android.com paths + source.android.com doc |
| L036 | gpt | aosp/build/adb-sync-iterate | How do you iterate on a framework change in seconds with `adb sync` instead of a reflash? | - | build-along | blueprint | terminal, code.editor, timeline.track | cs.android.com paths + source.android.com doc |
| L037 | gpt | aosp/build/ccache-rbe-speed | How do ccache, `--skip-soong-tests` and remote execution cut a 3-hour build? | - | versus | editorial-dark | split.compare, chart.plot, terminal | cs.android.com paths + source.android.com doc |
| L038 | gpt | aosp/build/debugging-bp-errors | What do the most common Soong `Android.bp` errors mean and how do you fix them fast? | - | commit-story | terminal | commit.story, code.editor, terminal | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |

#### aosp-debugging-tools (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L039 | gpt | aosp/debug/logcat-tombstones | How do you go from a native crash tombstone to the exact source line with `ndk-stack`? | - | trace | terminal | terminal, code.editor, memory.map | cs.android.com paths + source.android.com doc |
| L040 | gpt | aosp/debug/perfetto-traces | How do you capture and read a Perfetto trace to find jank? | - | story | blueprint | timeline.track, chart.plot, terminal | cs.android.com paths + source.android.com doc |
| L041 | gpt | aosp/debug/dumpsys-service | What can `dumpsys activity`, `meminfo` and `gfxinfo` tell you that logcat cannot? | - | myth-vs-fact | newsprint | terminal, split.compare, phone | cs.android.com paths + source.android.com doc |
| L042 | gpt | aosp/debug/anr-traces | How do you read `/data/anr` traces to find the deadlocked main thread? | - | commit-story | terminal | commit.story, terminal, proc.table | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L043 | gpt | aosp/debug/lldb-native-attach | How do you attach lldb to a stuck system service and walk the binder thread pool? | - | build-along | blueprint | terminal, code.editor, proc.table | cs.android.com paths + source.android.com doc |

### Category: os

#### os-virtual-memory (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L044 | claude | os/memory/page-table-walk | How does a 4-level x86-64 page walk turn a virtual address into a physical one? | - | analogy | newsprint | page.table, memory.map | kernel.org docs / LWN / man pages |
| L045 P0 | claude | os/memory/tlb-and-asid | Why does a context switch flush the TLB, and how do PCIDs and ASIDs avoid it? | - | myth-vs-fact | terminal | page.table, split.compare, cache.clock | kernel.org docs / LWN / man pages |
| L046 | claude | os/memory/page-fault-lifecycle | What exactly happens, step by step, on a minor vs major page fault? | 1/2 | trace | editorial-dark | proc.table, page.table, timeline.track | kernel.org docs / LWN / man pages |
| L047 | claude | os/memory/page-fault-lifecycle | Part 2: What changes when the fault is major, and the page must come from disk? | 2/2 | trace | editorial-dark | proc.table, page.table, timeline.track | kernel.org docs / LWN / man pages |
| L048 | claude | os/memory/copy-on-write-fork | How can `fork()` of a 10 GB process be instant? | - | predict-it | sketch | memory.map, terminal, proc.table | kernel.org docs / LWN / man pages |
| L049 | claude | os/memory/numa-transparent-hugepages | When do NUMA policy and transparent hugepages help, and when do they hurt latency? | - | versus | newsprint | split.compare, chart.plot, memory.map | kernel.org docs / LWN / man pages |

#### os-scheduling (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L050 | claude | os/scheduling/cfs-vruntime | How does CFS use a red-black tree and `vruntime` to be 'completely fair'? | - | trace | terminal | tree, timeline.track, proc.table | kernel.org docs / LWN / man pages |
| L051 | claude | os/scheduling/eevdf-lag-and-deadlines | Why did Linux 6.6 replace CFS with EEVDF, and what is 'lag'? | - | versus | editorial-dark | split.compare, timeline.track | kernel.org docs / LWN / man pages |
| L052 | claude | os/scheduling/realtime-fifo-deadline | How do SCHED_FIFO, SCHED_RR and SCHED_DEADLINE differ, and how does admission control work? | - | interview | sketch | terminal, timeline.track, chart.plot | kernel.org docs / LWN / man pages |
| L053 | claude | os/scheduling/load-balancing-domains | How do scheduling domains and `load_balance()` spread tasks across cores and NUMA nodes? | - | analogy | paper-cutout | tree, timeline.track, proc.table | kernel.org docs / LWN / man pages |
| L054 | claude | os/scheduling/priority-inversion | How did priority inversion break Mars Pathfinder, and how does priority inheritance fix it? | - | war-story | newsprint | timeline.track, proc.table, seq.diagram | public postmortem URL + date (verify incident is real) |

#### os-synchronization (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L055 | claude | os/sync/futex-fast-path | Why is an uncontended pthread mutex a pure user-space atomic, and when does it call `futex`? | - | predict-it | sketch | code.editor, timeline.track, terminal | kernel.org docs / LWN / man pages |
| L056 | claude | os/sync/rcu-grace-periods | How does RCU let readers run with zero locks while writers free memory safely? | - | analogy | paper-cutout | timeline.track, memory.map | kernel.org docs / LWN / man pages |
| L057 | claude | os/sync/queued-spinlocks | Why did Linux move from ticket locks to MCS-style queued spinlocks? | - | versus | newsprint | split.compare, timeline.track, code.editor | kernel.org docs / LWN / man pages |
| L058 | claude | os/sync/memory-barriers-acquire-release | What do acquire and release barriers guarantee, and why does `volatile` not help? | - | myth-vs-fact | terminal | code.editor, timeline.track | kernel.org docs / LWN / man pages |
| L059 | claude | os/sync/lockless-ring-buffers | How does a single-producer single-consumer ring buffer work without a lock? | - | build-along | editorial-dark | code.editor, memory.map, timeline.track | kernel.org docs / LWN / man pages |

#### os-io-and-filesystems (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L060 | claude | os/io/vfs-dentry-inode | What are the VFS dentry, inode and file objects, and what happens in `open()`? | - | trace | newsprint | tree, file.tree, terminal | kernel.org docs / LWN / man pages |
| L061 | claude | os/io/page-cache-writeback | How does the page cache decide when dirty pages hit disk, and what does `fsync` force? | - | myth-vs-fact | terminal | memory.map, timeline.track, terminal | kernel.org docs / LWN / man pages |
| L062 | claude | os/io/ext4-journaling-modes | What do ext4 `data=ordered` and `data=journal` guarantee after a crash? | - | war-story | newsprint | timeline.track, db.table, file.tree | public postmortem URL + date (verify incident is real) |
| L063 | claude | os/io/io-uring-rings | How do io_uring's submission and completion rings avoid syscalls per I/O? | - | analogy | paper-cutout | memory.map, seq.diagram | kernel.org docs / LWN / man pages |
| L064 | claude | os/io/epoll-readiness-model | Why does epoll scale to 100k sockets when select and poll don't? | - | versus | editorial-dark | split.compare, chart.plot, proc.table | kernel.org docs / LWN / man pages |

#### os-syscalls-and-processes (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L065 | gpt | os/process/strace-syscall-tracing | How do you use `strace -f -T -e trace=` to find why a program hangs on startup? | - | story | newsprint | terminal, proc.table, timeline.track | kernel.org docs / LWN / man pages |
| L066 | gpt | os/process/fork-exec-clone-flags | How do `fork`, `vfork`, `exec` and `clone` flags differ, and what does `posix_spawn` skip? | - | versus | terminal | split.compare, code.editor, proc.table | kernel.org docs / LWN / man pages |
| L067 | gpt | os/process/signals-gotchas | Why are signal handlers so dangerous, and what is `signalfd` or `sigaction` safety? | - | predict-it | sketch | code.editor, terminal, timeline.track | kernel.org docs / LWN / man pages |
| L068 | gpt | os/process/proc-sysfs-introspection | What can you learn from `/proc/<pid>/maps`, `smaps` and `status` without any tools? | - | build-along | editorial-dark | terminal, file.tree, memory.map | kernel.org docs / LWN / man pages |
| L069 | gpt | os/process/zombies-and-reaping | How do zombie and orphan processes appear, and why does PID 1 in a container matter? | - | analogy | paper-cutout | proc.table, tree | kernel.org docs / LWN / man pages |

#### os-containers-isolation (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L070 | gpt | os/containers/namespaces-by-hand | How do you make a mini container with `unshare` and `chroot` in five commands? | - | build-along | newsprint | terminal, proc.table, file.tree | kernel.org docs / LWN / man pages |
| L071 | gpt | os/containers/cgroups-v2-limits | How do you cap memory and CPU for one process tree with cgroup v2? | - | predict-it | sketch | terminal, tree, chart.plot | kernel.org docs / LWN / man pages |
| L072 | gpt | os/containers/seccomp-bpf-filters | How do you write a seccomp-BPF filter that kills a process on `execve`? | - | build-along | terminal | code.editor, terminal | kernel.org docs / LWN / man pages |
| L073 | gpt | os/containers/overlayfs-layers | How does overlayfs stack lowerdir and upperdir to make image layers? | - | trace | editorial-dark | file.tree, tree, split.compare | kernel.org docs / LWN / man pages |
| L074 | gpt | os/containers/capabilities-dropping-root | Why is 'root in a container' not full root, and which capabilities matter? | - | myth-vs-fact | newsprint | terminal, split.compare, proc.table | kernel.org docs / LWN / man pages |

#### os-performance-debugging (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L075 | gpt | os/perf/perf-flamegraphs | How do you go from `perf record -g` to a flame graph to a fix? | - | story | terminal | terminal, chart.plot, tree | kernel.org docs / LWN / man pages |
| L076 | gpt | os/perf/ebpf-bpftrace-oneliners | How do you trace file opens or off-CPU time with a `bpftrace` one-liner? | - | build-along | editorial-dark | terminal, code.editor | kernel.org docs / LWN / man pages |
| L077 | gpt | os/perf/oom-killer-postmortem | How do you read an OOM-killer dmesg dump and find who actually leaked? | 1/2 | war-story | newsprint | terminal, memory.map, timeline.track | public postmortem URL + date (verify incident is real) |
| L078 | gpt | os/perf/oom-killer-postmortem | Part 2: Who really leaked? Reading the OOM dump to the culprit | 2/2 | war-story | newsprint | terminal, memory.map, timeline.track | public postmortem URL + date (verify incident is real) |
| L079 | gpt | os/perf/load-average-vs-cpu | Why is load average 30 on a box with 20% CPU used? | - | myth-vs-fact | terminal | chart.plot, proc.table, terminal | kernel.org docs / LWN / man pages |
| L080 | gpt | os/perf/memory-leak-asan-heaptrack | How do ASan, LeakSanitizer and heaptrack find a leak in a long-running service? | - | interview | sketch | terminal, code.editor, memory.map | kernel.org docs / LWN / man pages |

#### os-kernel-hacking (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L081 | gpt | os/kernel/build-custom-kernel | How do you configure, build and boot your own Linux kernel in an hour? | - | build-along | newsprint | terminal, build.graph, file.tree | kernel.org docs / LWN / man pages |
| L082 | gpt | os/kernel/hello-kernel-module | How do you write, load and debug a minimal loadable kernel module? | - | story | editorial-dark | code.editor, terminal | kernel.org docs / LWN / man pages |
| L083 | gpt | os/kernel/ftrace-kprobes | How do you trace any kernel function live with ftrace and kprobes? | - | trace | terminal | terminal, timeline.track, code.editor | kernel.org docs / LWN / man pages |
| L084 | gpt | os/kernel/qemu-gdb-kernel-debug | How do you single-step the kernel in QEMU with gdb and `vmlinux`? | - | predict-it | sketch | terminal, code.editor, proc.table | kernel.org docs / LWN / man pages |
| L085 | gpt | os/kernel/kdump-crash-analysis | How do you capture a panic with kdump and read it using `crash`? | - | war-story | newsprint | terminal, memory.map, timeline.track | public postmortem URL + date (verify incident is real) |

### Category: compilers

#### compilers-ssa-and-ir (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L086 | claude | compilers/ssa/phi-nodes-and-construction | Why does SSA need phi nodes, and how does Cytron's algorithm place them? | - | trace | newsprint | tree, code.editor | LLVM/GCC docs + source |
| L087 | claude | compilers/ssa/dominator-trees | What is a dominator tree and why does almost every optimization query it? | - | analogy | terminal | tree, code.editor | LLVM/GCC docs + source |
| L088 | claude | compilers/ir/llvm-ir-structure | How do module, function, basic block and instruction nest in LLVM IR, and what is `getelementptr`? | - | myth-vs-fact | editorial-dark | tree, code.editor, file.tree | LLVM/GCC docs + source |
| L089 | claude | compilers/ssa/sccp-constant-propagation | How does sparse conditional constant propagation fold code and prove branches dead at once? | - | predict-it | sketch | code.editor, tree, split.compare | LLVM/GCC docs + source |
| L090 | claude | compilers/ssa/out-of-ssa-lost-copy | What are the 'lost copy' and 'swap' problems when leaving SSA form? | - | story | newsprint | code.editor, ir.regalloc | LLVM/GCC docs + source |

#### compilers-backend (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L091 | claude | compilers/backend/graph-coloring-register-allocation | How does Chaitin-Briggs coloring allocate registers, and what is spilling? | - | analogy | paper-cutout | ir.regalloc, tree | LLVM/GCC docs + source |
| L092 | claude | compilers/backend/linear-scan-allocation | Why do JITs use linear scan instead of graph coloring? | - | versus | terminal | ir.regalloc, split.compare, timeline.track | LLVM/GCC docs + source |
| L093 | claude | compilers/backend/instruction-selection-dag | How does LLVM's SelectionDAG match patterns to pick instructions? | - | trace | editorial-dark | tree, code.editor, ir.regalloc | LLVM/GCC docs + source |
| L094 | claude | compilers/backend/instruction-scheduling | How does a scheduler reorder instructions to hide pipeline latency without changing results? | - | predict-it | sketch | timeline.track, code.editor, ir.regalloc | LLVM/GCC docs + source |
| L095 | claude | compilers/backend/calling-conventions-abi | What decides which registers hold arguments in the System V and AAPCS64 ABIs? | - | myth-vs-fact | newsprint | split.compare, ir.regalloc, memory.map | LLVM/GCC docs + source |

#### compilers-frontend-theory (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L096 | claude | compilers/frontend/regex-to-dfa-lexing | How does a lexer turn a regex into an NFA and then a DFA? | - | trace | terminal | token.stream, tree | LLVM/GCC docs + source |
| L097 | claude | compilers/frontend/ll-vs-lr-parsing | Why can LR parse more grammars than LL, and what is a shift-reduce conflict? | - | versus | editorial-dark | split.compare, tree, token.stream | LLVM/GCC docs + source |
| L098 | claude | compilers/frontend/pratt-parsing | How does a Pratt parser handle operator precedence in 30 lines? | - | build-along | newsprint | code.editor, tree, token.stream | LLVM/GCC docs + source |
| L099 | claude | compilers/frontend/hindley-milner-inference | How does Hindley-Milner infer types with unification and no annotations? | - | predict-it | sketch | code.editor, tree | LLVM/GCC docs + source |
| L100 | claude | compilers/frontend/symbol-tables-scopes | How do compilers resolve names and shadowing with scoped symbol tables? | - | myth-vs-fact | terminal | tree, code.editor | LLVM/GCC docs + source |

#### compilers-llvm-hands-on (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L101 | gpt | compilers/llvm/clang-emit-llvm-ir | How do you see exactly what IR clang emits for a C function, with and without `-O2`? | - | predict-it | sketch | terminal, code.editor, ir.regalloc | LLVM/GCC docs + source |
| L102 | gpt | compilers/llvm/opt-pass-pipeline | How do you list and bisect the pass pipeline with `opt -passes` and `-print-after-all`? | - | trace | editorial-dark | terminal, timeline.track, build.graph | LLVM/GCC docs + source |
| L103 | gpt | compilers/llvm/write-a-function-pass | How do you write a tiny out-of-tree LLVM pass that counts instructions? | - | build-along | newsprint | code.editor, terminal, tree | LLVM/GCC docs + source |
| L104 | gpt | compilers/llvm/inlining-remarks | How do `-Rpass=inline` remarks tell you why a function was or wasn't inlined? | - | story | terminal | terminal, code.editor, tree | LLVM/GCC docs + source |
| L105 | gpt | compilers/llvm/lto-thinlto | What does ThinLTO do differently from full LTO, and how do you enable it in a build? | - | versus | editorial-dark | split.compare, build.graph, chart.plot | LLVM/GCC docs + source |

#### compilers-optimization-debugging (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L106 | gpt | compilers/opt/vectorization-remarks | How do you find out why a loop did not auto-vectorize? | - | story | terminal | terminal, code.editor, chart.plot | LLVM/GCC docs + source |
| L107 P0 | gpt | compilers/opt/undefined-behavior-miscompile | How does signed overflow UB make the compiler delete your bounds check? | - | war-story | newsprint | code.editor, ir.regalloc, terminal | public postmortem URL + date (verify incident is real) |
| L108 | gpt | compilers/opt/sanitizers-asan-ubsan-tsan | What do ASan, UBSan and TSan instrument, and what do they cost? | - | myth-vs-fact | editorial-dark | terminal, split.compare, memory.map | LLVM/GCC docs + source |
| L109 P0 | gpt | compilers/opt/pgo-fdo-workflow | How do you do profile-guided optimization with `-fprofile-generate` and measure the win? | - | build-along | newsprint | terminal, chart.plot, build.graph | LLVM/GCC docs + source |
| L110 | gpt | compilers/opt/godbolt-reading-asm | How do you read compiler-explorer output to verify what your abstraction costs? | - | predict-it | sketch | code.editor, terminal, split.compare | LLVM/GCC docs + source |

#### compilers-jit-runtimes (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L111 | gpt | compilers/jit/toy-jit-mmap-exec | How do you generate x86-64 code at runtime with `mmap` and call it as a function? | - | build-along | newsprint | code.editor, memory.map, terminal | LLVM/GCC docs + source |
| L112 | gpt | compilers/jit/tiered-compilation | How do interpreter, baseline and optimizing tiers decide when to promote code? | - | trace | terminal | timeline.track, chart.plot, code.editor | LLVM/GCC docs + source |
| L113 | gpt | compilers/jit/inline-caches-hidden-classes | How do inline caches and hidden classes make dynamic property access fast? | - | analogy | paper-cutout | memory.map, code.editor, tree | LLVM/GCC docs + source |
| L114 | gpt | compilers/jit/deoptimization-osr | What is on-stack replacement, and how does deoptimization bail out of speculation? | - | interview | sketch | timeline.track, code.editor, proc.table | LLVM/GCC docs + source |
| L115 | gpt | compilers/jit/wasm-baseline-vs-optimizing | How do WebAssembly engines compile with a baseline tier plus an optimizing tier? | - | versus | editorial-dark | split.compare, code.editor, timeline.track | LLVM/GCC docs + source |

### Category: distributed

#### distributed-consensus (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L116 | claude | distributed/consensus/raft-leader-election | How does Raft elect a leader with randomized timeouts and terms? | - | story | blueprint | seq.diagram, timeline.track, proc.table | original paper + system docs |
| L117 | claude | distributed/consensus/raft-log-replication-safety | Why can a Raft leader only commit entries from its own term by counting replicas? | 1/2 | interview | sketch | seq.diagram, tree, db.table | original paper + system docs |
| L118 | claude | distributed/consensus/raft-log-replication-safety | Part 2: The leader crashes mid-commit: which entries survive, and why? | 2/2 | interview | sketch | seq.diagram, tree, db.table | original paper + system docs |
| L119 | claude | distributed/consensus/paxos-single-decree | How do Paxos prepare and accept phases choose exactly one value? | - | analogy | paper-cutout | seq.diagram, timeline.track | original paper + system docs |
| L120 | claude | distributed/consensus/multi-paxos-vs-raft | What does Multi-Paxos leave unspecified that Raft pins down? | - | versus | sketch | split.compare, seq.diagram | original paper + system docs |
| L121 | claude | distributed/consensus/flp-impossibility | What does the FLP result really say about consensus in asynchronous systems? | - | myth-vs-fact | blueprint | seq.diagram, timeline.track | original paper + system docs |

#### distributed-time-and-consistency (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L122 | claude | distributed/time/lamport-clocks | How do Lamport clocks order events, and what can't they tell you? | - | trace | blueprint | timeline.track, seq.diagram | original paper + system docs |
| L123 | claude | distributed/time/vector-clocks | How do vector clocks detect concurrent writes? | - | predict-it | sketch | timeline.track, seq.diagram, db.table | original paper + system docs |
| L124 | claude | distributed/time/hybrid-logical-clocks | How do hybrid logical clocks combine wall time with causality? | - | versus | blueprint | split.compare, timeline.track, cache.clock | original paper + system docs |
| L125 | claude | distributed/time/truetime-spanner | How does Spanner use TrueTime uncertainty and commit-wait for external consistency? | - | story | sketch | timeline.track, chart.plot, db.table | original paper + system docs |
| L126 | claude | distributed/consistency/linearizability-vs-serializability | What is the difference between linearizability and serializability? | - | myth-vs-fact | blueprint | timeline.track, split.compare, db.table | original paper + system docs |

#### distributed-replication-and-crdts (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L127 | claude | distributed/crdt/counters-g-pn | How do G-Counters and PN-Counters converge with only merge-by-max? | - | build-along | blueprint | code.editor, db.table, seq.diagram | original paper + system docs |
| L128 | claude | distributed/crdt/or-set-tombstones | How does an OR-Set resolve add and remove of the same element? | - | predict-it | sketch | db.table, seq.diagram, code.editor | original paper + system docs |
| L129 | claude | distributed/crdt/sequence-crdts-rga | How do text-editing CRDTs like RGA keep character order consistent? | - | analogy | paper-cutout | tree, code.editor, seq.diagram | original paper + system docs |
| L130 | claude | distributed/replication/dynamo-quorums | How do N, R and W quorums trade consistency for availability in Dynamo-style stores? | - | versus | sketch | split.compare, db.table, chart.plot | original paper + system docs |
| L131 | claude | distributed/replication/anti-entropy-merkle-trees | How do Merkle trees find divergent replicas by exchanging only hashes? | - | trace | blueprint | tree, db.table, packet.flow | original paper + system docs |

#### distributed-failure-stories (owner: gpt, 7 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L132 | gpt | distributed/failures/partitions-split-brain | How does a network partition produce split brain, and how do fencing tokens stop it? | 1/2 | war-story | newsprint | seq.diagram, packet.flow, timeline.track | public postmortem URL + date (verify incident is real) |
| L133 | gpt | distributed/failures/partitions-split-brain | Part 2: Two leaders, one truth: how fencing tokens end the split brain | 2/2 | war-story | newsprint | seq.diagram, packet.flow, timeline.track | public postmortem URL + date (verify incident is real) |
| L134 | gpt | distributed/failures/retry-storms-backoff-jitter | How do naive retries turn a blip into an outage, and why is jitter essential? | 1/2 | story | sketch | seq.diagram, chart.plot, packet.flow | original paper + system docs |
| L135 | gpt | distributed/failures/retry-storms-backoff-jitter | Part 2: Add backoff and jitter: why the storm finally calms down | 2/2 | story | sketch | seq.diagram, chart.plot, packet.flow | original paper + system docs |
| L136 | gpt | distributed/failures/gray-failures | What is a gray failure, and why do health checks miss it? | - | myth-vs-fact | blueprint | seq.diagram, chart.plot, cache.clock | original paper + system docs |
| L137 | gpt | distributed/failures/clock-skew-lease-bugs | How does clock skew break lease-based locks? | - | war-story | newsprint | timeline.track, seq.diagram, cache.clock | public postmortem URL + date (verify incident is real) |
| L138 P0 | gpt | distributed/failures/cascading-load-shedding | How do you shed load so one slow dependency doesn't take down everything? | - | interview | sketch | seq.diagram, chart.plot, packet.flow | original paper + system docs |

#### distributed-testing-and-observability (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L139 | gpt | distributed/testing/jepsen-methodology | How does Jepsen find consistency bugs with nemeses and history checkers? | - | story | sketch | timeline.track, db.table, terminal | original paper + system docs |
| L140 | gpt | distributed/testing/chaos-toxiproxy | How do you inject latency and resets with Toxiproxy before production does? | - | build-along | blueprint | terminal, packet.flow, chart.plot | original paper + system docs |
| L141 | gpt | distributed/observability/opentelemetry-tracing | How do trace context and spans propagate across services with OpenTelemetry? | - | trace | editorial-dark | seq.diagram, tree, terminal | original paper + system docs |
| L142 | gpt | distributed/testing/deterministic-simulation | How does deterministic simulation testing replay a distributed bug by seed? | - | predict-it | sketch | terminal, timeline.track, code.editor | original paper + system docs |
| L143 | gpt | distributed/observability/tail-latency-p99 | Why does p99 latency explode with fan-out, and what do hedged requests do? | - | myth-vs-fact | blueprint | chart.plot, seq.diagram, split.compare | original paper + system docs |

#### distributed-building-blocks (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L144 | gpt | distributed/building/idempotency-keys | How do you make a payment endpoint safe to retry with idempotency keys? | - | story | sketch | seq.diagram, db.table, code.editor | original paper + system docs |
| L145 | gpt | distributed/building/outbox-pattern | How does the transactional outbox avoid dual-write bugs between a DB and a queue? | - | versus | blueprint | split.compare, db.table, seq.diagram | original paper + system docs |
| L146 | gpt | distributed/building/consistent-hashing-ring | How do you implement a consistent-hash ring with virtual nodes and measure the balance? | - | build-along | newsprint | code.editor, chart.plot, tree | original paper + system docs |
| L147 | gpt | distributed/building/etcd-lease-leader-election | How do you build leader election on an etcd lease in 40 lines? | - | interview | sketch | code.editor, seq.diagram, tree | original paper + system docs |
| L148 | gpt | distributed/building/kafka-consumer-groups | How do Kafka partitions, offsets and consumer-group rebalances work in practice? | - | trace | blueprint | db.table, seq.diagram, packet.flow | original paper + system docs |

### Category: networking

#### networking-protocol-internals (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L149 | claude | networking/tcp/congestion-control-cubic-bbr | How do Reno, CUBIC and BBR decide how fast to send? | - | versus | blueprint | chart.plot, packet.flow, split.compare | RFC + kernel/tool docs |
| L150 | claude | networking/tcp/state-machine-time-wait | Why does TCP have TIME_WAIT, and what does it protect? | - | myth-vs-fact | sketch | timeline.track, seq.diagram, packet.flow | RFC + kernel/tool docs |
| L151 | claude | networking/tls/tls13-handshake | How does the TLS 1.3 handshake reach encryption in one round trip? | - | trace | blueprint | seq.diagram, packet.flow, tree | RFC + kernel/tool docs |
| L152 | claude | networking/routing/bgp-path-selection | How does BGP pick a path, and how did a leak take down a continent's traffic? | - | war-story | newsprint | packet.flow, tree, seq.diagram | public postmortem URL + date (verify incident is real) |
| L153 | claude | networking/dns/recursive-resolution-caching | What really happens between `getaddrinfo` and an authoritative nameserver? | - | analogy | paper-cutout | seq.diagram, tree, cache.clock | RFC + kernel/tool docs |
| L154 | claude | networking/quic/quic-vs-tcp-head-of-line | How does QUIC remove head-of-line blocking that TCP can't? | - | predict-it | sketch | packet.flow, timeline.track, split.compare | RFC + kernel/tool docs |

#### networking-hands-on-debugging (owner: gpt, 7 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L155 | gpt | networking/debug/tcpdump-wireshark-filters | How do you capture only the packets you need with `tcpdump` and BPF filters? | - | build-along | blueprint | terminal, packet.flow | RFC + kernel/tool docs |
| L156 | gpt | networking/debug/ss-socket-states | How do you use `ss -tnp` to spot SYN backlogs and CLOSE_WAIT leaks? | - | predict-it | sketch | terminal, proc.table, seq.diagram | RFC + kernel/tool docs |
| L157 | gpt | networking/linux/nftables-conntrack | How do nftables rules and conntrack decide a packet's fate? | - | trace | blueprint | tree, packet.flow, terminal | RFC + kernel/tool docs |
| L158 | gpt | networking/linux/netns-veth-lab | How do you build a two-host lab with netns, veth and a bridge in a minute? | - | build-along | sketch | terminal, packet.flow, file.tree | RFC + kernel/tool docs |
| L159 | gpt | networking/debug/mtu-pmtud-blackholes | Why do big packets silently vanish, and how do you prove it's an MTU blackhole? | 1/2 | story | blueprint | packet.flow, terminal, seq.diagram | RFC + kernel/tool docs |
| L160 | gpt | networking/debug/mtu-pmtud-blackholes | Part 2: Proving it is MTU: the ping that finally fails, and the fix | 2/2 | story | blueprint | packet.flow, terminal, seq.diagram | RFC + kernel/tool docs |
| L161 | gpt | networking/debug/dig-trace-dns-failures | How do you debug DNS with `dig +trace` and find a broken delegation? | - | interview | sketch | terminal, seq.diagram, tree | RFC + kernel/tool docs |

### Category: databases

#### databases-storage-engines (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L162 | claude | databases/storage/btree-vs-lsm | When does an LSM-tree beat a B-tree, and what is write amplification? | - | versus | sketch | split.compare, chart.plot, db.table | Postgres/SQLite docs + source |
| L163 | claude | databases/storage/wal-aries-recovery | How does write-ahead logging with ARIES redo and undo recover after a crash? | - | trace | blueprint | db.table, timeline.track, memory.map | Postgres/SQLite docs + source |
| L164 | claude | databases/txn/mvcc-snapshot-isolation | How does MVCC give readers a snapshot without blocking writers, and what is write skew? | - | story | editorial-dark | db.table, timeline.track, db.join | Postgres/SQLite docs + source |
| L165 | claude | databases/txn/two-phase-locking-deadlocks | How does strict 2PL guarantee serializability, and how are deadlocks detected? | - | interview | sketch | db.table, timeline.track, seq.diagram | Postgres/SQLite docs + source |
| L166 | claude | databases/query/planner-cost-model | How does a query planner use statistics to choose between a seq scan and an index? | - | myth-vs-fact | blueprint | db.table, db.join, chart.plot | Postgres/SQLite docs + source |
| L167 P0 | claude | databases/indexing/btree-page-splits | How does a B+tree split pages, and why do random UUID keys hurt? | - | analogy | paper-cutout | tree, db.table, memory.map | Postgres/SQLite docs + source |

#### databases-hands-on-ops (owner: gpt, 7 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L168 | gpt | databases/postgres/explain-analyze-reading | How do you read `EXPLAIN (ANALYZE, BUFFERS)` and spot the estimate that's wrong? | - | predict-it | sketch | terminal, tree, chart.plot | Postgres/SQLite docs + source |
| L169 | gpt | databases/postgres/vacuum-bloat-autovacuum | Why does a table keep growing after DELETE, and how do you tune autovacuum? | 1/2 | story | editorial-dark | db.table, memory.map, terminal | Postgres/SQLite docs + source |
| L170 | gpt | databases/postgres/vacuum-bloat-autovacuum | Part 2: Tuning autovacuum so the table stops growing | 2/2 | story | editorial-dark | db.table, memory.map, terminal | Postgres/SQLite docs + source |
| L171 | gpt | databases/postgres/lock-contention-pg-locks | How do you find who's blocking whom with `pg_locks` and `pg_stat_activity`? | - | build-along | sketch | terminal, db.table, db.join | Postgres/SQLite docs + source |
| L172 | gpt | databases/sqlite/wal-mode-android-room | What does SQLite WAL mode change for Android Room apps? | - | versus | blueprint | split.compare, db.table, timeline.track | Postgres/SQLite docs + source |
| L173 | gpt | databases/ops/replication-lag-debugging | How do you measure and fix streaming replication lag? | - | war-story | newsprint | seq.diagram, timeline.track, terminal | public postmortem URL + date (verify incident is real) |
| L174 | gpt | databases/ops/covering-partial-indexes | How do covering and partial indexes turn a 2s query into 2ms? | - | myth-vs-fact | sketch | db.table, tree, chart.plot | Postgres/SQLite docs + source |

### Category: linkers

#### linkers-elf-internals (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L175 | claude | linkers/elf/sections-vs-segments | What is the difference between ELF sections and program segments? | - | versus | terminal | file.tree, split.compare, memory.map | ELF spec + binutils/ld.so docs |
| L176 | claude | linkers/elf/relocation-types | How do R_X86_64 relocations patch code once addresses are known? | - | trace | blueprint | code.editor, file.tree, terminal | ELF spec + binutils/ld.so docs |
| L177 | claude | linkers/elf/got-plt-lazy-binding | How do the GOT and PLT resolve `printf` lazily at first call? | - | analogy | paper-cutout | memory.map, code.editor, seq.diagram | ELF spec + binutils/ld.so docs |
| L178 | claude | linkers/elf/symbol-resolution-weak-strong | How does the linker resolve duplicate symbols, weak definitions and COMMON? | - | predict-it | sketch | code.editor, terminal, tree | ELF spec + binutils/ld.so docs |
| L179 | claude | linkers/elf/tls-models | How do thread-local variables work across the four ELF TLS models? | - | myth-vs-fact | terminal | memory.map, code.editor, split.compare | ELF spec + binutils/ld.so docs |
| L180 | claude | linkers/loader/execve-elf-loading | What does the kernel do with an ELF on `execve`, and who runs `ld.so`? | - | trace | blueprint | file.tree, proc.table, memory.map | ELF spec + binutils/ld.so docs |

#### linkers-hands-on-debugging (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L181 | gpt | linkers/debug/readelf-objdump-nm-tour | How do you answer 'where did this symbol come from' with readelf, objdump and nm? | - | build-along | terminal | terminal, file.tree | ELF spec + binutils/ld.so docs |
| L182 | gpt | linkers/debug/undefined-reference-archive-order | Why does link order of static libraries matter for 'undefined reference'? | - | story | blueprint | terminal, build.graph, code.editor | ELF spec + binutils/ld.so docs |
| L183 | gpt | linkers/debug/ld-preload-interposition | How does `LD_PRELOAD` interpose malloc, and when does it fail? | - | predict-it | sketch | code.editor, terminal, memory.map | ELF spec + binutils/ld.so docs |
| L184 | gpt | linkers/debug/rpath-runpath-ldd | How do RPATH, RUNPATH and `LD_LIBRARY_PATH` choose which `.so` you get? | - | myth-vs-fact | blueprint | terminal, file.tree, split.compare | ELF spec + binutils/ld.so docs |
| L185 | gpt | linkers/android/bionic-linker-namespaces | How do you debug 'library not found' failures caused by Android linker namespaces? | - | commit-story | terminal | commit.story, terminal, file.tree | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L186 | gpt | linkers/build/linker-scripts-map-files | How do you read a map file and use a linker script to place sections? | - | interview | sketch | file.tree, memory.map, code.editor | ELF spec + binutils/ld.so docs |

### Category: virtualization

#### virtualization-internals (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L187 | claude | virtualization/cpu/vmx-vmexit-loop | How does Intel VT-x run a guest with VMLAUNCH and handle VM exits? | - | trace | blueprint | timeline.track, proc.table, memory.map | Intel SDM / KVM / virtio spec docs |
| L188 | claude | virtualization/memory/ept-nested-paging | How do EPT or NPT make a two-dimensional page walk and what is the cost? | - | analogy | terminal | page.table, memory.map | Intel SDM / KVM / virtio spec docs |
| L189 P0 | claude | virtualization/io/virtio-virtqueues | How do virtio virtqueues share descriptors between guest and host without traps? | - | versus | editorial-dark | split.compare, memory.map, seq.diagram | Intel SDM / KVM / virtio spec docs |
| L190 | claude | virtualization/kvm/kvm-ioctl-lifecycle | What are the `/dev/kvm` ioctls a VMM calls to create and run a vCPU? | - | interview | sketch | code.editor, seq.diagram, proc.table | Intel SDM / KVM / virtio spec docs |
| L191 | claude | virtualization/isolation/iommu-vfio-passthrough | How do the IOMMU and VFIO let a guest own a PCIe device safely? | - | myth-vs-fact | blueprint | memory.map, tree, seq.diagram | Intel SDM / KVM / virtio spec docs |
| L192 | claude | virtualization/android/pkvm-protected-vms | How does pKVM protect VM memory even from the Android host kernel? | - | story | terminal | memory.map, page.table, split.compare | Intel SDM / KVM / virtio spec docs |

#### virtualization-hands-on (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L193 | gpt | virtualization/qemu/qemu-kvm-minimal-boot | How do you boot a minimal Linux guest with QEMU and KVM from a kernel and initramfs? | - | build-along | editorial-dark | terminal, build.graph, file.tree | Intel SDM / KVM / virtio spec docs |
| L194 | gpt | virtualization/qemu/gdb-stub-guest-debug | How do you attach gdb to a QEMU guest and break in early boot? | - | story | blueprint | terminal, code.editor, proc.table | Intel SDM / KVM / virtio spec docs |
| L195 | gpt | virtualization/firecracker/microvm-lab | How do you launch a Firecracker microVM and why does it boot in ~125ms? | - | versus | terminal | split.compare, timeline.track, terminal | Intel SDM / KVM / virtio spec docs |
| L196 | gpt | virtualization/network/tap-bridge-guest-networking | How do TAP devices and a bridge give a VM networking? | - | trace | editorial-dark | packet.flow, tree, terminal | Intel SDM / KVM / virtio spec docs |
| L197 | gpt | virtualization/android/cuttlefish-launch-cvd | How do you run AOSP on Cuttlefish with `launch_cvd` and attach adb? | - | build-along | blueprint | terminal, phone, file.tree | Intel SDM / KVM / virtio spec docs |
| L198 | gpt | virtualization/perf/kvm-stat-vmexits | How do you use `perf kvm stat` to find which VM exits are slowing a guest? | - | predict-it | sketch | terminal, chart.plot, timeline.track | Intel SDM / KVM / virtio spec docs |

### Category: architecture

#### architecture-cpu-internals (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L199 | claude | architecture/cpu/out-of-order-reorder-buffer | How does an out-of-order core use the reorder buffer to keep in-order retirement? | - | trace | blueprint | ir.regalloc, timeline.track, tree | Intel/Arm manuals + paper |
| L200 | claude | architecture/cpu/branch-prediction | How do TAGE-style predictors guess branches with 95%+ accuracy? | - | predict-it | sketch | timeline.track, tree, chart.plot | Intel/Arm manuals + paper |
| L201 | claude | architecture/memory/cache-coherence-mesi | How does MESI keep caches coherent, and what traffic does a write cause? | - | analogy | editorial-dark | memory.map, seq.diagram, timeline.track | Intel/Arm manuals + paper |
| L202 | claude | architecture/memory/memory-ordering-tso-vs-arm | Why does code that works on x86 TSO break on ARM's weaker memory model? | - | versus | blueprint | split.compare, timeline.track, code.editor | Intel/Arm manuals + paper |
| L203 | claude | architecture/cpu/speculation-spectre | How does speculative execution leak data through the cache in Spectre v1? | - | war-story | newsprint | memory.map, cache.clock, code.editor | public postmortem URL + date (verify incident is real) |
| L204 | claude | architecture/isa/arm64-exception-levels | What are EL0 to EL3 on ARM64, and where do the kernel, hypervisor and TrustZone run? | - | interview | sketch | tree, split.compare, proc.table | Intel/Arm manuals + paper |

#### architecture-hands-on-performance (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L205 | gpt | architecture/perf/cache-miss-microbenchmark | How do you write a pointer-chasing microbenchmark that reveals L1, L2 and DRAM latency? | - | build-along | newsprint | code.editor, chart.plot, memory.map | Intel/Arm manuals + paper |
| L206 | gpt | architecture/perf/false-sharing-padding | How does false sharing slow two threads 10x, and how does padding to 64 bytes fix it? | - | story | editorial-dark | memory.map, chart.plot, code.editor | Intel/Arm manuals + paper |
| L207 | gpt | architecture/perf/perf-stat-ipc-counters | What do IPC, cache-misses and branch-misses in `perf stat` tell you? | - | myth-vs-fact | blueprint | terminal, chart.plot | Intel/Arm manuals + paper |
| L208 | gpt | architecture/simd/neon-avx-intrinsics | How do you hand-vectorize a loop with NEON or AVX2 intrinsics and check the speedup? | - | build-along | newsprint | code.editor, matrix, terminal | Intel/Arm manuals + paper |
| L209 | gpt | architecture/isa/reading-arm64-assembly | How do you read ARM64 assembly from objdump well enough to spot a hot loop's cost? | - | trace | editorial-dark | code.editor, terminal, ir.regalloc | Intel/Arm manuals + paper |
| L210 | gpt | architecture/perf/branch-mispredict-sorted-array | Why does sorting an array make the same loop several times faster? | - | predict-it | sketch | code.editor, chart.plot, terminal | Intel/Arm manuals + paper |

### Category: product-design

#### product-design-filters-db-side (owner: claude, 4 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L211 | claude | product-design/filters/db-side-indexes | Why does adding one filter dropdown turn a 20 ms page into a full table scan? | - | story | paper-cutout | phone, db.table, wireframe | Postgres/OpenSearch docs + MDN |
| L212 P0 | claude | product-design/filters/composite-index-column-order | Why does an index on (status, created_at) serve some filters and not others, and how do you pick the column order? | - | predict-it | sketch | db.table, db.join, tree | Postgres/OpenSearch docs + MDN |
| L213 | claude | product-design/filters/explain-query-plans | How do you read EXPLAIN ANALYZE to see whether your filter used an index scan, a bitmap scan or a sequential scan? | - | trace | editorial-dark | terminal, tree, db.table | Postgres/OpenSearch docs + MDN |
| L214 | claude | product-design/filters/keyset-vs-offset-with-filters | Why does page 500 of a filtered list crawl with OFFSET, and how does keyset pagination keep it flat? | - | versus | paper-cutout | split.compare, chart.plot, db.table | Postgres/OpenSearch docs + MDN |

#### product-design-filters-architecture-options (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L215 | gpt | product-design/filters/client-side-filtering | When is it fine to ship every row to the browser and filter in JavaScript, and where does it break down? | - | myth-vs-fact | editorial-dark | wireframe, chart.plot, phone | Postgres/OpenSearch docs + MDN |
| L216 | gpt | product-design/filters/flat-table-materialized-view | How does a denormalized flat table or materialized view replace a five-way join behind your filters? | - | analogy | paper-cutout | db.table, db.join, split.compare | Postgres/OpenSearch docs + MDN |
| L217 P0 | gpt | product-design/filters/search-engine-facets-counts | How does a search engine like OpenSearch return filter results and per-option facet counts in one request? | - | trace | editorial-dark | seq.diagram, wireframe, db.table | Postgres/OpenSearch docs + MDN |
| L218 | gpt | product-design/filters/caching-filter-results | What do you cache for filter queries when the combinations are endless, and how do you invalidate it? | - | story | paper-cutout | cache.clock, seq.diagram, chart.plot | Postgres/OpenSearch docs + MDN |
| L219 | gpt | product-design/filters/filter-state-in-url | Why should filter state live in the URL, and how do you keep it shareable without breaking the back button? | - | predict-it | sketch | wireframe, phone, code.editor | Postgres/OpenSearch docs + MDN |
| L220 | gpt | product-design/filters/which-one-when | Database, client, flat view or search engine: which one do you pick for your row count, filter count and freshness needs? | - | versus | editorial-dark | split.compare, wireframe, chart.plot | Postgres/OpenSearch docs + MDN |

#### product-design-search-box (owner: claude, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L221 | claude | product-design/search/autocomplete-prefix-index | How does autocomplete return suggestions in a few milliseconds while you type? | - | trace | paper-cutout | tree, wireframe, timeline.track | Postgres/OpenSearch docs + MDN |
| L222 | claude | product-design/search/debounce-and-stale-responses | Why can a slow response for 'ca' overwrite the results for 'cat', and how do you stop it? | - | story | editorial-dark | phone, seq.diagram, timeline.track | Postgres/OpenSearch docs + MDN |
| L223 | claude | product-design/search/typo-tolerance | How does a search box still find 'iphne' using edit distance and n-grams? | - | predict-it | sketch | code.editor, tree, wireframe | Postgres/OpenSearch docs + MDN |
| L224 | claude | product-design/search/ranking-basics-bm25 | Why does a rare word in a short title outrank a common word in a long document? | - | myth-vs-fact | paper-cutout | db.table, chart.plot, wireframe | Postgres/OpenSearch docs + MDN |
| L225 | claude | product-design/search/zero-results-and-suggestions | What should a search box do when nothing matches, and how do you use query logs to fix it? | - | interview | sketch | wireframe, db.table, phone | Postgres/OpenSearch docs + MDN |

#### product-design-infinite-feeds (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L226 | gpt | product-design/feeds/offset-pagination-drift | Why do users see duplicate or missing items when new posts arrive between page loads? | 1/2 | story | editorial-dark | phone, db.table, timeline.track | Postgres/OpenSearch docs + MDN |
| L227 | gpt | product-design/feeds/offset-pagination-drift | Part 2: The cursor fix: why the same feed stops drifting | 2/2 | story | editorial-dark | phone, db.table, timeline.track | Postgres/OpenSearch docs + MDN |
| L228 | gpt | product-design/feeds/cursor-pagination | How does a cursor token encode 'where you left off' so the next page is stable and fast? | - | trace | paper-cutout | db.table, seq.diagram, code.editor | Postgres/OpenSearch docs + MDN |
| L229 | gpt | product-design/feeds/infinite-scroll-intersection-observer | How do you trigger the next page load with IntersectionObserver instead of scroll events? | - | build-along | editorial-dark | phone, code.editor, wireframe | Postgres/OpenSearch docs + MDN |
| L230 | gpt | product-design/feeds/list-virtualization | How does list virtualization keep a ten-thousand-item feed smooth by rendering only what is visible? | - | analogy | paper-cutout | phone, memory.map, wireframe | Postgres/OpenSearch docs + MDN |
| L231 | gpt | product-design/feeds/pagination-vs-infinite-scroll | When do numbered pages beat infinite scroll, for footers, back navigation and finding things again? | - | versus | editorial-dark | split.compare, wireframe, phone | Postgres/OpenSearch docs + MDN |

### Category: ml

Adaptive ladder: series are levels L1 to L5 (odd = claude, even = gpt). The launch library holds all five levels; the feed and scheduled agents still decide who sees which level next.

#### ml-l1-foundations (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L232 | claude | ml/foundations/what-is-a-model | What is a machine learning model, really, if you strip away the hype? | - | analogy | editorial-dark | chart.plot, neuron.diagram | paper (arXiv) + framework docs |
| L233 | claude | ml/foundations/linear-regression | How does fitting a straight line to data count as machine learning? | - | predict-it | sketch | chart.plot, matrix | paper (arXiv) + framework docs |
| L234 | claude | ml/foundations/loss-functions | How does a model know it is wrong, and why does the choice of loss change what it learns? | - | versus | editorial-dark | split.compare, chart.plot | paper (arXiv) + framework docs |
| L235 | claude | ml/foundations/gradient-descent | How does gradient descent find good weights by walking downhill on a loss surface? | - | trace | sketch | chart.plot, matrix | paper (arXiv) + framework docs |
| L236 | claude | ml/foundations/train-test-split | Why do we hold back test data, and what goes wrong if we peek at it? | - | story | editorial-dark | db.table, chart.plot | paper (arXiv) + framework docs |
| L237 | claude | ml/foundations/overfitting | Why can a model score 100% on training data and still be useless? | - | myth-vs-fact | sketch | chart.plot, split.compare | paper (arXiv) + framework docs |

#### ml-l2-classic-models (owner: gpt, 5 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L238 | gpt | ml/classic/logistic-regression | How does logistic regression turn a linear score into a probability? | - | trace | editorial-dark | chart.plot, matrix | paper (arXiv) + framework docs |
| L239 | gpt | ml/classic/decision-trees | How does a decision tree decide which question to ask first? | - | predict-it | sketch | tree, db.table | paper (arXiv) + framework docs |
| L240 | gpt | ml/classic/random-forests-boosting | Why do many weak trees, by bagging or boosting, beat one carefully grown tree? | - | versus | editorial-dark | tree, split.compare, chart.plot | paper (arXiv) + framework docs |
| L241 | gpt | ml/classic/precision-recall-roc | Why can a 99% accurate classifier be worthless, and what do precision, recall and ROC show instead? | - | myth-vs-fact | sketch | chart.plot, db.table | paper (arXiv) + framework docs |
| L242 | gpt | ml/classic/regularization | How do L1 and L2 penalties stop a model from memorizing noise? | - | analogy | paper-cutout | chart.plot, matrix | paper (arXiv) + framework docs |

#### ml-l3-neural-nets (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L243 | claude | ml/neural/neurons-and-layers | What does a single artificial neuron compute, and what do stacked layers add? | - | analogy | paper-cutout | neuron.diagram, matrix | paper (arXiv) + framework docs |
| L244 | claude | ml/neural/backpropagation | How does backprop use the chain rule to assign blame to every weight? | 1/2 | trace | editorial-dark | neuron.diagram, matrix, code.editor | paper (arXiv) + framework docs |
| L245 | claude | ml/neural/backpropagation | Part 2: Now the chain rule runs backwards: who gets the blame, and how much? | 2/2 | trace | editorial-dark | neuron.diagram, matrix, code.editor | paper (arXiv) + framework docs |
| L246 | claude | ml/neural/activation-functions | Why would a deep network without activation functions collapse into one linear layer? | - | predict-it | sketch | neuron.diagram, chart.plot, code.editor | paper (arXiv) + framework docs |
| L247 | claude | ml/neural/optimizers-sgd-adam | What does Adam do differently from plain SGD, and why is it the default? | - | versus | editorial-dark | chart.plot, split.compare | paper (arXiv) + framework docs |
| L248 | claude | ml/neural/batch-norm-dropout | How do batch normalization and dropout make deep networks easier to train and less prone to overfit? | - | interview | sketch | neuron.diagram, chart.plot | paper (arXiv) + framework docs |

#### ml-l4-deep-architectures (owner: gpt, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L249 | gpt | ml/architectures/cnn-convolutions | How does a convolution reuse the same small filter across an image, and why does that work? | - | trace | sketch | matrix, neuron.diagram, chart.plot | paper (arXiv) + framework docs |
| L250 | gpt | ml/architectures/embeddings | How does an embedding place words or items in a space where distance means similarity? | - | analogy | paper-cutout | chart.plot, matrix | paper (arXiv) + framework docs |
| L251 | gpt | ml/architectures/rnn-limits | Why do RNNs forget long-range context, and what problem does that create? | - | story | editorial-dark | neuron.diagram, timeline.track | paper (arXiv) + framework docs |
| L252 | gpt | ml/architectures/attention-mechanism | How does attention let every token look directly at every other token? | - | predict-it | sketch | matrix, token.stream, neuron.diagram | paper (arXiv) + framework docs |
| L253 | gpt | ml/architectures/transformer-block | What is inside a transformer block, and why does it parallelize better than an RNN? | - | versus | editorial-dark | split.compare, neuron.diagram, matrix | paper (arXiv) + framework docs |
| L254 P0 | gpt | ml/architectures/tokenization-bpe | Why do language models read subword tokens instead of words or characters? | - | build-along | sketch | token.stream, code.editor, tree | paper (arXiv) + framework docs |

#### ml-l5-training-and-serving (owner: claude, 6 reels)

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L255 | claude | ml/production/data-parallel-mixed-precision | How do data parallelism and mixed precision let you train on many GPUs without a huge slowdown? | - | trace | sketch | timeline.track, chart.plot, matrix | paper (arXiv) + framework docs |
| L256 | claude | ml/production/fine-tuning-lora | How does LoRA fine-tune a huge model by training only two small low-rank matrices per layer? | - | analogy | paper-cutout | matrix, split.compare, code.editor | paper (arXiv) + framework docs |
| L257 P0 | claude | ml/production/quantization | How can you shrink a model to 4-bit weights and keep most of its accuracy? | - | predict-it | sketch | chart.plot, matrix, code.editor, neuron.diagram | paper (arXiv) + framework docs |
| L258 | claude | ml/production/inference-batching | How does continuous batching keep a GPU busy while serving many users at once? | - | story | editorial-dark | timeline.track, chart.plot, proc.table | paper (arXiv) + framework docs |
| L259 | claude | ml/production/kv-cache | Why does a KV cache make token generation faster, and what does it cost in memory? | - | myth-vs-fact | newsprint | memory.map, matrix, timeline.track | paper (arXiv) + framework docs |
| L260 | claude | ml/production/rag-vector-databases | How do RAG and a vector database give a model facts it was never trained on? | - | interview | sketch | seq.diagram, db.table, tree | paper (arXiv) + framework docs |

## 3. papers (30 reels: 15 Claude, 15 GPT)

25 named classics plus 5 trending slots. Every named paper is a paper I am certain exists with these authors, venue and year, but each is marked **verify link at production** (attach DOI/arXiv/official PDF in `sources`; claim only what the paper or its official summary says; no invented numbers). Claude takes papers for topics it owns in the curriculum (e.g. Raft, Spanner, SSA, LoRA), GPT the rest, so no topic overlaps. A paper reel covers the paper (problem, the one key idea, why it mattered, where you see it today); the curriculum reel for the same concept covers the mechanism.

#### papers-os

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L261 | claude | papers/os/unix-time-sharing | How did a tiny OS built by two people in a few years end up shaping every OS since? | - | story | newsprint | file.tree, terminal, tree | Ritchie & Thompson, "The UNIX Time-Sharing System", CACM 1974; verify link at production |
| L262 | gpt | papers/os/mach-microkernel | What if the kernel only did messages and memory, and everything else lived outside it? | - | versus | editorial-dark | split.compare, seq.diagram, memory.map | Accetta, Baron, Bolosky, Golub, Rashid, Tevanian, Young, "Mach: A New Kernel Foundation for UNIX Development", USENIX Summer 1986; verify link at production |
| L263 | claude | papers/os/exokernel | What if the OS stopped abstracting the hardware and just handed it over, safely? | - | analogy | sketch | split.compare, memory.map, page.table | Engler, Kaashoek, O'Toole, "Exokernel: An Operating System Architecture for Application-Level Resource Management", SOSP 1995; verify link at production |
| L264 | gpt | papers/os/sel4-verification | What does it actually mean to prove a kernel has no bugs? | - | myth-vs-fact | newsprint | tree, code.editor, split.compare | Klein et al., "seL4: Formal Verification of an OS Kernel", SOSP 2009; verify link at production |
| L265 | claude | papers/os/wasted-cores | Can a CPU core sit idle while a thread waits in line? | - | predict-it | sketch | timeline.track, chart.plot, proc.table | Lozi, Lepers, Funston, Gaud, Quema, Fedorova, "The Linux Scheduler: a Decade of Wasted Cores", EuroSys 2016; verify link at production |

#### papers-compilers

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L266 | claude | papers/compilers/ssa-cytron | How did one paper make 'assign every variable once' cheap enough to ship in every compiler? | - | trace | editorial-dark | tree, code.editor, ir.regalloc | Cytron, Ferrante, Rosen, Wegman, Zadeck, "Efficiently Computing Static Single Assignment Form and the Control Dependence Graph", TOPLAS 1991; verify link at production |
| L267 | gpt | papers/compilers/llvm-lifelong | Why did one shared compiler design let any language target any chip? | - | analogy | paper-cutout | tree, code.editor, file.tree | Lattner & Adve, "LLVM: A Compilation Framework for Lifelong Program Analysis & Transformation", CGO 2004; verify link at production |
| L268 | gpt | papers/compilers/trusting-trust | Can a compiler hide a backdoor that the source code will never show? | - | story | sketch | code.editor, terminal, token.stream | Thompson, "Reflections on Trusting Trust", CACM 1984; verify link at production |
| L269 | claude | papers/compilers/mlir | Why do ML compilers need a stack of IRs instead of just one? | - | myth-vs-fact | newsprint | tree, split.compare, ir.regalloc | Lattner et al., "MLIR: Scaling Compiler Infrastructure for Domain Specific Computation", CGO 2021; verify link at production |

#### papers-distributed

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L270 | claude | papers/distributed/lamport-time-clocks | If there is no global clock, what does 'before' even mean? | - | analogy | paper-cutout | timeline.track, seq.diagram | Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System", CACM 1978; verify link at production |
| L271 | claude | papers/distributed/paxos-made-simple | Why is Paxos famously hard, and what did 'simple' leave out? | - | interview | sketch | seq.diagram, timeline.track, tree | Lamport, "Paxos Made Simple", ACM SIGACT News 2001; verify link at production |
| L272 | claude | papers/distributed/raft | What did Raft change purely so that humans could understand consensus? | - | myth-vs-fact | editorial-dark | seq.diagram, timeline.track, split.compare | Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm", USENIX ATC 2014; verify link at production |
| L273 | gpt | papers/distributed/dynamo | Why did Amazon build a store that always accepts your shopping-cart write? | - | story | sketch | db.table, seq.diagram, tree | DeCandia et al., "Dynamo: Amazon's Highly Available Key-value Store", SOSP 2007; verify link at production |
| L274 | gpt | papers/distributed/mapreduce | How did two tiny functions let thousands of machines count every word on the web? | - | build-along | newsprint | code.editor, db.table, packet.flow | Dean & Ghemawat, "MapReduce: Simplified Data Processing on Large Clusters", OSDI 2004; verify link at production |
| L275 | gpt | papers/distributed/gfs | Why did Google store files in 64 MB chunks on machines that fail every day? | - | trace | editorial-dark | seq.diagram, tree, db.table | Ghemawat, Gobioff, Leung, "The Google File System", SOSP 2003; verify link at production |
| L276 | claude | papers/distributed/spanner | How can a database spanning continents agree on what 'now' means? | - | story | sketch | timeline.track, chart.plot, db.table | Corbett et al., "Spanner: Google's Globally-Distributed Database", OSDI 2012; verify link at production |
| L277 | gpt | papers/distributed/kafka | Why is a log, not a queue, at the heart of a data pipeline? | - | analogy | paper-cutout | db.table, seq.diagram, packet.flow | Kreps, Narkhede, Rao, "Kafka: a Distributed Messaging System for Log Processing", NetDB 2011; verify link at production |

#### papers-ml

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L278 | gpt | papers/ml/alexnet | How did a GPU-trained network crush ImageNet and restart deep learning? | - | story | newsprint | neuron.diagram, chart.plot, matrix | Krizhevsky, Sutskever, Hinton, "ImageNet Classification with Deep Convolutional Neural Networks", NeurIPS 2012; verify link at production |
| L279 | gpt | papers/ml/word2vec | How does 'king minus man plus woman' land near 'queen' from just predicting nearby words? | - | predict-it | sketch | chart.plot, matrix, token.stream | Mikolov, Chen, Corrado, Dean, "Efficient Estimation of Word Representations in Vector Space", arXiv 2013; verify link at production |
| L280 | gpt | papers/ml/resnet | Why did adding a shortcut let networks go from 20 layers to over 100? | - | trace | editorial-dark | neuron.diagram, chart.plot, matrix | He, Zhang, Ren, Sun, "Deep Residual Learning for Image Recognition", CVPR 2016 (arXiv 2015); verify link at production |
| L281 | claude | papers/ml/attention-is-all-you-need | How did dropping recurrence make models both better and faster to train? | - | versus | newsprint | split.compare, matrix, neuron.diagram | Vaswani et al., "Attention Is All You Need", NeurIPS 2017; verify link at production |
| L282 | gpt | papers/ml/bert | Why does hiding words and asking a model to guess them teach it language? | - | predict-it | sketch | token.stream, matrix, neuron.diagram | Devlin, Chang, Lee, Toutanova, "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", NAACL 2019 (arXiv 2018); verify link at production |
| L283 | claude | papers/ml/scaling-laws | What if model quality is just a straight line on a log-log plot? | - | myth-vs-fact | editorial-dark | chart.plot, split.compare | Kaplan et al., "Scaling Laws for Neural Language Models", arXiv 2020; verify link at production |
| L284 | claude | papers/ml/lora | How can you fine-tune a giant model by changing under 1% of it? | - | interview | sketch | matrix, split.compare, code.editor | Hu et al., "LoRA: Low-Rank Adaptation of Large Language Models", ICLR 2022 (arXiv 2021); verify link at production |
| L285 | claude | papers/ml/flashattention | Why was attention slow because of memory traffic, not math? | - | trace | newsprint | memory.map, matrix, timeline.track | Dao, Fu, Ermon, Rudra, Re, "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness", NeurIPS 2022; verify link at production |

#### papers-trending (5 slots, no titles yet)

Each slot is filled by a live search at production time (recent, widely discussed paper; verified link; at least 2 independent sources that it is trending; date on screen). The genre/kits are provisional. Do not pre-write: pick the paper first, then confirm genre and style.

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L286 | claude | papers/trending/trending-1 | Trending pick 1 (systems or compilers): choose by live search at production time | - | trace | sketch | tree, code.editor, timeline.track | live search at production: paper link + >=2 sources of why it trends; verify link |
| L287 | claude | papers/trending/trending-2 | Trending pick 2 (ML): choose by live search at production time | - | analogy | paper-cutout | chart.plot, matrix, neuron.diagram | live search at production: paper link + >=2 sources of why it trends; verify link |
| L288 | gpt | papers/trending/trending-3 | Trending pick 3 (ML): choose by live search at production time | - | predict-it | sketch | chart.plot, matrix, token.stream | live search at production: paper link + >=2 sources of why it trends; verify link |
| L289 | gpt | papers/trending/trending-4 | Trending pick 4 (distributed or databases): choose by live search at production time | - | versus | editorial-dark | split.compare, seq.diagram, db.table | live search at production: paper link + >=2 sources of why it trends; verify link |
| L290 | gpt | papers/trending/trending-5 | Trending pick 5 (ML systems or compilers): choose by live search at production time | - | myth-vs-fact | newsprint | chart.plot, split.compare, code.editor | live search at production: paper link + >=2 sources of why it trends; verify link |

Named papers I considered but left out (swap-ins if a slot fails verification): Bigtable (Chang et al., OSDI 2006), Adam (Kingma & Ba, ICLR 2015), Dropout (Srivastava et al., JMLR 2014), GPT-3 (Brown et al., NeurIPS 2020), Chinchilla (Hoffmann et al., 2022), DDPM (Ho, Jain, Abbeel, NeurIPS 2020), Chubby (Burrows, OSDI 2006), LFS (Rosenblum & Ousterhout, SOSP 1991).

## 4. tech-news (10 recurring slots, 10 launch reels)

No specific stories are planned here: news must be researched live and never written from memory. Each slot is a template the creator fills on the day. Rules for every slot:

- Research in the same run: web search plus fetch of the primary source. Cite **at least 2 URLs** and the news date in `sources`; say "as of <date>" on screen.
- Set `expires_at` = publish date + 30 days (feed demotes after 14 days, hides at expiry).
- If nothing notable happened for a slot, skip it; do not pad. Slots are produced last (see batch plan) so launch news is fresh, and after launch the scheduled runs post at most one news reel per run.
- Genre, style and kits below are the default for the slot; change only if the story clearly needs it.
- Claude takes the slots about system internals and platforms, GPT the incident/hands-on ones; ownership is by slot, not by story, so the two never duplicate.

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L291 | claude | tech-news/android-aosp-release-notes | Android/AOSP release notes explained (per release) | - | versus | editorial-dark | split.compare, phone, file.tree | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L292 | gpt | tech-news/outage-postmortem-of-the-month | A big outage postmortem of the month, retold (monthly) | - | war-story | newsprint | seq.diagram, timeline.track, packet.flow | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L293 | claude | tech-news/linux-kernel-release-highlights | New Linux kernel release: the 3 changes that matter (per release (~9-10 weeks)) | - | trace | terminal | tree, code.editor, timeline.track | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L294 | gpt | tech-news/compiler-toolchain-release | New compiler/toolchain release (LLVM, GCC, Rust, Go), what it changes for you (per release) | - | predict-it | sketch | terminal, code.editor, ir.regalloc | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L295 | claude | tech-news/open-weight-model-release | New open-weight ML model, explained simply (per notable release) | - | analogy | newsprint | chart.plot, matrix, neuron.diagram | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L296 | gpt | tech-news/security-advisory-of-the-month | Security advisory or CVE of the month in plain words (monthly) | - | story | editorial-dark | terminal, code.editor, proc.table | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L297 | claude | tech-news/database-cloud-release | Major database or cloud-service release, what is actually new (per release) | - | versus | newsprint | split.compare, db.table, chart.plot | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L298 | gpt | tech-news/dev-platform-change | Developer-platform change (Android/iOS/browser API, deprecation) (per change) | - | myth-vs-fact | terminal | phone, code.editor, split.compare | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L299 | claude | tech-news/silicon-announcement | CPU/GPU/NPU announcement, explained without the marketing (per announcement) | - | analogy | newsprint | chart.plot, split.compare, memory.map | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |
| L300 | gpt | tech-news/ai-benchmark-claim-check | AI product or benchmark claim, fact-checked (per claim) | - | interview | sketch | chart.plot, split.compare, terminal | live research: >=2 URLs + news date, "as of <date>" on screen, expires_at +30 d |

## 5. Production order

Every reel: script, `validateReel`, Gemini TTS, render, full QA gate (micro-interactions, `sync.voice-after-visual`, silence under 10%, `--all-styles`), contact sheet. Nothing uploads on a failed gate.

### Batch 0: pilot (12 reels, owner review before bulk production)

One reel per genre (10), plus 2 extra reels to close the kit coverage. Spans 6/6 styles, 6 categories, both creators, and exercises all 23 kits. Owner reviews all 12 (voice, pacing, look per style, kit behaviour) and the verdicts adjust the genre/style mix before Batch 1.

| # | creator | topic path | title (hook) | part | genre | style | visual kits | sources needed |
|---|---|---|---|---|---|---|---|---|
| L006 P0 | claude | aosp/treble/system-vendor-split | What did Project Treble actually separate, and why can a GSI boot on your phone? | - | story | blueprint | file.tree, split.compare, phone | cs.android.com paths + source.android.com doc |
| L107 P0 | gpt | compilers/opt/undefined-behavior-miscompile | How does signed overflow UB make the compiler delete your bounds check? | - | war-story | newsprint | code.editor, ir.regalloc, terminal | public postmortem URL + date (verify incident is real) |
| L217 P0 | gpt | product-design/filters/search-engine-facets-counts | How does a search engine like OpenSearch return filter results and per-option facet counts in one request? | - | trace | editorial-dark | seq.diagram, wireframe, db.table | Postgres/OpenSearch docs + MDN |
| L027 P0 | gpt | aosp/boot/system-server-startup | What is the order in which system_server brings up AMS, WMS and PMS? | - | commit-story | terminal | commit.story, timeline.track, terminal, proc.table | gh api commits (real StagOS/LineageOS fix, URL in sources) + AOSP/kernel source link |
| L045 P0 | claude | os/memory/tlb-and-asid | Why does a context switch flush the TLB, and how do PCIDs and ASIDs avoid it? | - | myth-vs-fact | terminal | page.table, split.compare, cache.clock | kernel.org docs / LWN / man pages |
| L212 P0 | claude | product-design/filters/composite-index-column-order | Why does an index on (status, created_at) serve some filters and not others, and how do you pick the column order? | - | predict-it | sketch | db.table, db.join, tree | Postgres/OpenSearch docs + MDN |
| L257 P0 | claude | ml/production/quantization | How can you shrink a model to 4-bit weights and keep most of its accuracy? | - | predict-it | sketch | chart.plot, matrix, code.editor, neuron.diagram | paper (arXiv) + framework docs |
| L109 P0 | gpt | compilers/opt/pgo-fdo-workflow | How do you do profile-guided optimization with `-fprofile-generate` and measure the win? | - | build-along | newsprint | terminal, chart.plot, build.graph | LLVM/GCC docs + source |
| L254 P0 | gpt | ml/architectures/tokenization-bpe | Why do language models read subword tokens instead of words or characters? | - | build-along | sketch | token.stream, code.editor, tree | paper (arXiv) + framework docs |
| L189 P0 | claude | virtualization/io/virtio-virtqueues | How do virtio virtqueues share descriptors between guest and host without traps? | - | versus | editorial-dark | split.compare, memory.map, seq.diagram | Intel SDM / KVM / virtio spec docs |
| L167 P0 | claude | databases/indexing/btree-page-splits | How does a B+tree split pages, and why do random UUID keys hurt? | - | analogy | paper-cutout | tree, db.table, memory.map | Postgres/SQLite docs + source |
| L138 P0 | gpt | distributed/failures/cascading-load-shedding | How do you shed load so one slow dependency doesn't take down everything? | - | interview | sketch | seq.diagram, chart.plot, packet.flow | original paper + system docs |

Coverage check: 23/23 kits, 6/6 styles, creators 6 claude / 6 gpt. Pilot reels belong to series that continue in later batches (no split topic is in the pilot).

### Batches 1..12 (about 25 reels each, whole series together, no split topic is ever cut across batches)

Order: product-design first (owner-requested category), then ml and its papers, then distributed, os, aosp, compilers, then the smaller categories. Within a batch the creators run in parallel. Paper groups ride with the category they belong to; the last batch holds everything that needs live research so it is produced just before launch.

| batch | reels (excl. pilot) | claude | gpt | series (reels) | notes |
|---|---:|---:|---:|---|---|
| 1 | 25 | 14 | 11 | product-design-filters-db-side (3); product-design-filters-architecture-options (5); product-design-search-box (5); product-design-infinite-feeds (6); ml-l1-foundations (6) | contains split topics: offset-pagination-drift |
| 2 | 29 | 15 | 14 | ml-l2-classic-models (5); ml-l3-neural-nets (6); ml-l4-deep-architectures (5); ml-l5-training-and-serving (5); papers-ml (8) | contains split topics: backpropagation |
| 3 | 22 | 11 | 11 | distributed-consensus (6); distributed-failure-stories (6); distributed-time-and-consistency (5); distributed-testing-and-observability (5) | contains split topics: partitions-split-brain, raft-log-replication-safety, retry-storms-backoff-jitter |
| 4 | 23 | 14 | 9 | distributed-replication-and-crdts (5); distributed-building-blocks (5); papers-distributed (8); os-virtual-memory (5) | contains split topics: page-fault-lifecycle |
| 5 | 26 | 10 | 16 | os-syscalls-and-processes (5); os-scheduling (5); os-containers-isolation (5); os-synchronization (5); os-performance-debugging (6) | contains split topics: oom-killer-postmortem |
| 6 | 25 | 13 | 12 | os-io-and-filesystems (5); os-kernel-hacking (5); papers-os (5); aosp-build-system (5); aosp-hands-on-build (5) |  |
| 7 | 26 | 15 | 11 | aosp-treble-hals (4); aosp-boot-sequence (5); aosp-binder-ipc (6); aosp-selinux-android (6); aosp-art-runtime (5) | contains split topics: driver-transaction, neverallow-cts, zygote-fork-app-start |
| 8 | 23 | 10 | 13 | aosp-debugging-tools (5); compilers-ssa-and-ir (5); compilers-llvm-hands-on (5); compilers-backend (5); compilers-optimization-debugging (3) |  |
| 9 | 27 | 13 | 14 | compilers-frontend-theory (5); compilers-jit-runtimes (5); papers-compilers (4); networking-protocol-internals (6); networking-hands-on-debugging (7) | contains split topics: mtu-pmtud-blackholes |
| 10 | 24 | 11 | 13 | databases-storage-engines (5); databases-hands-on-ops (7); linkers-elf-internals (6); linkers-hands-on-debugging (6) | contains split topics: vacuum-bloat-autovacuum |
| 11 | 23 | 11 | 12 | virtualization-internals (5); virtualization-hands-on (6); architecture-cpu-internals (6); architecture-hands-on-performance (6) |  |
| 12 | 15 | 7 | 8 | papers-trending (5); tech-news-slots (10) | LIVE research; produce within ~72 h of launch; 2+ sources each; news expires +30 d |
| **sum** | **288** | | | plus 12 pilot reels = 300 | |

## 6. Cost and time estimate

Assumptions: a reel averages 75 s of narration (60-90 s target); Gemini TTS about Rs 1.3 per 75 s reel with the paid key (about Rs 0.7 via Batch); render plus QA about 2-3 min of Mac time per reel (both creators share one Mac, so renders run serially); 15% of reels are re-rendered once after a QA failure or owner note (retry allowance); authoring tokens are separate and not costed here. Live-research reels (papers-trending, tech-news) add roughly 5-10 min of research each outside the Mac queue.

| scope | reels | TTS (standard, Rs 1.3) | TTS (Batch, Rs 0.7) | Mac time (2-3 min) |
|---|---:|---:|---:|---:|
| per reel | 1 | Rs 1.3 | Rs 0.7 | 2-3 min |
| Batch 0 pilot | 12 | Rs 16 | Rs 8 | 24-36 min |
| Batch 1 | 25 | Rs 32 | Rs 18 | 50-75 min (0.8 h-1.2 h) |
| Batch 2 | 29 | Rs 38 | Rs 20 | 58-87 min (1.0 h-1.4 h) |
| Batch 3 | 22 | Rs 29 | Rs 15 | 44-66 min (0.7 h-1.1 h) |
| Batch 4 | 23 | Rs 30 | Rs 16 | 46-69 min (0.8 h-1.1 h) |
| Batch 5 | 26 | Rs 34 | Rs 18 | 52-78 min (0.9 h-1.3 h) |
| Batch 6 | 25 | Rs 32 | Rs 18 | 50-75 min (0.8 h-1.2 h) |
| Batch 7 | 26 | Rs 34 | Rs 18 | 52-78 min (0.9 h-1.3 h) |
| Batch 8 | 23 | Rs 30 | Rs 16 | 46-69 min (0.8 h-1.1 h) |
| Batch 9 | 27 | Rs 35 | Rs 19 | 54-81 min (0.9 h-1.4 h) |
| Batch 10 | 24 | Rs 31 | Rs 17 | 48-72 min (0.8 h-1.2 h) |
| Batch 11 | 23 | Rs 30 | Rs 16 | 46-69 min (0.8 h-1.1 h) |
| Batch 12 | 15 | Rs 20 | Rs 10 | 30-45 min (0.5 h-0.8 h) |
| **launch library, first pass** | **300** | **Rs 390** | **Rs 210** | **600-900 min (10.0 h-15.0 h)** |
| + 15% re-render allowance | 45 | Rs 58 | Rs 31 | 90-135 min |
| **all-in** | **345** | **Rs 448** | **Rs 241** | **690-1035 min (11.5 h-17.2 h)** |

Total narration: about 6.2 h of audio. Storage at about 3 MB per MP4: about 0.9 GB. TTS is under Rs 500 for the whole library even without Batch; the real cost is Mac time (about 10-15 h of rendering) and authoring tokens, so run renders overnight in the batches above and keep the QA gate unattended.

## 7. Assumptions and open points

- `system-design` is not a slug in `content/curriculum.md`; system design is covered by `distributed` plus `product-design`. I kept the existing slugs, including networking, databases, linkers, virtualization and architecture, since they already have series and owners.
- Style affinity for networking, databases, linkers, virtualization, architecture, papers and tech-news is not in the decision; the lists above are my assumption (extending the nearest rule). Same for letting `analogy` use paper-cutout.
- Most planned kits do not exist in `render/src/schema.ts` yet (only phone, db, cache, term, code, commit, split layout do). The pilot cannot ship until Codex builds them; the plan lists the needed kit per reel so the renderer backlog can be prioritised (most used first).
- `war-story` reels (13) must each be a real, publicly documented incident with a source URL; the incident is chosen and verified at production (e.g. GitHub 2018 partition, Mars Pathfinder, GitLab 2017, Facebook 2021 BGP, Spectre disclosure). If none can be verified, switch that reel to `story` with a fictional cast and keep the genre count above 10 by promoting another reel.
- `commit-story` reels (12) need real StagOS/LineageOS commits found via `gh api` at production; if no suitable commit exists for a topic, fall back to `trace` for that reel and promote another `commit-story` so the genre stays at least 10.
- ml: the library covers L1-L5; with the adaptive ladder some high-level reels may show later than others. This is fine because the feed already ranks by interest.
