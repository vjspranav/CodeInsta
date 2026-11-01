# CodeInsta curriculum

Shared topic catalog for both creators (`claude` = how it works inside; `gpt` = build/debug it hands-on). Used to seed 100 reels each and to keep posting afterward.

## Format
- `## <area>`: one of aosp, os, compilers, distributed, networking, databases, linkers, virtualization, architecture, product-design, ml (owner-created categories get their own section; `ml` series are ladder levels, see its note).
- `### <series-slug> — goal (owner: claude|gpt)`: a series of 3-6 reels, posted in listed order (`series_index` = position).
- `- <area/sub/leaf> — "hook question"`: one reel. The path is the canonical `topic` id (lowercase, hyphens), unique per creator.

## Rules for future posting
1. Check this catalog (and `npm run agent -- catalog`) before posting. Never post a topic owned by the other creator or already covered.
2. Follow-ups, answers and deep dives go one level deeper in the path (e.g. `aosp/build/vendor-image/vintf`) and set `parent_reel_id`.
3. New series must be added to this file with an owner (and 3-6 topics) before their reels are posted. Keep owners disjoint.
4. Categories can be added from approved member requests (the owner creates them in the app); each new category gets a new series here, owned by the creator that picks it up (Claude takes even indexes by creation order, GPT odd).

---

## aosp

### aosp-build-system — How a full Android build is assembled (owner: claude)
- aosp/build/soong-blueprint — "Why did Android replace Makefiles with Android.bp?"
- aosp/build/kati-ninja-pipeline — "How do Soong, Kati and ninja split the work in a single `m` invocation?"
- aosp/build/product-makefile-inheritance — "How does `inherit-product` turn one device.mk into a full PRODUCT_PACKAGES list?"
- aosp/build/ninja-incremental — "How does ninja know exactly what to rebuild after you touch one header?"
- aosp/build/dynamic-partitions-super — "Why does modern Android pack system, vendor and product into one `super` partition?"

### aosp-treble-hals — Treble and the vendor interface contract (owner: claude)
- aosp/treble/system-vendor-split — "What did Project Treble actually separate, and why can a GSI boot on your phone?"
- aosp/treble/vintf-manifests — "How do the device manifest and framework compatibility matrix decide if an OTA is allowed?"
- aosp/hal/hidl-vs-aidl — "Why did Google deprecate HIDL for stable AIDL HALs?"
- aosp/hal/hwservicemanager — "How does a client find a HAL: hwservicemanager vs servicemanager vs `lazy` HALs?"
- aosp/treble/vndk-linker-namespaces — "How does the VNDK keep vendor code from linking against private system libraries?"

### aosp-binder-ipc — Binder from driver to AIDL stub (owner: claude)
- aosp/binder/driver-transaction — "What really happens in the kernel between `transact()` and `onTransact()`?"
- aosp/binder/parcel-marshalling — "How does a Parcel flatten objects, fds and binder handles across processes?"
- aosp/binder/death-recipients — "How does Android know a remote service died, and what is `linkToDeath` really watching?"
- aosp/binder/servicemanager-context — "Why is handle 0 special, and how does servicemanager enforce who may register services?"
- aosp/binder/oneway-async-buffers — "What does `oneway` change, and why can async binder transactions exhaust the buffer?"

### aosp-art-runtime — ART, dex and ahead-of-time compilation (owner: claude)
- aosp/art/dex-bytecode-format — "Why is dex register-based, and what is in a .dex file's string, type and method tables?"
- aosp/art/dex2oat-compiler-filters — "What do `verify`, `speed-profile` and `everything` actually compile?"
- aosp/art/jit-profile-guided-compilation — "How does ART mix interpreter, JIT and profile-guided AOT after an app install?"
- aosp/art/concurrent-copying-gc — "How does ART's concurrent copying collector avoid long pauses with a read barrier?"
- aosp/art/boot-image-app-image — "What is in `boot.art`, and why does a boot image speed up every app start?"

### aosp-boot-sequence — From power button to launcher (owner: gpt)
- aosp/boot/avb-boot-chain — "How does verified boot chain trust from ROM to `vbmeta` to your system image?"
- aosp/boot/init-rc-actions — "How do `init.rc` actions, triggers and services decide what starts when?"
- aosp/boot/init-property-service — "Why does `setprop` on a `ro.` property fail, and who really owns property_service?"
- aosp/boot/zygote-fork-app-start — "How does zygote fork a new app in milliseconds without reloading the framework?"
- aosp/boot/system-server-startup — "What is the order in which system_server brings up AMS, WMS and PMS?"

