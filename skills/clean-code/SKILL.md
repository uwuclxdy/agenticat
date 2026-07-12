---
name: clean-code
description: "Language-agnostic principles (naming, functions, error handling, comments, formatting, readability, duplication, maintainability) for writing, reviewing, or refactoring."
metadata:
  author: uwuclxdy
  version: "1.0"
---

# Clean Code Principles

Use these when you write, review, or refactor code.

Treat these as directional principles. Where a repo's established precedent or a language's own idioms conflict with a rule here, follow the local convention and match the surrounding code.

---

## 1. Naming & Readability

### 1.1 Avoid Disinformation

Never use variable names that create false expectations, contain misleading technical terms, or use visually confusing characters.

**Do:**
- Use distinct names for classes/variables so autocomplete doesn't trick you.

**Don't:**
- Create names that vary in tiny ways (e.g., `ABCManagerForEfficientProcessingOfUsers` vs `...PersistingOfUsers`).

### 1.2 Make Meaningful Distinctions

If two things have different names, they must do different things. Avoid meaningless noise words and number series.

**Do:**
- Reveal the actual role of variables (e.g., `array`, `condition`, `transformation`).
- Use specific, role-based names for classes (e.g., `OrderValidator`, `OrderRepository`, `OrderCalculator`).

**Don't:**
- Add meaningless noise suffixes when you can't think of a better name (e.g., `OrderManager`, `OrderHandler`, `OrderController`, `OrderProcessor` all existing side by side).

### 1.3 Use Searchable, Pronounceable Names

Names should read as natural words and match the size of their scope, so they can be spoken aloud and found by search. Avoid cryptic abbreviations, single letters outside tiny scopes, and raw magic numbers.

**Do:**
- Use real words that describe intent.
  - Good: `let generationTimestamp = new Date();`
- Use single letters (`i`, `j`) only in tiny scopes, like a short `for` loop.

**Don't:**
- Mash abbreviations into cryptic strings.
- Use single letters in larger scopes (searching for `e` returns thousands of useless hits).

### 1.4 Avoid Encodings (Hungarian Notation)

Do not encode type or scope information into variable names. Let your IDE and compiler handle types.

**Do:**
- Use names that describe intent, with no type prefixes: `let firstName: string;`

**Don't:**
- Use "Hungarian Notation" to prefix variables with their type: `let strFirstName: string;`

### 1.5 Expressive Logic (Self-Documenting Code)

Refactor complex logic into well-named variables, functions, constants. The code then explains itself without comments.

**Do:**
- Extract complex conditions into well-named boolean variables.
  - Good:
    ```javascript
    const isBusinessHour = currentHour >= OPENING_HOUR && currentHour < CLOSING_HOUR;
    const isBusinessDay = currentDay !== SATURDAY && currentDay !== SUNDAY;
    const isStoreOpen = isBusinessHour && isBusinessDay && !isHoliday;
    if (isStoreOpen) { showOpenBanner(); }
    ```

**Don't:**
- Write a comment above a complex `if` statement to explain what it does.
  - Bad: `// Show banner if the store is currently open` above `if (currentHour >= OPENING_HOUR...)`

---

## 2. Function Structure & Size

### 2.1 Keep Functions Small

Functions should be small. Keep blocks inside control structures short, often a single call.

**Do:**
- Extract fiddly math and nested loops into named helper functions.
- Favor a short block inside `if`, `else` or `while` statements, ideally a single function call.

**Don't:**
- Write long functions that mix high-level conditions with low-level math and nested loops.

### 2.2 Do One Thing

A function should do exactly one thing. The litmus test: you cannot extract another meaningful function from it.

**Do:**
- Test your functions: if you can label sections with comments like `// Validation`, `// Storage`, `// Notification`, extract each into its own function.
- Test your extractions: if extracting a function produces a name that merely restates its body (e.g., `uploadBasedOnSize`), the ORIGINAL function was already doing one thing. If the extracted name represents a genuinely separate concept (e.g., `uploadFileInParts`), the original function was doing too much.

