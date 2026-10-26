# Review: 8b40dad (fix/voice-hint-false-claim), Tier 2, async

VERDICT: PASS WITH NOTES

VERIFIED | TAKEN ON TRUST
--- | ---
I mutated the conditional myself: rendering the attribution when there's no sentence turns `AnimalDetailScreen.test.tsx:196` red with `expected <span …(1)></span> to be null` (1 failed / 5 passed). That matches the commit's second mutation line. I reverted it and the tree is clean. | The full `pnpm check` (exit 0, workspace 2571, harness 226). It's pasted in the commit body.
Placement is right against the design. README says "A shelter with none on file falls back to the marker plus day count alone", which means no attribution. | Mutation 1 (old attribution text restored). It's recorded, and it's plausible given the literal-text assertion at :190. I didn't re-run it.
The new tests assert literals («Слова притулку», the quoted sentence, the caption sentence), not `uk.*` constants. The null case uses `queryByTestId(...)).toBeNull()` with no conditional. | The harness change, `toHaveText("Слова притулку")`. Playwright's string `toHaveText` is a full match, so it would catch the suffix coming back. I didn't run the harness.
Other surfaces: `uk.freshness.attribution` renders only in AnimalDetailScreen. SwipeCard shows the sentence and no attribution, both before and after this commit. Gallery cards show no sentence. | The VH-Q1/VH-Q2 quotes. They're taken from the inbox file as instructed.
«дата автоматична» remains only in historical comments marked "(as it then read)", in the intake reports (history), in the uk.ts deletion note, and in the three `.dc.html` mocks (finding 1). |
Docs against his answer: `{імʼя}` only, base form, preview with a real name, hint copy his at K2, no `{дата}` because the day count covers it, the case problem, and the runbook warning kept. KABINET rule 9, the Voice section, the N11 row, README, shelter.ts and the runbook all say that and no more, apart from finding 2. The README example's Ukrainian all comes from the old example or his quote. |
Touched suites are green (see TESTS). |

FINDINGS (most severe first)
1. [medium] docs/design/Opika Kabinet.dc.html, Registry Frames, and Registry System still specify the old design.
   - Kabinet's voice frame shows "Поле 120 з токенами {дата} і {імʼя}", a sample sentence «Ми оновлювали цю картку {дата}…», the caption «{дата} і {імʼя} підставляємо ми», and «Слова притулку · дата автоматична». Frames and System carry the old attribution too.
   - KABINET.md:9-13 sends the K2 builder to that mock as "final", and the standing rule is to open the mock.
   - Failure scenario: K2 builds from the frame and brings back `{дата}` and the deleted suffix.
   - Fix: add one line to README's amendment note and KABINET.md's N11/Voice saying the mock frames predate VH-Q1/Q2 and the prose wins on this point. Whether to edit the mocks is Oleksii's call; don't hand-edit them silently.
2. [low] docs/design/README.md:292. "and appears only under a quote" is cited to "inbox VH-Q1 and VH-Q2", but neither answer says it.
   - It's the builder's sound derivation from the existing fallback sentence.
   - Keep the rule and change the citation, e.g. "(follows from the fallback below)", so a derivation doesn't read as his decision.
3. [low] docs/design/README.md:285. The trimmed quote changes case: the original reads «— напишіть, і ми…» and the trim has «…Напишіть, …».
   - A trimmed quote should keep the letter case: «…напишіть, і ми скажемо, чи Ластівка ще з нами.»

SIMPLIFICATIONS
- None.

TESTS
- @opika/web AnimalDetailScreen.test.tsx + ShelterProfile.test.tsx: Test Files 2 passed, Tests 24 passed (24)
- @opika/i18n: Test Files 4 passed, Tests 57 passed (57)
- Mutation (attribution rendered without a sentence): Tests 1 failed | 5 passed (6), then reverted