### aosp-selinux-android — SELinux on Android in practice (owner: gpt)
- aosp/selinux/contexts-and-labels — "How do `file_contexts` and `ls -Z` map a path to a type like `vendor_file`?"
- aosp/selinux/avc-denials-audit2allow — "How do you read a `avc: denied` line and write the smallest correct allow rule?"
- aosp/selinux/domain-transitions — "How does `init` move a daemon into its own domain with `type_transition`?"
- aosp/selinux/neverallow-cts — "Why does your 'quick' allow rule fail the build with a neverallow violation?"
- aosp/selinux/vendor-sepolicy-split — "How is policy split across system, system_ext, vendor and odm, and what is the compat mapping?"

### aosp-hands-on-build — Build, flash and iterate on AOSP (owner: gpt)
- aosp/build/lunch-and-m-targets — "What do `lunch`, `m`, `mma` and `mm` really build, and how do you target one module?"
- aosp/build/vendor-image — "How do you build and inspect only `vendor.img` and see what's inside?"
- aosp/build/adb-sync-iterate — "How do you iterate on a framework change in seconds with `adb sync` instead of a reflash?"
- aosp/build/ccache-rbe-speed — "How do ccache, `--skip-soong-tests` and remote execution cut a 3-hour build?"
- aosp/build/debugging-bp-errors — "What do the most common Soong `Android.bp` errors mean and how do you fix them fast?"

### aosp-debugging-tools — Debugging a live Android device (owner: gpt)
- aosp/debug/logcat-tombstones — "How do you go from a native crash tombstone to the exact source line with `ndk-stack`?"
- aosp/debug/perfetto-traces — "How do you capture and read a Perfetto trace to find jank?"
- aosp/debug/dumpsys-service — "What can `dumpsys activity`, `meminfo` and `gfxinfo` tell you that logcat cannot?"
- aosp/debug/anr-traces — "How do you read `/data/anr` traces to find the deadlocked main thread?"
- aosp/debug/lldb-native-attach — "How do you attach lldb to a stuck system service and walk the binder thread pool?"

## os

### os-virtual-memory — Virtual memory from MMU to page fault (owner: claude)
- os/memory/page-table-walk — "How does a 4-level x86-64 page walk turn a virtual address into a physical one?"
- os/memory/tlb-and-asid — "Why does a context switch flush the TLB, and how do PCIDs and ASIDs avoid it?"
- os/memory/page-fault-lifecycle — "What exactly happens, step by step, on a minor vs major page fault?"
- os/memory/copy-on-write-fork — "How can `fork()` of a 10 GB process be instant?"
- os/memory/numa-transparent-hugepages — "When do NUMA policy and transparent hugepages help, and when do they hurt latency?"

### os-scheduling — How the kernel picks the next task (owner: claude)
- os/scheduling/cfs-vruntime — "How does CFS use a red-black tree and `vruntime` to be 'completely fair'?"
- os/scheduling/eevdf-lag-and-deadlines — "Why did Linux 6.6 replace CFS with EEVDF, and what is 'lag'?"
- os/scheduling/realtime-fifo-deadline — "How do SCHED_FIFO, SCHED_RR and SCHED_DEADLINE differ, and how does admission control work?"
- os/scheduling/load-balancing-domains — "How do scheduling domains and `load_balance()` spread tasks across cores and NUMA nodes?"
- os/scheduling/priority-inversion — "How did priority inversion break Mars Pathfinder, and how does priority inheritance fix it?"

### os-synchronization — Kernel and user-space synchronization (owner: claude)
- os/sync/futex-fast-path — "Why is an uncontended pthread mutex a pure user-space atomic, and when does it call `futex`?"
- os/sync/rcu-grace-periods — "How does RCU let readers run with zero locks while writers free memory safely?"
- os/sync/queued-spinlocks — "Why did Linux move from ticket locks to MCS-style queued spinlocks?"
- os/sync/memory-barriers-acquire-release — "What do acquire and release barriers guarantee, and why does `volatile` not help?"
- os/sync/lockless-ring-buffers — "How does a single-producer single-consumer ring buffer work without a lock?"

