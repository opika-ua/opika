# Save bar A: copy table (for approval before building)

Source: HANDOFF-savebar-A.md, sketch S1–S7. Existing strings checked in `packages/i18n/src/messages/uk.ts`.

## Reused as is (no change)
| State | String | Key area |
|---|---|---|
| S2 | Є незбережені зміни | saveBar.unsaved |
| S2, S6 | Скасувати | saveBar.cancel |
| S2, S5 | Зберегти | saveBar |
| S3 | Збереження… | saveBar.saving |
| S4 | Збережено о {time} | saveBar.savedAt |
| S4 | Переглянути | saveBar.view |
| conflict | existing conflict message and «Показати поточну версію» | saveBar.conflict, conflictReload |
| S7 | Зберігається… / Чернетку збережено о {time} | existing autosave statuses |

## NEW (4)
| State | String | Note |
|---|---|---|
| S1 | Усі зміни збережено | does not exist yet; status line under the tabs |
| S5 | Перевірте {n} поле / поля / полів | plural via the existing Ukrainian plural helper: 1 поле, 2–4 поля, 5+ полів |
| S5 | Показати | switches tab and focuses the first invalid field |
| S6 | Не вдалося зберегти | status for network or server failure |

## Decision for you (1)
- S6 button: the sketch says «Спробувати ще», but the app already uses «Спробувати ще раз» everywhere (`saveBar.retry`, gallery, sign-in). Recommendation: reuse «Спробувати ще раз» (consistent; the pill button is wide enough) and add no new string. Say if you want the shorter «Спробувати ще».

## Notes
- No «ми», no em dash, no exclamation marks. Apostrophe U+02BC where needed.
- The existing `saveBar.failed` string («Не збереглося – на картках нічого не змінилося. Перевірте зʼєднання і спробуйте ще раз.») stays for the Притулок cards path if it is used elsewhere; the new «Не вдалося зберегти» is the pill's short status. The builder will check for a clash and report.
- Nothing is built until you approve this table.