**Don't:**
- Write "micromanager" functions that handle validation, calculation, database storage, and email notifications all at once.

### 2.3 Maintain One Level of Abstraction

A function should only contain code at a single, consistent level of abstraction, delegating deeper details to the next level down.

**Do:**
- Keep every line at one level of abstraction, delegating deeper detail one level down.
  - Good: `validateStock(); calculateTotalBill(); executeStripeCharge(); notifyWarehouse();`

**Don't:**
- Mix pure intent (high-level logic) with raw syntax (low-level logic) in the same function.
  - Bad: `validateStockAvailability(); const finalBill = subtotal - discount + tax; Stripe.charges.create({ amount: finalBill * 100, source: order.token }); fetch("https://warehouse...");`

---

## 3. Arguments & Data Flow

### 3.1 Minimize Function Arguments

Fewer arguments read cleaner. If you reach three or more, wrap them in an object. Avoid boolean flags and output arguments.

**Do:**
- Strive for zero arguments (`fetchData()`), one argument (`fileExists(path)`), or two if they are a natural pair (`moveTo(x, y)`).
- Group related arguments into objects.
  - Good: `saveUser(user)` (where `user` is an object containing name, email, age, etc.)

**Don't:**
- Pass long argument lists (`saveUser(name, email, age, city, isPremium)`), output arguments that mutate inputs instead of returning (`findMax(numbers, result)`), or boolean flags (`createUser(true)`) that force two code paths from one function (violates "Do One Thing").
- Pass two unrelated arguments as peers (`sendEmail(message, smtp)`); make one the owner: `smtp.sendEmail(message)`.

### 3.2 Command Query Separation (& No Hidden Side Effects)

A function should either perform an action (Command) or answer a question (Query), but never both. It should never harbor hidden side effects.

**Do:**
- Ensure functions only do what their names say. Let side effects happen elsewhere.
  - Good: `if (checkPassword(password)) { initializeSession(); }`

**Don't:**
- Hide side effects inside seemingly harmless functions.
  - Bad: A `checkPassword()` function that invisibly calls `Session.initialize()` or resets user properties.

---

## 4. Architecture & Error Handling

### 4.1 Handle Switch Statements with Polymorphism

Switch statements inherently do multiple things. Bury them in abstract factories and use polymorphism instead.

Language caveat: this is object-oriented advice. With compiler-checked exhaustive matching, a `match`/`switch` over a closed set of variants is idiomatic and safe. In Rust the compiler enforces exhaustiveness and flags any unhandled case when a new variant is added; Go has no such compiler check (a `switch` missing cases builds clean and `go vet` passes), so exhaustiveness there needs the external `nishanths/exhaustive` linter. Reach for polymorphism when the type set is open; a compiler-checked match already handles a closed one.

**Do:**
- Bury the switch in a factory (`EmployeeFactory.create(type)`) behind an interface (e.g., `Employee`).
- Let each class handle its own logic via polymorphism.
  - Good: `const employee = factory.create('fullTime', data); employee.calculatePay(); employee.getBenefits();`

**Don't:**
- Copy the same `switch(employee.type)` block into function after function (`calculatePay`, `getBenefits`, `getSchedule`).

### 4.2 Separate Error Handling from Business Logic

Throw exceptions instead of returning error codes. Keep the algorithm and its error handling in separate functions. Where failure modes are known, write the `try-catch-finally` skeleton (and the exceptions it throws) first, then fill in the logic.

**Do:**
- Use `try/catch` for a clean list of steps.
  - Good: `try { createAccount(); createProfile(); } catch (error) { showError(); }`
- Extract the algorithm into its own function that throws; keep a separate function whose only job is to catch.
  - Good:
    ```javascript
    function sendMessage(msg) {
      try {
        deliverMessage(msg);            // catch knows nothing about the algorithm
      } catch (error) {
        notifySender(msg.token, error);
      }
    }

    function deliverMessage(msg) {       // algorithm knows nothing about error handling
      const channel = resolveChannel(msg.to);
      broadcast(channel, moderate(msg.text));
    }
    ```