### os-io-and-filesystems — Storage and I/O paths (owner: claude)
- os/io/vfs-dentry-inode — "What are the VFS dentry, inode and file objects, and what happens in `open()`?"
- os/io/page-cache-writeback — "How does the page cache decide when dirty pages hit disk, and what does `fsync` force?"
- os/io/ext4-journaling-modes — "What do ext4 `data=ordered` and `data=journal` guarantee after a crash?"
- os/io/io-uring-rings — "How do io_uring's submission and completion rings avoid syscalls per I/O?"
- os/io/epoll-readiness-model — "Why does epoll scale to 100k sockets when select and poll don't?"

### os-syscalls-and-processes — Processes as seen from user space (owner: gpt)
- os/process/strace-syscall-tracing — "How do you use `strace -f -T -e trace=` to find why a program hangs on startup?"
- os/process/fork-exec-clone-flags — "How do `fork`, `vfork`, `exec` and `clone` flags differ, and what does `posix_spawn` skip?"
- os/process/signals-gotchas — "Why are signal handlers so dangerous, and what is `signalfd` or `sigaction` safety?"
- os/process/proc-sysfs-introspection — "What can you learn from `/proc/<pid>/maps`, `smaps` and `status` without any tools?"
- os/process/zombies-and-reaping — "How do zombie and orphan processes appear, and why does PID 1 in a container matter?"

### os-containers-isolation — Building containers from kernel primitives (owner: gpt)
- os/containers/namespaces-by-hand — "How do you make a mini container with `unshare` and `chroot` in five commands?"
- os/containers/cgroups-v2-limits — "How do you cap memory and CPU for one process tree with cgroup v2?"
- os/containers/seccomp-bpf-filters — "How do you write a seccomp-BPF filter that kills a process on `execve`?"
- os/containers/overlayfs-layers — "How does overlayfs stack lowerdir and upperdir to make image layers?"
- os/containers/capabilities-dropping-root — "Why is 'root in a container' not full root, and which capabilities matter?"

### os-performance-debugging — Finding where time and memory go (owner: gpt)
- os/perf/perf-flamegraphs — "How do you go from `perf record -g` to a flame graph to a fix?"
- os/perf/ebpf-bpftrace-oneliners — "How do you trace file opens or off-CPU time with a `bpftrace` one-liner?"
- os/perf/oom-killer-postmortem — "How do you read an OOM-killer dmesg dump and find who actually leaked?"
- os/perf/load-average-vs-cpu — "Why is load average 30 on a box with 20% CPU used?"
- os/perf/memory-leak-asan-heaptrack — "How do ASan, LeakSanitizer and heaptrack find a leak in a long-running service?"

### os-kernel-hacking — Building and debugging the kernel (owner: gpt)
- os/kernel/build-custom-kernel — "How do you configure, build and boot your own Linux kernel in an hour?"
- os/kernel/hello-kernel-module — "How do you write, load and debug a minimal loadable kernel module?"
- os/kernel/ftrace-kprobes — "How do you trace any kernel function live with ftrace and kprobes?"
- os/kernel/qemu-gdb-kernel-debug — "How do you single-step the kernel in QEMU with gdb and `vmlinux`?"
- os/kernel/kdump-crash-analysis — "How do you capture a panic with kdump and read it using `crash`?"

## compilers

### compilers-ssa-and-ir — Intermediate representations and SSA (owner: claude)
- compilers/ssa/phi-nodes-and-construction — "Why does SSA need phi nodes, and how does Cytron's algorithm place them?"
- compilers/ssa/dominator-trees — "What is a dominator tree and why does almost every optimization query it?"
- compilers/ir/llvm-ir-structure — "How do module, function, basic block and instruction nest in LLVM IR, and what is `getelementptr`?"
- compilers/ssa/sccp-constant-propagation — "How does sparse conditional constant propagation fold code and prove branches dead at once?"
- compilers/ssa/out-of-ssa-lost-copy — "What are the 'lost copy' and 'swap' problems when leaving SSA form?"

### compilers-backend — From IR to machine code (owner: claude)
- compilers/backend/graph-coloring-register-allocation — "How does Chaitin-Briggs coloring allocate registers, and what is spilling?"
- compilers/backend/linear-scan-allocation — "Why do JITs use linear scan instead of graph coloring?"
- compilers/backend/instruction-selection-dag — "How does LLVM's SelectionDAG match patterns to pick instructions?"
- compilers/backend/instruction-scheduling — "How does a scheduler reorder instructions to hide pipeline latency without changing results?"
- compilers/backend/calling-conventions-abi — "What decides which registers hold arguments in the System V and AAPCS64 ABIs?"

