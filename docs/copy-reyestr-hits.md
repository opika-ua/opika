# «реєстр» in user-facing copy: the hits (2026-10-17)

Oleksii's brand rule (CB-B1): no «реєстр» in user-facing copy, as it implies a state service. His
default wording rule while he writes the exact text (CB-B2): «сайт» / «через сайт» / «на сайті»
for the website; «я» for the person checking shelters (operator voice: no «ми», no gendered past
tense); «перевірка» for the verification itself. **Nothing below is changed until he confirms the
wording.** Generated from `packages/i18n/src/messages/uk.ts` (excluding «зареєстрована»,
«незареєстрована», «реєстрації», which are legal terms).

| # | Key | Current text (excerpt) | Where it shows | Who sees it | Sense |
|---|---|---|---|---|---|
| 1 | `kabinet.profile.contactsNote` | «…Листування йде напряму, не через реєстр.» | kabinet profile | shelter | site. Fixed in the copy PR (CB-B1) |
| 2 | `kabinet.profile.donationNote` | «Лише https. Реєстр не приймає і не передає гроші…» | kabinet profile | shelter | site. Fixed in the copy PR |
| 3 | `kabinet.profileEdit.voice.hint` | «…Реєстр підставляє лише імʼя тварини…» | K4 voice editor | shelter | site. Fixed in the copy PR |
| 4 | `kabinet.operatorFallbackName` | «Оператор реєстру» | the shelter's history, the support banner, the locked block (wherever no name is configured) | shelter | operator (a name slot) |
| 5 | `kabinet.signIn.intro` | «Для притулків і оператора реєстру…» | `/kabinet/vkhid` | shelter, operator | operator |
| 6 | `kabinet.signIn.addressNote` | «Адресу додає оператор реєстру…» | `/kabinet/vkhid` | shelter | operator |
| 7 | `kabinet.email.invite.intro` | «…доступ до кабінету притулку «{shelter}» у реєстрі.» | invite email | shelter | site |
| 8 | `kabinet.inviteLanding.expired` | «…Попросіть оператора реєстру надіслати нове.» | invite landing | shelter | operator |
| 9 | `about.intro` | «Opika — реєстр тварин притулків Київщини, який я роблю сам…» | `/pro` | everyone | positioning |
| 10 | `about.free` | «Реєстр безкоштовний для притулків…» | `/pro` | everyone | site |
| 11 | `about.money` | «…реєстр лише показує посилання…» | `/pro` | everyone | site |
| 12 | `about.data` | «…реєстр зберігає ім'я та адресу пошти адміністратора…» | `/pro` | everyone | site |
| 13 | `about.analytics` | «Реєстр збирає базову статистику відвідувань…» | `/pro` | everyone | site |
| 14 | `forShelters.whatThisIs` | «Opika — реєстр тварин із перевірених притулків Київщини…» | `/prytulkam` | shelters | positioning |
| 15 | `forShelters.money` | «Реєстр не бере і не переказує грошей…» | `/prytulkam` | shelters | site; **commitment #5's sentence** (the register changes with it) |
| 16 | `forShelters.howToStart` | «…і ваші тварини з'являються в реєстрі.» | `/prytulkam` | shelters | site |
| 17 | `demo.bannerNotice` | «У реєстрі поки немає справжніх притулків…» | the demo banner (gallery, animal page) | everyone | site; goes with the flip PR (F-B7) |
| 18 | `detail.notFound.body` | «Тварину вже забрали з реєстру…» | the animal page's not-found state | adopters | site |
| 19 | `medical.registryConfirmed` | «Підтверджено реєстром тварин» | animal page, medical facts | adopters | an **external** animal registry, not the site |
| 20 | `medical.registry` | «Реєстр тварин» | animal page, the medical source label | adopters | external registry |
| 21 | `PENDING_R4_2_ANALYTICS_SENTENCE` | «…реєстр ставить одне кукі… а реєстр — чиї контакти…» | not live (the `/pro` cookie sentence, held for launch) | — | site |
