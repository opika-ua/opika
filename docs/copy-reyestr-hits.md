# «реєстр» in user-facing copy: the hits (2026-10-17)

Oleksii's brand rule (CB-B1): no «реєстр» in user-facing copy, as it implies a state service. His
default wording rule while he writes the exact text (CB-B2): «сайт» / «через сайт» / «на сайті»
for the website; «я» for the person checking shelters (operator voice: no «ми», no gendered past
tense); «перевірка» for the verification itself.

**All rows are resolved (2026-10-18).** Rows 5-11, 13-18 and 21 were drafted under CB-B2 in
#123 (`copy/reyestr-drafts`) and approved with four changes (CB-Q2, his words in
`docs/decisions-inbox/copy-reyestr-drafts.md`). Row 12 is not reworded in #123: PR 6 replaces the
whole paragraph with his text (`pr6-copy-uk.md` §1.5), so it keeps «реєстр» until then. The
list was generated from `packages/i18n/src/messages/uk.ts`, excluding «зареєстрована»,
«незареєстрована» and «реєстрації», which are legal terms.

| # | Key | Text before (excerpt) | Where it shows | Who sees it | Sense | Resolved |
|---|---|---|---|---|---|---|
| 1 | `kabinet.profile.contactsNote` | «…Листування йде напряму, не через реєстр.» | kabinet profile | shelter | site. Fixed in the copy PR (CB-B1) | CB-B1, #115 |
| 2 | `kabinet.profile.donationNote` | «Лише https. Реєстр не приймає і не передає гроші…» | kabinet profile | shelter | site. Fixed in the copy PR | CB-B1, #115 |
| 3 | `kabinet.profileEdit.voice.hint` | «…Реєстр підставляє лише імʼя тварини…» | K4 voice editor | shelter | site. Fixed in the copy PR | CB-B1, #115 |
| 4 | `kabinet.operatorFallbackName` | «Оператор реєстру» | the shelter's history, the support banner, the locked block (wherever no name is configured) | shelter | operator (a name slot) | R-UI 1, #119: «Адміністратор сайту» |
| 5 | `kabinet.signIn.intro` | «Для притулків і оператора реєстру…» | `/kabinet/vkhid` | shelter, operator | operator | #123: «Для притулків і адміністратора сайту.» |
| 6 | `kabinet.signIn.addressNote` | «Адресу додає оператор реєстру…» | `/kabinet/vkhid` | shelter | operator | #123: «Адресу додаю я, коли запрошую притулок.» |
| 7 | `kabinet.email.invite.intro` | «…доступ до кабінету притулку «{shelter}» у реєстрі.» | invite email | shelter | site | #123: «…«{shelter}» на сайті.» |
| 8 | `kabinet.inviteLanding.expired` | «…Попросіть оператора реєстру надіслати нове.» | invite landing | shelter | operator | #123: «Напишіть мені — я надішлю нове.» |
| 9 | `about.intro` | «Opika — реєстр тварин притулків Київщини, який я роблю сам…» | `/pro` | everyone | positioning | #123, his sentence: «Opika — сайт, де тварини з притулків Київщини шукають дім. Я роблю його сам, поза роботою.» |
| 10 | `about.free` | «Реєстр безкоштовний для притулків…» | `/pro` | everyone | site | #123: «Сайт безкоштовний для притулків…» |
| 11 | `about.money` | «…реєстр лише показує посилання…» | `/pro` | everyone | site | #123: «…сайт лише показує посилання…» |
| 12 | `about.data` | «…реєстр зберігає ім'я та адресу пошти адміністратора…» | `/pro` | everyone | site | PR 6: the whole paragraph becomes his text (`pr6-copy-uk.md` §1.5, «…сайт зберігає…»); unchanged until then |
| 13 | `about.analytics` | «Реєстр збирає базову статистику відвідувань…» | `/pro` | everyone | site | #123: «Сайт збирає базову статистику відвідувань…» |
| 14 | `forShelters.whatThisIs` | «Opika — реєстр тварин із перевірених притулків Київщини…» | `/prytulkam` | shelters | positioning | #123, his sentence: «Opika — сайт, де тварини з перевірених притулків Київщини шукають дім, а кожен ваш підопічний отримує власну сторінку.» |
| 15 | `forShelters.money` | «Реєстр не бере і не переказує грошей…» | `/prytulkam` | shelters | site; **commitment #5's sentence** (the register changes with it) | #123: «Сайт не бере і не переказує грошей: … ні збору донатів через сайт.» (his change); register row 5 updated |
| 16 | `forShelters.howToStart` | «…і ваші тварини з'являються в реєстрі.» | `/prytulkam` | shelters | site | #123: «…і ваші тварини з'являються на сайті.» |
| 17 | `demo.bannerNotice` | «У реєстрі поки немає справжніх притулків…» | the demo banner (gallery, animal page) | everyone | site; goes with the flip PR (F-B7) | #123: «На сайті поки немає справжніх притулків…» |
| 18 | `detail.notFound.body` | «Тварину вже забрали з реєстру…» | the animal page's not-found state | adopters | site | #123, his sentence: «Тварини вже немає на сайті або посилання застаріле.» |
| 19 | `medical.registryConfirmed` | «Підтверджено реєстром тварин» | animal page, medical facts | adopters | an **external** animal registry, not the site | #116: «Підтверджено державним реєстром тварин» (his Q5 exception) |
| 20 | `medical.registry` | «Реєстр тварин» | animal page, the medical source label | adopters | external registry | #116: «Державний реєстр тварин» (his Q5 exception) |
| 21 | `PENDING_R4_2_ANALYTICS_SENTENCE` | «…реєстр ставить одне кукі… а реєстр — чиї контакти…» | not live (the `/pro` cookie sentence, held for launch) | - | site | #123: «…сайт ставить одне кукі… а сайт — чиї контакти…» |