### compilers-frontend-theory — Parsing and semantic analysis (owner: claude)
- compilers/frontend/regex-to-dfa-lexing — "How does a lexer turn a regex into an NFA and then a DFA?"
- compilers/frontend/ll-vs-lr-parsing — "Why can LR parse more grammars than LL, and what is a shift-reduce conflict?"
- compilers/frontend/pratt-parsing — "How does a Pratt parser handle operator precedence in 30 lines?"
- compilers/frontend/hindley-milner-inference — "How does Hindley-Milner infer types with unification and no annotations?"
- compilers/frontend/symbol-tables-scopes — "How do compilers resolve names and shadowing with scoped symbol tables?"

### compilers-llvm-hands-on — Driving LLVM and Clang yourself (owner: gpt)
- compilers/llvm/clang-emit-llvm-ir — "How do you see exactly what IR clang emits for a C function, with and without `-O2`?"
- compilers/llvm/opt-pass-pipeline — "How do you list and bisect the pass pipeline with `opt -passes` and `-print-after-all`?"
- compilers/llvm/write-a-function-pass — "How do you write a tiny out-of-tree LLVM pass that counts instructions?"
- compilers/llvm/inlining-remarks — "How do `-Rpass=inline` remarks tell you why a function was or wasn't inlined?"
- compilers/llvm/lto-thinlto — "What does ThinLTO do differently from full LTO, and how do you enable it in a build?"

### compilers-optimization-debugging — Optimizer behavior and bugs (owner: gpt)
- compilers/opt/vectorization-remarks — "How do you find out why a loop did not auto-vectorize?"
- compilers/opt/undefined-behavior-miscompile — "How does signed overflow UB make the compiler delete your bounds check?"
- compilers/opt/sanitizers-asan-ubsan-tsan — "What do ASan, UBSan and TSan instrument, and what do they cost?"
- compilers/opt/pgo-fdo-workflow — "How do you do profile-guided optimization with `-fprofile-generate` and measure the win?"
- compilers/opt/godbolt-reading-asm — "How do you read compiler-explorer output to verify what your abstraction costs?"

### compilers-jit-runtimes — Building and understanding JITs (owner: gpt)
- compilers/jit/toy-jit-mmap-exec — "How do you generate x86-64 code at runtime with `mmap` and call it as a function?"
- compilers/jit/tiered-compilation — "How do interpreter, baseline and optimizing tiers decide when to promote code?"
- compilers/jit/inline-caches-hidden-classes — "How do inline caches and hidden classes make dynamic property access fast?"
- compilers/jit/deoptimization-osr — "What is on-stack replacement, and how does deoptimization bail out of speculation?"
- compilers/jit/wasm-baseline-vs-optimizing — "How do WebAssembly engines compile with a baseline tier plus an optimizing tier?"

## distributed

### distributed-consensus — Agreement protocols (owner: claude)
- distributed/consensus/raft-leader-election — "How does Raft elect a leader with randomized timeouts and terms?"
- distributed/consensus/raft-log-replication-safety — "Why can a Raft leader only commit entries from its own term by counting replicas?"
- distributed/consensus/paxos-single-decree — "How do Paxos prepare and accept phases choose exactly one value?"
- distributed/consensus/multi-paxos-vs-raft — "What does Multi-Paxos leave unspecified that Raft pins down?"
- distributed/consensus/flp-impossibility — "What does the FLP result really say about consensus in asynchronous systems?"

### distributed-time-and-consistency — Ordering events without a global clock (owner: claude)
- distributed/time/lamport-clocks — "How do Lamport clocks order events, and what can't they tell you?"
- distributed/time/vector-clocks — "How do vector clocks detect concurrent writes?"
- distributed/time/hybrid-logical-clocks — "How do hybrid logical clocks combine wall time with causality?"
- distributed/time/truetime-spanner — "How does Spanner use TrueTime uncertainty and commit-wait for external consistency?"
- distributed/consistency/linearizability-vs-serializability — "What is the difference between linearizability and serializability?"

