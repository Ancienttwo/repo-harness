# repo-harness 0.31.0 publication record

## Scope and authority

- Base: `fabf4e41f` on `main` (#2613, the projection refresh on top of
  `cc00ad1b0`). Previous release: `v0.30.0`. Range: `v0.30.0..fabf4e41f`
  (149 first-parent commits). A PR merged after the base goes to the next
  release.
- Release date and record prefix: UTC 2026-11-12.
- The core package, Operator web package, skill and template stamps, and README
  move to 0.31.0. The range moves `archctx` and `archctx-contracts` from 0.12.0
  to 0.13.0 (#2354), removes the dev dependency `@types/cors` (#2482) and moves
  the herdr-core floor to 0.1.20 (#2255).
- Parent #2485. Decisions: JD-79
  ([6813559514](https://github.com/aimpact-inc/repo-harness/issues/2485#issuecomment-6813559514),
  amendment [6813854383](https://github.com/aimpact-inc/repo-harness/issues/2485#issuecomment-6813854383))
  and JD-82 ([6814791444](https://github.com/aimpact-inc/repo-harness/issues/2485#issuecomment-6814791444)).
- Daily evidence: run 43157782830 on `cc00ad1b0`, green. The base differs from
  `cc00ad1b0` only in `docs/architecture/.projection-manifest.json`.
- Publish status: not published. The life cycle stops at the merged release
  PR. `npm publish`, the tag and the GitHub Release stay with the owner and
  `.github/workflows/release.yml`.

## Cause of the release

The release holds the 0.31.0 section of `docs/CHANGELOG.md`: board protocols
8 to 10, the `mcp.local.json` version 3 refusal, the `gatekeeper-fallback`
seat, one merge lane (#2462) and the Windows locking fixes. Each row names one
first-parent commit of the range, oldest first.

| PR | Commit | Merged PR title |
|---|---|---|
| [#2235](https://github.com/aimpact-inc/repo-harness/pull/2235) | `c26658094` | docs(reference): name only files and lines that exist |
| [#2227](https://github.com/aimpact-inc/repo-harness/pull/2227) | `52aa00b6f` | refactor(effects): share one process liveness probe (#2220) |
| [#2228](https://github.com/aimpact-inc/repo-harness/pull/2228) | `435dbcf7f` | fix(seats): default the advisor to fable at high effort (#2225) |
| [#2230](https://github.com/aimpact-inc/repo-harness/pull/2230) | `49830f36d` | feat(operator-web): History draws placed routes on the shared shell (#2162) |
| [#2240](https://github.com/aimpact-inc/repo-harness/pull/2240) | `adfd013c8` | refactor(fleet): task message v1 and v2 use the message mechanics |
| [#2246](https://github.com/aimpact-inc/repo-harness/pull/2246) | `723eddabb` | fix(release): wait until npm shows the core package before the read-back (#2238) |
| [#2229](https://github.com/aimpact-inc/repo-harness/pull/2229) | `b9c16d282` | feat(board): a recorded coordinator disposition resolves named findings of one FAIL acceptance record (#2202) |
| [#2244](https://github.com/aimpact-inc/repo-harness/pull/2244) | `0d80db986` | fix(review): map the fable model to the anthropic family |
| [#2245](https://github.com/aimpact-inc/repo-harness/pull/2245) | `85625ebd5` | docs(release): copy the 0.30.0 sources into the CHANGELOG and the checklist |
| [#2262](https://github.com/aimpact-inc/repo-harness/pull/2262) | `efc6d966e` | chore(integration): merge accepted PRs #2247 #2258 #2256 #2241 #2252 as one batch (#2207) |
| [#2233](https://github.com/aimpact-inc/repo-harness/pull/2233) | `bde1dc2cd` | chore(projection): refresh generated architecture outputs for main@efc6d966e4b8 |
| [#2265](https://github.com/aimpact-inc/repo-harness/pull/2265) | `ed33f22eb` | chore(integration): merge accepted PRs #2259 as one batch (#2207) |
| [#2261](https://github.com/aimpact-inc/repo-harness/pull/2261) | `0d6f6f81e` | chore(herdr): pin herdr-core 0.1.20 (#2255) |
| [#2263](https://github.com/aimpact-inc/repo-harness/pull/2263) | `881aca1c6` | feat(board): keep readiness answers in a keyed source store (#2164) |
| [#2272](https://github.com/aimpact-inc/repo-harness/pull/2272) | `f98a5def8` | chore(integration): merge accepted PRs #2269 as one batch (#2207) |
| [#2275](https://github.com/aimpact-inc/repo-harness/pull/2275) | `1700b0beb` | chore(integration): merge accepted PRs #2268 as one batch (#2207) |
| [#2276](https://github.com/aimpact-inc/repo-harness/pull/2276) | `49d6a0853` | chore(integration): merge accepted PRs #2270 as one batch (#2207) |
| [#2277](https://github.com/aimpact-inc/repo-harness/pull/2277) | `b5051639f` | chore(integration): merge accepted PRs #2257 as one batch (#2207) |
| [#2266](https://github.com/aimpact-inc/repo-harness/pull/2266) | `8da159e83` | chore(projection): refresh generated architecture outputs for main@b5051639ffba |
| [#2282](https://github.com/aimpact-inc/repo-harness/pull/2282) | `7d4205615` | chore(integration): merge accepted PRs #2281 as one batch (#2207) |
| [#2286](https://github.com/aimpact-inc/repo-harness/pull/2286) | `36e206d54` | chore(integration): merge accepted PRs #2284 #2283 as one batch (#2207) |
| [#2287](https://github.com/aimpact-inc/repo-harness/pull/2287) | `4bc6ab1be` | chore(integration): merge accepted PRs #2278 as one batch (#2145) |
| [#2289](https://github.com/aimpact-inc/repo-harness/pull/2289) | `cbb7c2e53` | test(cleanup): remove the 25 unused call-result locals under tests (#2288) |
| [#2292](https://github.com/aimpact-inc/repo-harness/pull/2292) | `1a9a21c28` | chore(integration): merge accepted PRs #2290 as one batch (#2207) |
| [#2294](https://github.com/aimpact-inc/repo-harness/pull/2294) | `ef288c72a` | refactor(core): five renamed isRecord guards use the one guard (#2293) |
| [#2298](https://github.com/aimpact-inc/repo-harness/pull/2298) | `ef967a916` | chore(integration): merge accepted PRs #2291 as one batch (#2145) |
| [#2299](https://github.com/aimpact-inc/repo-harness/pull/2299) | `451c353e5` | chore(integration): merge accepted PRs #2297 as one batch (#2207) |
| [#2302](https://github.com/aimpact-inc/repo-harness/pull/2302) | `a5d4e247d` | chore(integration): merge accepted PRs #2296 as one batch (#2145) |
| [#2303](https://github.com/aimpact-inc/repo-harness/pull/2303) | `132991604` | feat(operator-web): one failure rule for the observation reads in the refresh hook (#2216) |
| [#2308](https://github.com/aimpact-inc/repo-harness/pull/2308) | `0e48e9afc` | refactor(core): one byteCompare for the byte-order sorts |
| [#2311](https://github.com/aimpact-inc/repo-harness/pull/2311) | `ab86e521b` | chore(integration): merge accepted PRs #2307 as one batch (#2145) |
| [#2312](https://github.com/aimpact-inc/repo-harness/pull/2312) | `9ca058f64` | chore(integration): merge accepted PRs #2310 as one batch (#2207) |
| [#2314](https://github.com/aimpact-inc/repo-harness/pull/2314) | `2f7edb6c8` | refactor(evidence): sha256Prefixed is the one writer of the sha256: digest form |
| [#2323](https://github.com/aimpact-inc/repo-harness/pull/2323) | `a26cdc863` | fix(seats reset): wait out the budget after a message to the caller (#2305) |
| [#2327](https://github.com/aimpact-inc/repo-harness/pull/2327) | `35e9efbe7` | chore(integration): merge accepted PRs #2325 as one batch (#2207) |
| [#2329](https://github.com/aimpact-inc/repo-harness/pull/2329) | `6f9715d49` | chore(integration): merge accepted PRs #2328 as one batch (#2207) |
| [#2285](https://github.com/aimpact-inc/repo-harness/pull/2285) | `baff8ea64` | chore(projection): refresh generated architecture outputs for main@6f9715d49532 |
| [#2336](https://github.com/aimpact-inc/repo-harness/pull/2336) | `467e842a3` | chore(integration): merge accepted PRs #2334 as one batch (#2000) |
| [#2339](https://github.com/aimpact-inc/repo-harness/pull/2339) | `4678b3cd0` | chore(integration): merge accepted PRs #2335 as one batch (#2145) |
| [#2342](https://github.com/aimpact-inc/repo-harness/pull/2342) | `3c1d6a764` | chore(integration): merge accepted PRs #2332 as one batch (#2207) |
| [#2346](https://github.com/aimpact-inc/repo-harness/pull/2346) | `39dc39bfc` | refactor(core): one set of decode readers for the snapshot decoders |
| [#2338](https://github.com/aimpact-inc/repo-harness/pull/2338) | `dcabb587e` | chore(projection): refresh generated architecture outputs for main@39dc39bfc3ec |
| [#2352](https://github.com/aimpact-inc/repo-harness/pull/2352) | `3f46dd320` | chore(integration): merge accepted PRs #2333 as one batch (#2322) |
| [#2355](https://github.com/aimpact-inc/repo-harness/pull/2355) | `5fe0a6760` | chore(integration): merge accepted PRs #2350 as one batch (#2207) |
| [#2359](https://github.com/aimpact-inc/repo-harness/pull/2359) | `fcaf59cdd` | chore(integration): merge accepted PRs #2356 as one batch (#2207) |
| [#2360](https://github.com/aimpact-inc/repo-harness/pull/2360) | `800ba1129` | chore(integration): merge accepted PRs #2340 as one batch (#2322) |
| [#2362](https://github.com/aimpact-inc/repo-harness/pull/2362) | `937c722f1` | chore(integration): merge accepted PRs #2354 #2358 as one batch (#2172) |
| [#2365](https://github.com/aimpact-inc/repo-harness/pull/2365) | `90353e3cb` | chore(policy): publication.merge_queue on (#2364) |
| [#2361](https://github.com/aimpact-inc/repo-harness/pull/2361) | `a8e299f6e` | refactor(evidence): remove the local wrappers that only rename sha256Prefixed or sha256Hex |
| [#2368](https://github.com/aimpact-inc/repo-harness/pull/2368) | `cd038948b` | fix(adoption): read include sections of the global Git config for the excludes file |
| [#2367](https://github.com/aimpact-inc/repo-harness/pull/2367) | `95551e660` | feat(adoption): init writes only read policy keys, worktree location is a constant, no copied templates (#2317 #2318 #2319) |
| [#2357](https://github.com/aimpact-inc/repo-harness/pull/2357) | `0ae53fe04` | chore(projection): refresh generated architecture outputs for main@cd038948b4ce |
| [#2378](https://github.com/aimpact-inc/repo-harness/pull/2378) | `0ffed00f6` | fix(publication): gate the merge on the live tip policy and the merge result (#2366) |
| [#2380](https://github.com/aimpact-inc/repo-harness/pull/2380) | `12ccdfff2` | fix(seats): --spend-credits admits a ChatGPT account that has credits for any rate_limit_reached_type |
| [#2381](https://github.com/aimpact-inc/repo-harness/pull/2381) | `da6a87c0b` | chore(projection): refresh generated architecture outputs for main@12ccdfff2a36 |
| [#2373](https://github.com/aimpact-inc/repo-harness/pull/2373) | `d52da27ad` | feat(architecture): declare the first six state machines of the operator console (#2177) |
| [#2388](https://github.com/aimpact-inc/repo-harness/pull/2388) | `c54df06af` | docs(herdr-notify): CI is the one test place for a writer (#2376) |
| [#2389](https://github.com/aimpact-inc/repo-harness/pull/2389) | `cc62f2859` | test(upgrade): print the installer output when the v0.10 owner-marker check fails |
| [#2390](https://github.com/aimpact-inc/repo-harness/pull/2390) | `893de8f76` | docs(issue-flow): state the goal of the flow beside the joint-decision rule |
| [#2386](https://github.com/aimpact-inc/repo-harness/pull/2386) | `ec8a9f73d` | refactor(workflow): use one schema in the remaining policy readers (#2330) |
| [#2391](https://github.com/aimpact-inc/repo-harness/pull/2391) | `eaa117a94` | chore(gitignore): re-include .archcontext/model/state-machines/ (#2382) |
| [#2392](https://github.com/aimpact-inc/repo-harness/pull/2392) | `9061e5cf7` | fix(board): keep the attention watcher running when a gh call ends with no exit code (#2349) |
| [#2372](https://github.com/aimpact-inc/repo-harness/pull/2372) | `684a71bc5` | ci(selection): a documentation-only diff runs only selection and Required / CI (#2363) |
| [#2393](https://github.com/aimpact-inc/repo-harness/pull/2393) | `b408a8efd` | chore(projection): refresh generated architecture outputs for main@684a71bc5aec |
| [#2394](https://github.com/aimpact-inc/repo-harness/pull/2394) | `11dec6d27` | fix(hook): name update in the unignored state notice (#2344) |
| [#2402](https://github.com/aimpact-inc/repo-harness/pull/2402) | `746f2df35` | docs(hook-operations): the not-ignored state advice names repo-harness update |
| [#2404](https://github.com/aimpact-inc/repo-harness/pull/2404) | `aec52123b` | refactor(contract-assets): delete the unused resolve-template runtime action |
| [#2405](https://github.com/aimpact-inc/repo-harness/pull/2405) | `831824d6e` | refactor(workflow-state): drop guards, enforcement and merge_gate from the policy schema (#2397) |
| [#2403](https://github.com/aimpact-inc/repo-harness/pull/2403) | `a25753459` | fix(global-runtime): refuse a symlinked excludes file in the runtime ignore step (#2399) |
| [#2414](https://github.com/aimpact-inc/repo-harness/pull/2414) | `43449b451` | fix(fleet): the v1 task-message reader throws the shared TaskMessageError (#2406) |
| [#2418](https://github.com/aimpact-inc/repo-harness/pull/2418) | `968b87704` | board: one gh wrapper for `review.ts` and `dispatch.ts` |
| [#2401](https://github.com/aimpact-inc/repo-harness/pull/2401) | `e17b081e4` | fix(operator-web): keep the Office room when the board read fails (#2371) |
| [#2421](https://github.com/aimpact-inc/repo-harness/pull/2421) | `605b06422` | refactor(review): one definition of `freeze` and `Frozen<T>` (#2409) |
| [#2416](https://github.com/aimpact-inc/repo-harness/pull/2416) | `b151277b2` | refactor(effects): the durable write primitives have one home in atomic-append (#2407) |
| [#2419](https://github.com/aimpact-inc/repo-harness/pull/2419) | `5d686dfe0` | refactor(cli): one git toplevel probe for five commands |
| [#2417](https://github.com/aimpact-inc/repo-harness/pull/2417) | `0fb8979b8` | refactor(shell): share the POSIX single-quote function (#2412) |
| [#2422](https://github.com/aimpact-inc/repo-harness/pull/2422) | `97e93a6ac` | refactor(workflow-state): readers take policy values only through a schema-typed accessor (#2398) |
| [#2429](https://github.com/aimpact-inc/repo-harness/pull/2429) | `ce22a3db7` | refactor(git): remove the dead export `ensureManagedWorktreeRoot` (#2410) |
| [#2428](https://github.com/aimpact-inc/repo-harness/pull/2428) | `2bb827826` | refactor(operator-web): one read prelude for the typed fetchers (#2424) |
| [#2434](https://github.com/aimpact-inc/repo-harness/pull/2434) | `82496ce9e` | refactor(operator-web): one snapshot-view hook for setup, worktrees and dev activity (#2425) |
| [#2432](https://github.com/aimpact-inc/repo-harness/pull/2432) | `61b94f6f9` | refactor(effects): one publish-by-rename function for five stores (#2430) |
| [#2438](https://github.com/aimpact-inc/repo-harness/pull/2438) | `ea0af209f` | docs(contract-assets): point the capability_source anchors at policy.json:12 |
| [#2437](https://github.com/aimpact-inc/repo-harness/pull/2437) | `57887b96b` | refactor(operator-web): one compactLines and one test tone rule (#2426) |
| [#2415](https://github.com/aimpact-inc/repo-harness/pull/2415) | `c9d975415` | chore(projection): refresh generated architecture outputs for main@ea0af209f2e3 |
| [#2445](https://github.com/aimpact-inc/repo-harness/pull/2445) | `22bbc4507` | docs(publication): name both merge lanes by publication.merge_queue (#2377) |
| [#2447](https://github.com/aimpact-inc/repo-harness/pull/2447) | `c32ceed74` | feat(board): carry publication.merge_queue; A2 and the Office merge command read it (#2439) |
| [#2435](https://github.com/aimpact-inc/repo-harness/pull/2435) | `ad7e02ada` | refactor(evidence): the sha256: digest pattern has one definition |
| [#2449](https://github.com/aimpact-inc/repo-harness/pull/2449) | `6f753043e` | refactor(review): the review launcher uses the shared shell quote (#2420) |
| [#2446](https://github.com/aimpact-inc/repo-harness/pull/2446) | `3f84012a7` | fix(publication): name the failed provider field on provider_data_incomplete (#2383) |
| [#2448](https://github.com/aimpact-inc/repo-harness/pull/2448) | `e4eaac9bb` | chore(projection): refresh generated architecture outputs for main@6f753043e3f9 |
| [#2436](https://github.com/aimpact-inc/repo-harness/pull/2436) | `3e9a12ff1` | refactor(cli): one definition each for isWindowsAbsoluteLike and canonicalDirectory |
| [#2461](https://github.com/aimpact-inc/repo-harness/pull/2461) | `1db98a48a` | refactor(scripts): drop two exports with no reader |
| [#2464](https://github.com/aimpact-inc/repo-harness/pull/2464) | `a6953245b` | fix(board): the acceptance record parser reads the table rows only (#2442) |
| [#2466](https://github.com/aimpact-inc/repo-harness/pull/2466) | `cf791e0ac` | refactor(cli): one path-containment function (#2433) |
| [#2458](https://github.com/aimpact-inc/repo-harness/pull/2458) | `c70760f82` | refactor(evidence): one stable JSON serializer with UTF-8 byte key order (#2440) |
| [#2468](https://github.com/aimpact-inc/repo-harness/pull/2468) | `8ec329538` | refactor(tests): withTempHome and tmpWorkspace have one definition each (#2451) |
| [#2463](https://github.com/aimpact-inc/repo-harness/pull/2463) | `f362df926` | refactor(evidence): one definition of the record validator primitives (#2450) |
| [#2469](https://github.com/aimpact-inc/repo-harness/pull/2469) | `9e14dc075` | refactor(core,effects): remove four exported types with no reader |
| [#2467](https://github.com/aimpact-inc/repo-harness/pull/2467) | `64188a51e` | refactor(mcp): one result builder for the four tool modules (#2441) |
| [#2475](https://github.com/aimpact-inc/repo-harness/pull/2475) | `6c7a9876e` | fix(cli): remove the capability-context sync --dry-run flag that no code reads |
| [#2476](https://github.com/aimpact-inc/repo-harness/pull/2476) | `480e216cc` | docs: shipped text names a symbol, not a line number (#2473) |
| [#2477](https://github.com/aimpact-inc/repo-harness/pull/2477) | `5c8727223` | refactor(operator-web): remove 120 translation keys that no code reads (#2471) |
| [#2465](https://github.com/aimpact-inc/repo-harness/pull/2465) | `ed67c028b` | refactor(evidence,admission,locking): remove three test-only exports (#2453) |
| [#2483](https://github.com/aimpact-inc/repo-harness/pull/2483) | `14cda6ce2` | refactor(capabilities): config script and CLI use the core path normalizer (#2480) |
| [#2484](https://github.com/aimpact-inc/repo-harness/pull/2484) | `ef4a52acf` | fix(locking): read the Windows process start time without cmdlet discovery (#2479) |
| [#2482](https://github.com/aimpact-inc/repo-harness/pull/2482) | `e1678dbcc` | chore(package): remove the unused dev dependency @types/cors (#2481) |
| [#2474](https://github.com/aimpact-inc/repo-harness/pull/2474) | `e69bd1c2f` | refactor(operator): remove the launch stack of the closed docs host (#2454) |
| [#2478](https://github.com/aimpact-inc/repo-harness/pull/2478) | `03c2d11da` | feat(publication): one merge lane, the direct squash; one CI run for each PR head (#2462) |
| [#2460](https://github.com/aimpact-inc/repo-harness/pull/2460) | `fd73b1723` | feat(mcp): the local config has one version and one reader key (#2443) |
| [#2470](https://github.com/aimpact-inc/repo-harness/pull/2470) | `1cf26b192` | chore(projection): refresh generated architecture outputs for main@fd73b172354b |
| [#2181](https://github.com/aimpact-inc/repo-harness/pull/2181) | `d07212153` | docs(researches): Office sync cost, architecture view defects and the state machine trial (#2145, #2172) |
| [#2549](https://github.com/aimpact-inc/repo-harness/pull/2549) | `a3be09649` | refactor(operator-web): remove 9 unread group.* translation keys (#2497) |
| [#2548](https://github.com/aimpact-inc/repo-harness/pull/2548) | `895613aa8` | docs(issue-flow): a stale-base CI failure is the one exception to no merge of main (#2498) |
| [#2529](https://github.com/aimpact-inc/repo-harness/pull/2529) | `53d30e54c` | test(upgrade): drain stdin for the v0.10 installer's grep so facade selection cannot lose a SIGPIPE race (#2374) |
| [#2553](https://github.com/aimpact-inc/repo-harness/pull/2553) | `f9d6cf1a1` | feat(board): each attention finding names its priority, and [rh-attention] is a notice (#2488) |
| [#2494](https://github.com/aimpact-inc/repo-harness/pull/2494) | `4f15b3bb6` | refactor(operator)!: remove the doc-session routes and the operator doc-sessions command (#2456) |
| [#2250](https://github.com/aimpact-inc/repo-harness/pull/2250) | `6c08ff752` | fix(operator-web): the repository switch lists every repository and keeps the pick on single-repository pages |
| [#2554](https://github.com/aimpact-inc/repo-harness/pull/2554) | `2c203047d` | feat(board): the attention watcher sends a finding once to each seat terminal until its subject changes (#2493) |
| [#2496](https://github.com/aimpact-inc/repo-harness/pull/2496) | `9785f6539` | feat(seats): an optional gatekeeper-fallback seat takes the review while the gatekeeper account is exhausted (#2253) |
| [#2547](https://github.com/aimpact-inc/repo-harness/pull/2547) | `8f7e37852` | fix(board): read the pull requests of a parent in groups of 20 and name the gh stdout limit (#2486) |
| [#2556](https://github.com/aimpact-inc/repo-harness/pull/2556) | `f40c2f62c` | refactor(operator): remove the doc-session modules; the worktree cleanup owns its four helpers (#2457) |
| [#2558](https://github.com/aimpact-inc/repo-harness/pull/2558) | `c074f93f7` | fix(board): select a seat terminal by its issue or pr label of the board (#2492) |
| [#2557](https://github.com/aimpact-inc/repo-harness/pull/2557) | `1484bbc98` | feat(seats): a Pi seat launch refuses a shell that runs a backtick span in a heredoc body (#2370) |
| [#2555](https://github.com/aimpact-inc/repo-harness/pull/2555) | `93112b503` | feat(operator-web): a context with no history record takes its repository from the URL (#2550) |
| [#2561](https://github.com/aimpact-inc/repo-harness/pull/2561) | `daf76e00d` | fix(publication): an optional readiness read keeps a gh stdout-limit error (#2551) |
| [#2562](https://github.com/aimpact-inc/repo-harness/pull/2562) | `af62d23d8` | refactor(operator): delete task-diff.ts, which has no reader (#2559) |
| [#2563](https://github.com/aimpact-inc/repo-harness/pull/2563) | `21249e1a0` | fix(publication): a pending GitHub mergeability is its own blocker, not provider_data_incomplete (#2383) |
| [#2560](https://github.com/aimpact-inc/repo-harness/pull/2560) | `64849e698` | feat(board): rules A12 to A18 read the stalled, red, failed, unanswered and blocked states; the queue rebuild is two commands (#2489) |
| [#2564](https://github.com/aimpact-inc/repo-harness/pull/2564) | `53338fe6f` | feat(board): rules R6 and R7 give the advisor the short ready queue and the held entry before accepted work |
| [#2552](https://github.com/aimpact-inc/repo-harness/pull/2552) | `b82f718ef` | chore(projection): refresh generated architecture outputs for main@53338fe6ff16 |
| [#2570](https://github.com/aimpact-inc/repo-harness/pull/2570) | `8c043cdf8` | feat(board): the attention watcher starts under the orchestrator seat terminal so hc reports its exit (#2567) |
| [#2571](https://github.com/aimpact-inc/repo-harness/pull/2571) | `b478ba889` | docs(architecture): the two stale human citations name the symbol that holds the behavior (#2565) |
| [#2573](https://github.com/aimpact-inc/repo-harness/pull/2573) | `0632f7038` | docs(issue-flow): a protocol comment starts at its header line, with no code fence (#2566) |
| [#2569](https://github.com/aimpact-inc/repo-harness/pull/2569) | `e50862914` | feat(board): the required check comes from the base protection contexts, not the name Required / CI (#2264) |
| [#2579](https://github.com/aimpact-inc/repo-harness/pull/2579) | `5b410e2ba` | docs(architecture): the operator model and the mcp-sidecar note drop removed doc-session behavior |
| [#2580](https://github.com/aimpact-inc/repo-harness/pull/2580) | `e389d639c` | feat(board): attention rule A19 names a done review seat whose PR has no record of its harness after it (#2568) |
| [#2583](https://github.com/aimpact-inc/repo-harness/pull/2583) | `8bf82c88b` | fix(board): the plan refusal names why the plan block does not decode (#2575) |
| [#2584](https://github.com/aimpact-inc/repo-harness/pull/2584) | `ff973a34b` | refactor(sessions): delete admitted-source.ts and session-selector.ts, which lost their readers (#2581) |
| [#2585](https://github.com/aimpact-inc/repo-harness/pull/2585) | `d67a7301a` | feat(board): attention rule A20 names a required check that stays pending or missing (#2576) |
| [#2587](https://github.com/aimpact-inc/repo-harness/pull/2587) | `4f83b455c` | fix(board): the watcher review line joins with a separator that is not `; `, and an empty sent slot goes (#2577) |
| [#2582](https://github.com/aimpact-inc/repo-harness/pull/2582) | `75c754949` | fix(locking): Windows process start time without a powershell.exe child (#2578) |
| [#2572](https://github.com/aimpact-inc/repo-harness/pull/2572) | `49429c7bb` | chore(projection): refresh generated architecture outputs for main@75c7549496fc |
| [#2595](https://github.com/aimpact-inc/repo-harness/pull/2595) | `a75a298e5` | feat(update): a refused mcp.local.json fails the update with the loader's refusal text (#2593) |
| [#2602](https://github.com/aimpact-inc/repo-harness/pull/2602) | `722339e58` | fix(locking): the Windows owner read treats EPERM on a released lock directory as no observed owner (#2588) |
| [#2606](https://github.com/aimpact-inc/repo-harness/pull/2606) | `580bfeb37` | ci(daily): the native path matrix runs the Windows process start-time and owner-read cases (#2586) |
| [#2603](https://github.com/aimpact-inc/repo-harness/pull/2603) | `713d7b232` | chore(projection): refresh generated architecture outputs for main@580bfeb37ab3 |
| [#2597](https://github.com/aimpact-inc/repo-harness/pull/2597) | `c1569050f` | test(security): the linear-time secret rule test compares times at two sizes, not a wall-clock bound (#2591) |
| [#2594](https://github.com/aimpact-inc/repo-harness/pull/2594) | `cc00ad1b0` | ci(architecture): the daily check tells projection lag from a stale writer (#2590) |
| [#2613](https://github.com/aimpact-inc/repo-harness/pull/2613) | `fabf4e41f` | chore(projection): refresh generated architecture outputs for main@cc00ad1b0e74 |

## Order of the owner steps

This repository's `.ai/harness/policy.json` still holds
`publication.merge_queue`. 0.31.0 refuses that policy with
`publication_policy_invalid`. The order (advisor correction, 2026-11-12T05:09Z):

1. The release PR merges with the 0.30.0 host CLI. The merge queue is still on.
2. The owner approves the `release.yml` run in the `release` environment
   (npm 0.31.0).
3. The owner's #2462 cutover sitting, in this order: delete ruleset 27014440
   ("main merge queue"), then set branch protection `strict` to false, then
   squash PR B of #2462 by hand. PR B removes `publication.merge_queue` from
   `.ai/harness/policy.json` and the `merge_group` trigger from
   `.github/workflows/ci.yml`. No seat merges between the first and the last
   of these three actions. The ruleset goes first: a queue entry of PR B runs
   on a merge-group commit with no `merge_group` trigger, so `Required / CI`
   never reports and the entry hangs (inferred from the trigger, not tested).
4. The host update to 0.31.0 and `repo-harness update`. It can come before or
   after step 3, but a 0.31.0 host refuses the `merge_queue` key until PR B
   lands.

Before step 3, the 0.30.0 host and the queue still merge PRs.

## Publication steps

The owner starts one workflow run after the release PR merges with green CI.
The run publishes both packages, tags the release commit and creates the
GitHub Release; no seat publishes, tags or releases.

1. Before the run, read the environment without changing it:

   ```bash
   gh api repos/aimpact-inc/repo-harness/environments/release -q '{can_admins_bypass, reviewers: [.protection_rules[] | select(.type == "required_reviewers") | .reviewers[].reviewer.login], rules: [.protection_rules[].type]}'
   gh api repos/aimpact-inc/repo-harness/environments/release/deployment-branch-policies -q '[.branch_policies[].name]'
   ```

   Expected: `can_admins_bypass: false`, rules `required_reviewers` and
   `branch_policy`, the reviewer list holds the owner, and the branch policy
   names only `main`. Stop if the setup differs.
2. After the merge, the orchestrator runs
   `gh workflow run release.yml -f sha=<merged release commit>`. The owner
   approves that run in the `release` environment. The approval authorizes
   that deployment.
3. Read each job of the run: `validate`, `lane`, `publish`, `published`
   (`check published 0.31.0`), `tag` and `tagged` (`check tagged 0.31.0`). A
   failed job blocks its dependent jobs.
4. Record the results in the Publication table below.

`bash scripts/release-owner-steps.sh plan 0.31.0` is a pre-publication
preflight. A partial publish follows the "Partial publish recovery" section of
`docs/reference-configs/release-deploy.md`.

## Upgrade steps for users

The Upgrade and Rollback subsections of the 0.31.0 CHANGELOG section are the
operator steps. In short: hc 0.1.20 and `mcp.local.json` version 3 before the
install; `repo-harness update` once before the first seat launch; the plan
comments again as protocol 2, the watchers from the new CLI and
`repo-harness init` where a policy holds `publication.merge_queue` after the
install.

```bash
bun add -g repo-harness@0.31.0 --no-cache && repo-harness update --version 0.31.0
```

## Acceptance environment

The release PR records the prep head, the projection check, `bun run
check:release` and the upgrade rehearsal from the 0.30.0 CLI in a scratch HOME.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.31.0` | pending | pending | pending |
| 2 | `repo-harness@0.31.0` | pending | pending | pending |

Open owner items:

- Release environment approval of the `release.yml` run: pending.
- Tag `v0.31.0`: pending.
- GitHub Release `v0.31.0`: pending.
- #2462 cutover sitting (ruleset 27014440 deleted, `strict` false, PR B
  squashed): pending.
- Host update to 0.31.0 and `repo-harness update` on the owner machine:
  pending.

## Post-publish checks

- `bash scripts/check-release-published.sh 0.31.0` reads both packages from the
  registry, compares each tarball with its registry metadata, runs the runtime
  receipt and checks `v0.31.0`. Result: pending.
- On the owner machine, run the upgrade command and record the installed
  version. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. After publication,
retain the published tag and use a new patch release for a correction. A host
return to 0.30.0 needs the hand removal of `seats["gatekeeper-fallback"]` from
`~/.repo-harness/config.json` first (CHANGELOG Rollback).