**Don't:**
- Return error codes that push the caller into nested `if/else` checks.
- Share `ErrorCode` enums globally, tying the whole codebase together.

### 4.3 Don't Repeat Yourself (DRY)

Extract repeated logic (API `fetch` boilerplate, `timeout: 5000`, `if (!res.ok) throw error`) into a single authoritative function; duplicating it guarantees silent bugs when you update one copy and forget the others.

### 4.4 The Law of Demeter

A method should only call methods on its immediate dependencies ("friends"), never dig through them to touch the internals of "strangers."

**Do:**
- Tell the immediate object what you need it to do directly.
  - Good: `let bufferOutputStream = ctxt.createScratchFileStream(classFileName);`

**Don't:**
- Chain method calls to burrow into an object's internal structure.

### 4.5 Objects vs. Data Structures

Keep objects (hide data, expose behavior) separate from data structures (expose data, no behavior); never blend the two into hybrids. Choose procedural code (data structures plus separate procedures) when you expect to add new operations; choose object-oriented code when you expect to add new types. Expose abstract behavior, not getters/setters that mirror the exact stored fields.

**Do:**
- Use data structures with separate procedure classes when new functions arrive frequently.
  - Good:
    ```java
    class Square { public double side; }                 // data structure
    class Geometry {
      double area(Object shape) { ... }                  // add perimeter(), diagonal()... freely
    }
    ```

**Don't:**
- Build "hybrid" classes that carry private data with getters/setters and also real business logic.
- Reflexively treat everything as an object regardless of how the code evolves.

---

## 5. Comments

### 5.1 Comments Lie; Use Them Sparingly and Intentionally

Avoid comments that explain what code does, since they eventually rot into outdated lies. Comment only to explain why, or to leave a necessary warning; when you must, keep it specific, tied to a real constraint, and readable as plain text.

**Do:**
- Write code so clear it doesn't need comments.
- Explain business intent: `// prevents abuse while keeping free tier viable`
- Write warnings: `// WARNING: Takes too long to run. Skip during quick test cycles.`
- Clarify complex math/regex: `// 3-20 alphanumeric chars`
- Mark known tech debt with a specific note naming what to fix and when: `// TODO: add timeout check; response > 5s freezes the UI`
- Document public APIs with the language's doc-comment format (`///` rustdoc, `/** */` JSDoc): the public surface is the one place comments earn their keep, since it's the contract callers read.

**Don't:**
- Write comments explaining basic code behavior.
- Leave old comments behind when refactoring logic.
  - Bad: Leaving `// User must be 18 or older` above code that was updated to `if (user.age >= 21)`.
- Write "mumbling" comments that lack context.
  - Bad: `// R.J. said this might cause a race condition... not sure if it works`

### 5.2 Rely on Version Control, Not Comments

Never use comments to store old code, authorship, or history logs; and don't use comments to compensate for poorly structured code.

**Do:**
- Delete commented-out code entirely.
- Rely on `git log` for old versions, authorship, change history.
- Write clean, small functions that do one thing, so you don't need comments to track where blocks end.
  - Good:
    ```javascript
    function generateReport(data) {
        const validItems = filterValid(data);
        const results = processItems(validItems);
        return buildReport(results);
    }
    ```

**Don't:**
- Leave half-dead commented code in your files.
- Keep authorship tags (e.g., `// Created by John Doe - March 2019`).
- Keep journal logs, closing-brace labels, or section markers (`// 11-Oct-2001: Renamed getUserInfo...`, `} // end outer for loop`, `// ======== HELPERS ========`).

---

## 6. Code Organization & Formatting

### 6.1 The Newspaper Metaphor (Vertical Formatting)

Order a source file top-down: highest-level summary first, deeper implementation below.