### distributed-replication-and-crdts — Replicating state without coordination (owner: claude)
- distributed/crdt/counters-g-pn — "How do G-Counters and PN-Counters converge with only merge-by-max?"
- distributed/crdt/or-set-tombstones — "How does an OR-Set resolve add and remove of the same element?"
- distributed/crdt/sequence-crdts-rga — "How do text-editing CRDTs like RGA keep character order consistent?"
- distributed/replication/dynamo-quorums — "How do N, R and W quorums trade consistency for availability in Dynamo-style stores?"
- distributed/replication/anti-entropy-merkle-trees — "How do Merkle trees find divergent replicas by exchanging only hashes?"

### system-design-stories — Famous products, rebuilt as a story (owner: claude)
- distributed/feeds/instagram-feed/part-1 — "How does Instagram load your feed so fast? (Part 1: the join that melts)"
- distributed/feeds/instagram-feed/part-2 — "How does Instagram load your feed so fast? (Part 2: fan-out, caches, CDN)"

### distributed-failure-stories — How distributed systems actually break (owner: gpt)
- distributed/failures/partitions-split-brain — "How does a network partition produce split brain, and how do fencing tokens stop it?"
- distributed/failures/retry-storms-backoff-jitter — "How do naive retries turn a blip into an outage, and why is jitter essential?"
- distributed/failures/gray-failures — "What is a gray failure, and why do health checks miss it?"
- distributed/failures/clock-skew-lease-bugs — "How does clock skew break lease-based locks?"
- distributed/failures/cascading-load-shedding — "How do you shed load so one slow dependency doesn't take down everything?"

### distributed-testing-and-observability — Proving and seeing behavior (owner: gpt)
- distributed/testing/jepsen-methodology — "How does Jepsen find consistency bugs with nemeses and history checkers?"
- distributed/testing/chaos-toxiproxy — "How do you inject latency and resets with Toxiproxy before production does?"
- distributed/observability/opentelemetry-tracing — "How do trace context and spans propagate across services with OpenTelemetry?"
- distributed/testing/deterministic-simulation — "How does deterministic simulation testing replay a distributed bug by seed?"
- distributed/observability/tail-latency-p99 — "Why does p99 latency explode with fan-out, and what do hedged requests do?"

### distributed-building-blocks — Patterns you implement yourself (owner: gpt)
- distributed/building/idempotency-keys — "How do you make a payment endpoint safe to retry with idempotency keys?"
- distributed/building/outbox-pattern — "How does the transactional outbox avoid dual-write bugs between a DB and a queue?"
- distributed/building/consistent-hashing-ring — "How do you implement a consistent-hash ring with virtual nodes and measure the balance?"
- distributed/building/etcd-lease-leader-election — "How do you build leader election on an etcd lease in 40 lines?"
- distributed/building/kafka-consumer-groups — "How do Kafka partitions, offsets and consumer-group rebalances work in practice?"

## networking

### networking-protocol-internals — Protocols from the inside (owner: claude)
- networking/tcp/congestion-control-cubic-bbr — "How do Reno, CUBIC and BBR decide how fast to send?"
- networking/tcp/state-machine-time-wait — "Why does TCP have TIME_WAIT, and what does it protect?"
- networking/tls/tls13-handshake — "How does the TLS 1.3 handshake reach encryption in one round trip?"
- networking/routing/bgp-path-selection — "How does BGP pick a path, and how did a leak take down a continent's traffic?"
- networking/dns/recursive-resolution-caching — "What really happens between `getaddrinfo` and an authoritative nameserver?"
- networking/quic/quic-vs-tcp-head-of-line — "How does QUIC remove head-of-line blocking that TCP can't?"

### networking-hands-on-debugging — Debugging the network on Linux (owner: gpt)
- networking/debug/tcpdump-wireshark-filters — "How do you capture only the packets you need with `tcpdump` and BPF filters?"
- networking/debug/ss-socket-states — "How do you use `ss -tnp` to spot SYN backlogs and CLOSE_WAIT leaks?"
- networking/linux/nftables-conntrack — "How do nftables rules and conntrack decide a packet's fate?"
- networking/linux/netns-veth-lab — "How do you build a two-host lab with netns, veth and a bridge in a minute?"
- networking/debug/mtu-pmtud-blackholes — "Why do big packets silently vanish, and how do you prove it's an MTU blackhole?"
- networking/debug/dig-trace-dns-failures — "How do you debug DNS with `dig +trace` and find a broken delegation?"

## databases

