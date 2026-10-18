# Shelter passwords — Ukrainian (for docs/shelter-passwords-copy-sheet.md)

Rows marked "yours" in the sheet stay verbatim. Plurals are avoided by design (`хв.`, `Символів: {count} з {min}`), so no plural pins are needed beyond the existing `{minutes}` ones; keep those tests anyway.

## A. Sign-in
- kabinet.signIn.passwordLabel: Пароль
- kabinet.signIn.showPassword: Показати пароль
- kabinet.signIn.hidePassword: Сховати пароль
- kabinet.signIn.submitPassword: Увійти
- kabinet.signIn.wrongCredentials: Не вдалося увійти. Перевірте адресу й пароль або надішліть собі посилання для входу.

## B. Invitation
- kabinet.setPassword.intro: Пароль для кабінету притулку «{shelter}». Адреса для входу: {email}.
- kabinet.setPassword.newLabel: Пароль
- kabinet.setPassword.repeatLabel: Повторіть пароль
- kabinet.setPassword.hint: Символів: {count} з {min}
- kabinet.setPassword.submit: Зберегти й увійти
- kabinet.password.tooShort: Пароль закороткий. Мінімум символів: {min}.
- kabinet.password.tooLong: Пароль задовгий. Максимум символів: {max}.
- kabinet.password.common: Цей пароль надто легко вгадати. Оберіть інший.
- kabinet.password.personal: Пароль не може містити адресу пошти, назву притулку чи назву сайту.
- kabinet.password.mismatch: Паролі не збігаються.

## C. Forgot
- kabinet.forgot.title: Забули пароль?
- kabinet.forgot.intro: Вкажіть адресу пошти, з якою ви входите в кабінет.
- kabinet.forgot.submit: Надіслати посилання
- kabinet.forgot.sent: Якщо це адреса адміністратора кабінету притулку, на неї надіслано посилання для нового пароля. Воно діє {minutes} хв.
- kabinet.forgot.throttled: Забагато запитів. Спробуйте ще раз пізніше.

## D. Reset
- kabinet.reset.title: Новий пароль
- kabinet.reset.submit: Зберегти пароль
- kabinet.reset.done: Пароль змінено, на всіх пристроях виконано вихід. Увійдіть з новим паролем.
- kabinet.reset.invalidLink: Посилання застаріло або вже використане. {link}
- kabinet.reset.invalidLink.linkText: Отримати нове посилання

## E. Change password
- kabinet.changePassword.currentLabel: Поточний пароль
- kabinet.changePassword.newLabel (if separate from B): Новий пароль
- kabinet.changePassword.submit: Змінити пароль
- kabinet.changePassword.done: Пароль змінено. На інших пристроях виконано вихід, тут ви залишаєтеся в кабінеті.
- kabinet.changePassword.wrongCurrent: Поточний пароль неправильний.
- kabinet.changePassword.noPasswordYet: Пароля ще немає. Створити його можна через «Забули пароль?» на сторінці входу.

## F1. Reset email
- kabinet.email.reset.subject: Новий пароль до кабінету притулку
- kabinet.email.reset.intro: Надійшов запит на новий пароль до кабінету притулку для цієї адреси.
- kabinet.email.reset.action: Створити новий пароль
- kabinet.email.reset.expiry: Посилання спрацює один раз і діє {minutes} хв.
- kabinet.email.reset.notYou: Якщо запит надіслали не ви, просто не зважайте на цей лист: пароль залишиться тим самим.
  — {operator}

## F2. Changed notice
- kabinet.email.passwordChanged.subject: Кабінет притулку: пароль змінено
- kabinet.email.passwordChanged.body: Пароль до кабінету притулку для цієї адреси щойно змінено. На інших пристроях виконано вихід.
- kabinet.email.passwordChanged.notYou: Якщо це не ви — напишіть мені: {contact}
  — {operator}

## G. /pro public claims (about.data, two new sentences)
- password: Для адміністраторів кабінетів притулків зберігається лише незворотний хеш пароля, а не сам пароль.
- session: Вхід у кабінет притулку діє 30 днів від останнього відвідування і не довше 90 днів, після чого треба увійти знову.

Notes:
- Bake 30/90 into the sentence only if the code has one source for them; otherwise interpolate {idleDays}/{maxDays} from the same constants the session config uses, and pin the test.
- The generic sign-in error suggests the link, which honestly covers "no password yet" and the operator without hinting at either.
- C.sent says «Якщо це адреса…» so it stays true for every address, the operator's included.