**Do:**
- Place your highest-level function at the top of the file.
- Place every supporting function just below its caller.
- Group utility functions that serve a similar purpose together at the bottom (Conceptual Affinity).

**Don't:**
- Scramble functions in a random order.
- Force developers to scroll up and down endlessly to find how a function is implemented.

### 6.2 Visual Hierarchy via Vertical Spacing

Use blank lines to separate distinct concepts. Keep related lines vertically dense so the hierarchy stays scannable.

**Do:**
- Use a blank line to indicate a new concept is starting.
- Keep related lines of code tightly grouped together (vertically dense).
- Use proper indentation for each scope level.

**Don't:**
- Write walls of text with no spacing, or blank lines between every single line (both hide the hierarchy).

### 6.3 Variable Proximity and Team Standards

Declare variables exactly where they're used to cut mental baggage. Follow your team's formatting standards without argument.

**Do:**
- Declare variables in the narrowest block that uses them, right before they are needed.
- Keep shared class properties in one designated place (usually the top of the class).
- Follow the team's calls on tabs vs. spaces, quote style, brace placement.

**Don't:**
- Declare all variables at the top of a function if they aren't used until the end.
  - Bad: `let report; ... // 20 lines of irrelevant code ... report = buildReport();`
- Scatter shared class properties throughout a class just to be near one specific function.

---

## Quick Reference Cheat Sheet

| Category | Do | Don't |
|---|---|---|
| **Naming** | Names that reveal intent, are pronounceable, and match scope length | Cryptic abbreviations, identical-looking chars, noise suffixes (`Manager`/`Data`), Hungarian encodings (`strName`) |
| **Self-documenting code** | Extract complex logic into well-named booleans, helper functions, named constants (`ONE_DAY_IN_MS`) | Comments explaining messy code, single-letter variables (`d`), raw magic numbers (`86400000`) |
| **Functions** | Small functions, one thing each, single level of abstraction | Massive functions mixing high-level decisions with low-level API calls |
| **Arguments** | Zero or one arg; group 3+ into an object | Long arg lists, boolean flags, output arguments, hidden side effects |
| **Control flow** | Commands (do things) or Queries (answer things), never both | Functions that mutate state and return values simultaneously |
| **Errors** | Throw exceptions; write the try-catch-finally skeleton first; keep error handling in its own function, separate from the algorithm | Return error codes forcing nested `if/else`; global error enums; bolt try/catch on as an afterthought |
| **Duplication** | Extract shared logic into a single authoritative place (DRY) | Copy-pasting switch statements or API boilerplate into file after file |
| **Types** | Polymorphism via interfaces/factories for type-dependent behavior | Repeated `switch(type)` blocks duplicated in every function |
| **Coupling** | Ask immediate dependencies to act directly (Law of Demeter) | Chain calls (`a.getB().getC().getD()`) to reach into internal structure |
| **Objects vs. data** | Pure data structures (DTOs) hold data; behavior lives in separate objects | Hybrid classes carrying both getters/setters and business logic |
| **Procedural vs OO** | Procedural when adding operations, OO when adding types (anti-symmetry) | Forcing everything into objects regardless of how the code evolves |
| **Data abstraction** | Expose abstract behavior that hides how data is stored | Getters/setters that mirror the exact stored fields |
| **Comments** | Explain why, warnings, specific plain-text TODOs, public API docs | Explain what code does, mumbling comments, HTML-formatted comments |
| **Version control** | Rely on `git log` for history and authorship; delete dead code | Commented-out code, authorship tags, journal logs, closing brace comments |
| **File structure** | Headline function at top, callers above callees, related utilities grouped | Random function order, scrolling endlessly to find implementations |
| **Vertical spacing** | Blank lines between concepts, tight grouping for related lines | Walls of text with no spacing, or blank lines between every single line |
| **Variable proximity** | Declare variables right where they are used; follow team formatting standards | Variables declared 20 lines before use; personal style over team conventions |