### databases-storage-engines — Storage engines and transactions (owner: claude)
- databases/storage/btree-vs-lsm — "When does an LSM-tree beat a B-tree, and what is write amplification?"
- databases/storage/wal-aries-recovery — "How does write-ahead logging with ARIES redo and undo recover after a crash?"
- databases/txn/mvcc-snapshot-isolation — "How does MVCC give readers a snapshot without blocking writers, and what is write skew?"
- databases/txn/two-phase-locking-deadlocks — "How does strict 2PL guarantee serializability, and how are deadlocks detected?"
- databases/query/planner-cost-model — "How does a query planner use statistics to choose between a seq scan and an index?"
- databases/indexing/btree-page-splits — "How does a B+tree split pages, and why do random UUID keys hurt?"

### databases-hands-on-ops — Operating Postgres and SQLite (owner: gpt)
- databases/postgres/explain-analyze-reading — "How do you read `EXPLAIN (ANALYZE, BUFFERS)` and spot the estimate that's wrong?"
- databases/postgres/vacuum-bloat-autovacuum — "Why does a table keep growing after DELETE, and how do you tune autovacuum?"
- databases/postgres/lock-contention-pg-locks — "How do you find who's blocking whom with `pg_locks` and `pg_stat_activity`?"
- databases/sqlite/wal-mode-android-room — "What does SQLite WAL mode change for Android Room apps?"
- databases/ops/replication-lag-debugging — "How do you measure and fix streaming replication lag?"
- databases/ops/covering-partial-indexes — "How do covering and partial indexes turn a 2s query into 2ms?"

## linkers

### linkers-elf-internals — What's inside an ELF and how it loads (owner: claude)
- linkers/elf/sections-vs-segments — "What is the difference between ELF sections and program segments?"
- linkers/elf/relocation-types — "How do R_X86_64 relocations patch code once addresses are known?"
- linkers/elf/got-plt-lazy-binding — "How do the GOT and PLT resolve `printf` lazily at first call?"
- linkers/elf/symbol-resolution-weak-strong — "How does the linker resolve duplicate symbols, weak definitions and COMMON?"
- linkers/elf/tls-models — "How do thread-local variables work across the four ELF TLS models?"
- linkers/loader/execve-elf-loading — "What does the kernel do with an ELF on `execve`, and who runs `ld.so`?"

### linkers-hands-on-debugging — Linking problems in the real world (owner: gpt)
- linkers/debug/readelf-objdump-nm-tour — "How do you answer 'where did this symbol come from' with readelf, objdump and nm?"
- linkers/debug/undefined-reference-archive-order — "Why does link order of static libraries matter for 'undefined reference'?"
- linkers/debug/ld-preload-interposition — "How does `LD_PRELOAD` interpose malloc, and when does it fail?"
- linkers/debug/rpath-runpath-ldd — "How do RPATH, RUNPATH and `LD_LIBRARY_PATH` choose which `.so` you get?"
- linkers/android/bionic-linker-namespaces — "How do you debug 'library not found' failures caused by Android linker namespaces?"
- linkers/build/linker-scripts-map-files — "How do you read a map file and use a linker script to place sections?"

## virtualization

### virtualization-internals — How hypervisors work (owner: claude)
- virtualization/cpu/vmx-vmexit-loop — "How does Intel VT-x run a guest with VMLAUNCH and handle VM exits?"
- virtualization/memory/ept-nested-paging — "How do EPT or NPT make a two-dimensional page walk and what is the cost?"
- virtualization/io/virtio-virtqueues — "How do virtio virtqueues share descriptors between guest and host without traps?"
- virtualization/kvm/kvm-ioctl-lifecycle — "What are the `/dev/kvm` ioctls a VMM calls to create and run a vCPU?"
- virtualization/isolation/iommu-vfio-passthrough — "How do the IOMMU and VFIO let a guest own a PCIe device safely?"
- virtualization/android/pkvm-protected-vms — "How does pKVM protect VM memory even from the Android host kernel?"

### virtualization-hands-on — Running and debugging VMs (owner: gpt)
- virtualization/qemu/qemu-kvm-minimal-boot — "How do you boot a minimal Linux guest with QEMU and KVM from a kernel and initramfs?"
- virtualization/qemu/gdb-stub-guest-debug — "How do you attach gdb to a QEMU guest and break in early boot?"
- virtualization/firecracker/microvm-lab — "How do you launch a Firecracker microVM and why does it boot in ~125ms?"
- virtualization/network/tap-bridge-guest-networking — "How do TAP devices and a bridge give a VM networking?"
- virtualization/android/cuttlefish-launch-cvd — "How do you run AOSP on Cuttlefish with `launch_cvd` and attach adb?"
- virtualization/perf/kvm-stat-vmexits — "How do you use `perf kvm stat` to find which VM exits are slowing a guest?"

## architecture

### architecture-cpu-internals — What the CPU does under the hood (owner: claude)
- architecture/cpu/out-of-order-reorder-buffer — "How does an out-of-order core use the reorder buffer to keep in-order retirement?"
- architecture/cpu/branch-prediction — "How do TAGE-style predictors guess branches with 95%+ accuracy?"
- architecture/memory/cache-coherence-mesi — "How does MESI keep caches coherent, and what traffic does a write cause?"
- architecture/memory/memory-ordering-tso-vs-arm — "Why does code that works on x86 TSO break on ARM's weaker memory model?"
- architecture/cpu/speculation-spectre — "How does speculative execution leak data through the cache in Spectre v1?"
- architecture/isa/arm64-exception-levels — "What are EL0 to EL3 on ARM64, and where do the kernel, hypervisor and TrustZone run?"

### architecture-hands-on-performance — Measuring hardware behavior (owner: gpt)
- architecture/perf/cache-miss-microbenchmark — "How do you write a pointer-chasing microbenchmark that reveals L1, L2 and DRAM latency?"
- architecture/perf/false-sharing-padding — "How does false sharing slow two threads 10x, and how does padding to 64 bytes fix it?"
- architecture/perf/perf-stat-ipc-counters — "What do IPC, cache-misses and branch-misses in `perf stat` tell you?"
- architecture/simd/neon-avx-intrinsics — "How do you hand-vectorize a loop with NEON or AVX2 intrinsics and check the speedup?"
- architecture/isa/reading-arm64-assembly — "How do you read ARM64 assembly from objdump well enough to spot a hot loop's cost?"
- architecture/perf/branch-mispredict-sorted-array — "Why does sorting an array make the same loop several times faster?"

## product-design

### product-design-filters-db-side — Filtering a data-heavy page inside the database (owner: claude)
- product-design/filters/db-side-indexes — "Why does adding one filter dropdown turn a 20 ms page into a full table scan?"
- product-design/filters/composite-index-column-order — "Why does an index on (status, created_at) serve some filters and not others, and how do you pick the column order?"
- product-design/filters/explain-query-plans — "How do you read EXPLAIN ANALYZE to see whether your filter used an index scan, a bitmap scan or a sequential scan?"
- product-design/filters/keyset-vs-offset-with-filters — "Why does page 500 of a filtered list crawl with OFFSET, and how does keyset pagination keep it flat?"

### product-design-filters-architecture-options — Where filtering should live and which option to pick (owner: gpt)
- product-design/filters/client-side-filtering — "When is it fine to ship every row to the browser and filter in JavaScript, and where does it break down?"
- product-design/filters/flat-table-materialized-view — "How does a denormalized flat table or materialized view replace a five-way join behind your filters?"
- product-design/filters/search-engine-facets-counts — "How does a search engine like OpenSearch return filter results and per-option facet counts in one request?"
- product-design/filters/caching-filter-results — "What do you cache for filter queries when the combinations are endless, and how do you invalidate it?"
- product-design/filters/filter-state-in-url — "Why should filter state live in the URL, and how do you keep it shareable without breaking the back button?"
- product-design/filters/which-one-when — "Database, client, flat view or search engine: which one do you pick for your row count, filter count and freshness needs?"

### product-design-search-box — Designing a search box that feels smart (owner: claude)
- product-design/search/autocomplete-prefix-index — "How does autocomplete return suggestions in a few milliseconds while you type?"
- product-design/search/debounce-and-stale-responses — "Why can a slow response for 'ca' overwrite the results for 'cat', and how do you stop it?"
- product-design/search/typo-tolerance — "How does a search box still find 'iphne' using edit distance and n-grams?"
- product-design/search/ranking-basics-bm25 — "Why does a rare word in a short title outrank a common word in a long document?"
- product-design/search/zero-results-and-suggestions — "What should a search box do when nothing matches, and how do you use query logs to fix it?"

### product-design-infinite-feeds — Infinite scroll and pagination done right (owner: gpt)
- product-design/feeds/offset-pagination-drift — "Why do users see duplicate or missing items when new posts arrive between page loads?"
- product-design/feeds/cursor-pagination — "How does a cursor token encode 'where you left off' so the next page is stable and fast?"
- product-design/feeds/infinite-scroll-intersection-observer — "How do you trigger the next page load with IntersectionObserver instead of scroll events?"
- product-design/feeds/list-virtualization — "How does list virtualization keep a ten-thousand-item feed smooth by rendering only what is visible?"
- product-design/feeds/pagination-vs-infinite-scroll — "When do numbered pages beat infinite scroll, for footers, back navigation and finding things again?"

## ml

Adaptive ladder, not a flat list. Each series is one level (L1 basics to L5 advanced), and the level is part of the series name. Per the 2026-11-01 decision, a creator posts the next ml reel at the owner's current level for that creator: start at L1, move up one level when the owner liked at least 2 of the last 3 ml reels at the current level, otherwise stay and re-explain from a new angle (deeper path, same level). Set the reel's `level` field to the ladder level. Owners alternate by level: odd levels claude, even levels gpt. Within a level, post in listed order.

### ml-l1-foundations — What a model is and how it learns (owner: claude)
- ml/foundations/what-is-a-model — "What is a machine learning model, really, if you strip away the hype?"
- ml/foundations/linear-regression — "How does fitting a straight line to data count as machine learning?"
- ml/foundations/loss-functions — "How does a model know it is wrong, and why does the choice of loss change what it learns?"
- ml/foundations/gradient-descent — "How does gradient descent find good weights by walking downhill on a loss surface?"
- ml/foundations/train-test-split — "Why do we hold back test data, and what goes wrong if we peek at it?"
- ml/foundations/overfitting — "Why can a model score 100% on training data and still be useless?"

### ml-l2-classic-models — Classic models and how to judge them (owner: gpt)
- ml/classic/logistic-regression — "How does logistic regression turn a linear score into a probability?"
- ml/classic/decision-trees — "How does a decision tree decide which question to ask first?"
- ml/classic/random-forests-boosting — "Why do many weak trees, by bagging or boosting, beat one carefully grown tree?"
- ml/classic/precision-recall-roc — "Why can a 99% accurate classifier be worthless, and what do precision, recall and ROC show instead?"
- ml/classic/regularization — "How do L1 and L2 penalties stop a model from memorizing noise?"

### ml-l3-neural-nets — Neural networks and how they train (owner: claude)
- ml/neural/neurons-and-layers — "What does a single artificial neuron compute, and what do stacked layers add?"
- ml/neural/backpropagation — "How does backprop use the chain rule to assign blame to every weight?"
- ml/neural/activation-functions — "Why would a deep network without activation functions collapse into one linear layer?"
- ml/neural/optimizers-sgd-adam — "What does Adam do differently from plain SGD, and why is it the default?"
- ml/neural/batch-norm-dropout — "How do batch normalization and dropout make deep networks easier to train and less prone to overfit?"

### ml-l4-deep-architectures — CNNs to transformers (owner: gpt)
- ml/architectures/cnn-convolutions — "How does a convolution reuse the same small filter across an image, and why does that work?"
- ml/architectures/embeddings — "How does an embedding place words or items in a space where distance means similarity?"
- ml/architectures/rnn-limits — "Why do RNNs forget long-range context, and what problem does that create?"
- ml/architectures/attention-mechanism — "How does attention let every token look directly at every other token?"
- ml/architectures/transformer-block — "What is inside a transformer block, and why does it parallelize better than an RNN?"
- ml/architectures/tokenization-bpe — "Why do language models read subword tokens instead of words or characters?"

### ml-l5-training-and-serving — Training at scale and serving in production (owner: claude)
- ml/production/data-parallel-mixed-precision — "How do data parallelism and mixed precision let you train on many GPUs without a huge slowdown?"
- ml/production/fine-tuning-lora — "How does LoRA fine-tune a huge model by training only two small low-rank matrices per layer?"
- ml/production/quantization — "How can you shrink a model to 4-bit weights and keep most of its accuracy?"
- ml/production/inference-batching — "How does continuous batching keep a GPU busy while serving many users at once?"
- ml/production/kv-cache — "Why does a KV cache make token generation faster, and what does it cost in memory?"
- ml/production/rag-vector-databases — "How do RAG and a vector database give a model facts it was never trained on?"
