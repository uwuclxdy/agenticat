---
name: clean-code
description: Language-agnostic clean code principles (examples in JS/TS & Java) for writing, reviewing, or refactoring code — naming, functions, error handling, comments, architecture.
---

# Clean Code Principles

Apply these principles when writing, reviewing, or refactoring code. They are organized from the most fundamental (naming) to code organization, formatting, and commenting best practices.

---

## 1. Naming & Readability

### 1.1 Avoid Disinformation

Never use variable names that create false expectations, contain misleading technical terms, or use visually confusing characters.

**Do:**
- Use names that honestly reflect the data structure, like `accountsMap` or `accountsGroup`.
- Use distinct names for classes/variables so autocomplete doesn't trick you.

**Don't:**
- Name a map/object `accountList` just because it holds multiple items — to a programmer, "list" means an array/indexed structure.
- Create names that vary in tiny ways (e.g., `ABCManagerForEfficientProcessingOfUsers` vs `...PersistingOfUsers`).
- Use characters that look identical (e.g., lowercase `l` and number `1`, or uppercase `O` and number `0`).
  - Bad: `int a = l; if (O == l) a = O1; else l = O1;`

Disinformation creates "code lies" where developers' perceptions differ from actual behavior, causing confusion and bugs.

### 1.2 Make Meaningful Distinctions

If two things have different names, they must do different things. Avoid meaningless noise words and number series.

**Do:**
- Reveal the actual role of variables (e.g., `array`, `condition`, `transformation`).
- Use specific, role-based names for classes (e.g., `OrderValidator`, `OrderRepository`, `OrderCalculator`).

**Don't:**
- Use numbered variables that look identical but do different things.
  - Bad: `function filterAndMap(data1, data2, data3)`
- Add meaningless noise suffixes when you can't think of a better name (e.g., `OrderManager`, `OrderHandler`, `OrderController`, `OrderProcessor` all existing side by side).
- Add redundant prefixes/suffixes (e.g., `getUser()`, `getUserInfo()`, `getUserData()` with no clear distinction).

Meaningless distinctions force every developer to waste time reading the underlying implementation just to understand the difference between two functions or classes.

### 1.3 Use Pronounceable Names

Variable names should sound like natural human language so they can be easily read and spoken aloud.

**Do:**
- Use real words that describe the intent.
  - Good: `let generationTimestamp = new Date();`
  - Good: `class Customer { private generationTimestamp: Date; private productSerialNumber: string; }`

**Don't:**
- Mash abbreviations together into cryptic strings.
  - Bad: `let genymdhms = new Date();` (generation year month day hour minute second)
  - Bad: `let prcssr = new Processor(); let dtaRcrd = fetchData();`

Programming is a social activity. Unpronounceable names prevent teams from discussing code verbally and create a major onboarding bottleneck.

### 1.4 Use Searchable Names

The length of a variable name should match the size of its scope. Avoid single letters or raw numbers for anything outside a tiny local scope.

**Do:**
- Use single letters (`i`, `j`) *only* for local variables in very short scopes (like a tiny `for` loop).
- Create named, searchable constants for numbers.
  - Good: `MAX_CLASSES_PER_STUDENT = 7;`
  - Good: `taskDays = taskEstimate[j] * WORK_DAYS_PER_WEEK; sum += taskDays / NUMBER_OF_TASKS;`

**Don't:**
- Use single letters in larger scopes (searching for the letter `e` will return thousands of useless results).
- Hardcode "magic numbers" into business logic.
  - Bad: `for (let e = 0; e < 7; e++) { total += (data[e] * 4) / 5; }`

Cryptic names and magic numbers are impossible to locate using search tools, making the codebase unnavigable and harder to maintain.

### 1.5 Avoid Encodings (Hungarian Notation)

Do not encode type or scope information into variable names. Let your IDE and compiler handle types.

**Do:**
- Use names that describe *intent*, stripping away type prefixes.
  - Good: `let firstName: string;`, `let age: number;`, `let isLoggedIn: boolean;`

**Don't:**
- Use "Hungarian Notation" to prefix variables with their type.
  - Bad: `let strFirstName: string;`, `let iAge: number;`, `let bIsLoggedIn: boolean;`, `let fAccountBalance: number;`

Modern IDEs show types on hover, and compilers catch type errors instantly. Encodings are redundant visual noise.

### 1.6 Avoid Mental Mapping

Don't force readers to mentally translate cryptic abbreviations into their actual meanings.

**Do:**
- Use obvious, clear names.
  - Good: `const apiUrl = 'https...'; const user = fetchUser(apiUrl); const permissions = user.permissions; const isAdmin = permissions.includes('admin');`
  - Good: `function calculateTotal(price, tax, quantity) { return (price + tax) * quantity; }`

**Don't:**
- Use single-letter abbreviations that require the reader to memorize a mental lookup table.
  - Bad: `const hp = Math.sqrt(a*a + b*b);`
  - Bad: `const r = '...'; const u = fetchUser(r); const p = u.permissions; const a = p.includes('admin');`
  - Bad: `for (let i=0; i<t.length; i++) { const tx = t[i]; validate(tx); }` — is `tx` time, tax, text, or transaction?

Cryptic names add entries to a developer's "mental stack." The reader's brain gets bogged down deciphering abbreviations instead of focusing on the actual logic.

### 1.7 Expressive Logic (Self-Documenting Code)

Refactor complex logic into well-named variables, functions, and constants so the code explains itself without the need for comments.

**Do:**
- Extract complex conditions into well-named boolean variables.
  - Good:
    ```javascript
    const isBusinessHour = currentHour >= OPENING_HOUR && currentHour < CLOSING_HOUR;
    const isBusinessDay = currentDay !== SATURDAY && currentDay !== SUNDAY;
    const isStoreOpen = isBusinessHour && isBusinessDay && !isHoliday;
    if (isStoreOpen) { showOpenBanner(); }
    ```
- Extract blocks of logic into functions so the code reads like a sentence (e.g., `if (checkIsStoreOpen())`).
- Give variables descriptive names to fill the gap left by deleted comments (e.g., `let elapsedTimeInDays;`).
- Extract magic numbers into well-named constants (e.g., `const ONE_DAY_IN_MS = 86400000;`).

**Don't:**
- Write a comment above a complex `if` statement to explain what it does.
  - Bad: `// Show banner if the store is currently open` above `if (currentHour >= OPENING_HOUR...)`
- Use single-letter variables and explain them with a comment.
  - Bad: `let d; // elapsed time in days`
- Leave raw "magic numbers" in your code.
  - Bad: `setTimeout(logoutUser, 86400000);`

Every comment is a second thing to maintain. Code changes, and if you forget to update the comment, it becomes misinformation. Tying the meaning directly to the variable or function name ensures it stays permanently accurate.

---

## 2. Function Structure & Size

### 2.1 Keep Functions Small

Functions should be small, and blocks inside control structures should be exactly one line long.

**Do:**
- Extract complex math, loops, and logic into clearly named helper functions.
- Make blocks inside `if`, `else`, and `while` statements exactly one line long (a function call).
  - Good: `if (file.size > MAX) { return uploadFileInParts(file, id); } else { return uploadFileAsSinglePart(file, path); }`

**Don't:**
- Write long functions that mix high-level conditions with low-level mathematical implementation details and nested loops.

Long functions bury your logic under layers of noise. Small, clearly named functions tell a story of *what* is happening without forcing the reader to decipher *how*.

### 2.2 Do One Thing

A function should do exactly one thing. The litmus test: you cannot extract another meaningful function from it.

**Do:**
- Test your functions: Can you label sections of the code with comments like `// Validation`, `// Storage`, `// Notification`? If so, extract them into separate functions.
- Test your extractions: If you extract a function and the new name is just a restatement of the code (e.g., `uploadBasedOnSize`), it's doing one thing. If the extracted name represents a separate concept (e.g., `uploadFileInParts`), the original was doing too much.

**Don't:**
- Write "micromanager" functions that handle validation, calculation, database storage, and email notifications all at once.

A function doing multiple things has multiple reasons to change, multiple ways to break, and requires massive test suites.

### 2.3 Maintain One Level of Abstraction

A function should only contain code at a single, consistent level of abstraction, delegating deeper details to the next level down.

**Do:**
- Structure code like a top-down narrative. The "CEO" function delegates to "Manager" functions, which delegate to "Specialist" functions.
  - CEO level: `validateStock(); calculateTotalBill(); executeStripeCharge(); notifyWarehouse();`
  - Manager level (`calculateTotalBill`): `sumItems(); applyDiscount(); calculateTax();`

**Don't:**
- Mix pure intent (high-level logic) with raw syntax (low-level logic) in the same function.
  - Bad: `validateStockAvailability(); const finalBill = subtotal - discount + tax; Stripe.charges.create({ amount: finalBill * 100, source: order.token }); fetch("https://warehouse...");`

Mixing levels creates messy "micromanager" functions. Keeping functions at one level of abstraction allows readers to understand the overarching narrative without getting bogged down in API syntax.

---

## 3. Arguments & Data Flow

### 3.1 Minimize Function Arguments

The ideal number of arguments is zero. If you hit three or more, wrap them in an object. Never use boolean flags or output arguments.

**Do:**
- Strive for zero arguments (`fetchData()`), one argument (`fileExists(path)`), or two if they are a natural pair (`moveTo(x, y)`).
- Group related arguments into objects.
  - Good: `saveUser(user)` (where `user` is an object containing name, email, age, etc.)

**Don't:**
- Pass 3, 4, or 5 arguments individually.
  - Bad: `saveUser(name, email, age, city, isPremium)`
- Use output arguments that modify their inputs instead of returning a value (`findMax(numbers, result)`).
- Use boolean flags (`createUser(true)`) that force different code paths — this explicitly violates the "Do One Thing" rule.
- Pass two unrelated arguments as peers (`sendEmail(message, smtp)`). Instead, make one the owner: `smtp.sendEmail(message)`.

Arguments carry mental weight, demand order memorization, and cause test cases to explode exponentially.

### 3.2 Command Query Separation (& No Hidden Side Effects)

A function should either perform an action (Command) or answer a question (Query), but never both. It should never harbor hidden side effects.

**Do:**
- Split functions into distinct queries and commands.
  - Good: `if (!attributeExists("role")) { setAttribute("role", "admin"); }`
- Ensure functions only do what their names say. Let side effects happen elsewhere.
  - Good: `if (checkPassword(password)) { initializeSession(); }`

**Don't:**
- Write functions that change state *and* return booleans.
  - Bad: `if (setAndCheckIfExists("role", "admin")) { ... }`
- Hide side effects inside seemingly harmless functions.
  - Bad: A `checkPassword()` function that invisibly calls `Session.initialize()` or resets user properties.

Mixing commands/queries creates ambiguity (did it return true because it *was* set, or because it *already* existed?). Hidden side effects create dangerous bugs, like emptying a user's shopping cart just because they verified their password mid-session.

---

## 4. Architecture & Error Handling

### 4.1 Handle Switch Statements with Polymorphism

Switch statements inherently do multiple things. Bury them in abstract factories and use polymorphism instead.

**Do:**
- Create an interface (e.g., `Employee`).
- Bury the switch statement in a Factory (`EmployeeFactory.create(type)`).
- Use polymorphism to let individual classes handle their own logic.
  - Good: `const employee = factory.create('fullTime', data); employee.calculatePay(); employee.getBenefits();`

**Don't:**
- Copy and paste the same `switch(employee.type)` block across multiple functions (`calculatePay`, `getBenefits`, `getSchedule`).

Scattered switch statements mean that adding a new type requires hunting through the entire codebase to update every single switch. Polymorphism eliminates this.

### 4.2 Prefer Exceptions Over Error Codes (& DRY)

Throw exceptions instead of returning error codes. Isolate try/catch blocks into their own functions. Never duplicate logic.

**Do:**
- Use `try/catch` blocks for a clean list of steps.
  - Good: `try { createAccount(); createProfile(); } catch (error) { showError(); }`
- Extract try/catch logic away from normal processing logic (one function for the try/catch, which calls a separate function containing the actual logic).
- Extract repeated code (like API `fetch` boilerplates) into single, authoritative functions.

**Don't:**
- Return error codes that force the caller to write deeply nested `if/else` checks.
- Share `ErrorCode` enums globally, tying your entire codebase together.
- Mix error handling with business logic.
- Repeat yourself — don't copy/paste `timeout: 5000` and `if (!res.ok) throw error` across twenty API calls.

Error codes bury the "happy path" under nested error checking. Shared enums require massive recompilations when changed. Violating DRY (Don't Repeat Yourself) guarantees silent bugs when you update logic in one place but forget the others.

### 4.3 Write Try-Catch-Finally First

Define the error-handling structure before the business logic, so the function's contract — what it expects and what it throws — is fixed up front.

**Do:**
- Write the `try-catch-finally` skeleton first, define the custom exception you expect to throw, then fill the `try` block with business logic.
  - Good:
    ```javascript
    function withdraw(accountId, amount) {
      try {
        // business logic added here later
      } catch (e) {
        throw new TransactionFailed(e);
      } finally {
        // cleanup (e.g., release locks)
      }
    }
    ```

**Don't:**
- Write the business logic first and slap a `try/catch` around it as an afterthought.

Writing the `try/catch` first creates a clear contract: every caller immediately knows which exceptions the function can throw and which it handles, so failures don't cascade into breaks across the codebase.

### 4.4 Separate Error Handling from Business Logic

Keep the algorithm and its error handling in separate functions, using exceptions instead of nested `if`-statements that return error codes.

**Do:**
- Extract the algorithm into its own function that throws, and keep a separate function whose only job is to catch.
  - Good:
    ```javascript
    function sendMessage(msg) {
      try {
        deliverMessage(msg); // error handling knows nothing about the algorithm
      } catch (error) {
        notifySender(msg.token, error);
      }
    }

    function deliverMessage(msg) {
      // algorithm knows nothing about error handling
      const sender = verifySession(msg.token);
      const channel = resolveChannel(msg.to);
      const content = moderate(msg.text);
      broadcast(channel, sender, content);
    }
    ```

**Don't:**
- Interleave error checking and algorithm steps with deeply nested `if/else` that returns error codes.
  - Bad:
    ```javascript
    function sendMessage(msg) {
      const sender = verifySession(msg.token);
      if (sender !== null) {
        const channel = resolveChannel(msg.to);
        if (channel.active) {
          // ... more nesting ...
          return "sent";
        } else { return "closed"; }
      } else { return "expired"; }
    }
    ```

When error handling wraps every step of an algorithm, the algorithm disappears. Your eyes ping-pong between logic and failure branches, and you can read neither clearly.

### 4.5 The Law of Demeter

A method should only call methods on its immediate dependencies ("friends"), never navigate through them to reach the internals of "strangers."

**Do:**
- Tell the immediate object what you need it to do directly.
  - Good: `let bufferOutputStream = ctxt.createScratchFileStream(classFileName);`

**Don't:**
- Chain method calls to navigate deep into an object's internal structure.
  - Bad:
    ```javascript
    let outputDir = ctxt.getOptions()
                        .getScratchDir()
                        .getAbsolutePath();
    ```

Method chains expose the internal structure of your dependencies and couple your code to their hidden navigation path. When that internal structure changes, your code breaks.

### 4.6 Avoid Hybrid Structures (Objects vs. Data Structures)

Keep objects (which hide data and expose behavior) strictly separate from data structures (which expose data and have no behavior); never blend the two.

**Do:**
- Use pure data structures (DTOs, clean active records) to hold data, and put business logic in separate objects.
  - Good:
    ```java
    class ProductDTO {        // pure data structure
      public String name;
      public double price;
    }

    class Pricing {           // pure object (behavior)
      double applyDiscount(ProductDTO p, double pct) { ... }
    }
    ```

**Don't:**
- Build "hybrid" classes that carry private data with getters/setters *and* significant business logic.
  - Bad:
    ```java
    class Product {
      private double price;
      double getPrice() { return price; }
      void setPrice(double p) { price = p; }

      // business logic trapped inside a data structure
      double applyDiscount(double pct) {
        return price * (1 - pct / 100);
      }
    }
    ```

Hybrids are the worst of both worlds. Like objects, they make it hard to add new functions; like data structures, they make it hard to add new types. You pay both taxes and reap neither benefit.

### 4.7 Data/Object Anti-Symmetry

Choose procedural code (data structures + separate procedures) when you expect to add new operations, and object-oriented code when you expect to add new types.

**Do:**
- Use data structures with separate procedure classes when new *functions* arrive frequently.
  - Good:
    ```java
    class Square { public double side; }                 // data structure
    class Geometry {
      double area(Object shape) { ... }                  // add perimeter(), diagonal()... freely
    }
    ```
- Use objects where each type owns its behavior when new *types* arrive frequently.
  - Good:
    ```java
    interface Shape { double area(); }
    class Square implements Shape { public double area() { ... } }  // add Triangle freely
    ```

**Don't:**
- Reflexively treat everything as an object. With objects, adding one new function forces you to modify every single class.

What is easy for procedural code (add functions without touching data structures) is hard for OO code, and what is easy for OO code (add types without touching existing functions) is hard for procedural code. Pick the paradigm that matches how the code will actually evolve.

### 4.8 Data Abstraction

Hide how data is stored by exposing abstract behavior, not getters/setters that mirror the exact stored fields.

**Do:**
- Expose behavior that represents the concept abstractly.
  - Good:
    ```java
    public interface Vehicle {
      double getPercentFuelRemaining();
    }
    ```

**Don't:**
- Blindly add getters/setters that reveal exactly how the data is stored.
  - Bad:
    ```java
    public interface Vehicle {
      double getFuelTankCapacityInGallons();
      double getGallonsOfGasoline();
    }
    ```

The whole point of private variables is the freedom to change how data is stored. Expose the exact shape of the data through getters/setters and you surrender that freedom, coupling every caller to your internal representation.

---

## 5. Comments

### 5.1 Comments Lie — Use Them Sparingly and Intentionally

Avoid comments that explain *what* code does, as they eventually become outdated lies. Use comments only to explain *why* or to provide necessary warnings.

**Do:**
- Write code so clear it doesn't need comments.
- Explain business intent: `// prevents abuse while keeping free tier viable`
- Write warnings: `// WARNING: Takes too long to run. Skip during quick test cycles.`
- Clarify complex math/regex: `// 3-20 alphanumeric chars`
- Mark known tech debt: `// TODO: Remove workaround when...`
- Use standard doc comments (JSDoc, rustdoc, etc.) for public APIs.

**Don't:**
- Write comments explaining basic code behavior.
- Leave old comments behind when refactoring logic.
  - Bad: Leaving `// User must be 18 or older` above code that was updated to `if (user.age >= 21)`.

Code changes, but comments often don't. When comments get left behind, they actively deceive developers, leading them to introduce bugs.

### 5.2 Rely on Version Control, Not Comments

Never use comments to store old code, authorship, or history logs; and don't use comments to compensate for poorly structured code.

**Do:**
- Delete commented-out code entirely.
- Rely on `git log` to find old code, authors, and historical changes.
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
- Keep journal logs (e.g., `// 11-Oct-2001: Renamed getUserInfo...`).
- Use closing brace comments to track long functions.
  - Bad: `} // end outer for loop`
- Use visual position markers to separate messy files.
  - Bad: `// ======== HELPERS ========`

Commented-out code and history logs clutter the file. Closing brace comments and position markers are usually symptoms of a file or function that is too long or doing too much. Clean structure speaks for itself.

### 5.3 Clear, Relevant, and Readable Comments

If you must write a comment, make it highly specific, relevant to current constraints, and easily readable in plain text.

**Do:**
- Write clear `TODO` comments that explain actual constraints or issues so the next developer knows exactly what to fix.
  - Good:
    ```javascript
    // TODO: Add a timeout check here.
    // Currently, if the server response > 5s, the UI freezes.
    ```
- Use plain text that is readable in any IDE.

**Don't:**
- Write "mumbling" comments that lack context.
  - Bad: `// R.J. said this might cause a race condition... not sure if it works`
- Write historical novels about dead dependencies or previous library versions that don't help the developer today.
- Use HTML tags for visual formatting in your code editor.
  - Bad: `// <p>Calculates the <b>final price</b>...</p>`

Vague comments confuse readers. Overly detailed historical comments waste time. HTML-formatted comments force the developer's eyes to filter through tags just to read English, making editing a hassle.

---

## 6. Code Organization & Formatting

### 6.1 The Newspaper Metaphor (Vertical Formatting)

Structure your source files like a newspaper article, with the highest-level summary at the top and detailed implementations flowing naturally downward.

**Do:**
- Place your highest-level function (the "headline") at the absolute top of the file.
- Place every supporting function just below its caller.
- Group utility functions that serve a similar purpose together at the bottom (Conceptual Affinity).
  - Good: Grouping `formatDate(dateString)` and `formatScore(number)` near each other.

**Don't:**
- Scramble functions in a random order.
- Force developers to scroll up and down endlessly to find how a function is implemented.

It builds trust with the reader. In three lines, a developer can read the top function and know exactly what the file does. Reading flows in a natural downward direction from high-level concepts to low-level details.

### 6.2 Visual Hierarchy via Vertical Spacing

Use blank lines to separate distinct concepts, and keep related lines vertically dense to create a scannable visual hierarchy.

**Do:**
- Use a blank line to indicate a new concept is starting.
- Keep related lines of code tightly grouped together (vertically dense).
  - Good:
    ```javascript
    // Data extraction group
    const firstName = data.firstName;
    const lastName = data.lastName;

    // Business logic group
    const yearsActive = currentYear - joinDate;
    const titlePrefix = yearsActive > 5 ? "Veteran" : "Member";

    // Result group
    return `${titlePrefix} ${firstName}`;
    ```
- Use proper indentation for each scope level.

**Don't:**
- Write a massive wall of text with no vertical spacing (makes it hard to read).
- Put blank lines between every single line of code (disconnects related logic).

The brain processes visual groups far more easily than walls of text. Proper spacing drops mental effort and allows a developer to scan and navigate to any section at a glance.

### 6.3 Variable Proximity and Team Standards

Declare variables exactly where they are used to reduce mental baggage, and strictly follow your team's formatting standards.

**Do:**
- Move variables inside the specific nested block where they are used.
- Declare variables right before they are needed.
- Keep shared class properties in one designated place (usually the top of the class).
- Follow team decisions on tabs vs. spaces, quotes, and brace placement.

**Don't:**
- Declare all variables at the top of a function if they aren't used until the end.
  - Bad: `let report; ... // 20 lines of irrelevant code ... report = buildReport();`
- Scatter shared class properties throughout a class just to be near one specific function.

A variable declared too early is mental baggage the reader has to carry in their "mental stack" until it is finally used. Subjective formatting debates waste time; consistent team formatting ensures styling never gets in the way of understanding the code.

---

## Quick Reference Cheat Sheet

| Category | Do | Don't |
|---|---|---|
| **Naming** | Names that reveal intent, are pronounceable, and match scope length | Cryptic abbreviations, identical-looking chars, noise suffixes (`Manager`/`Data`), Hungarian encodings (`strName`) |
| **Self-documenting code** | Extract complex logic into well-named booleans, functions, and constants (`ONE_DAY_IN_MS`) | Comments explaining messy code, single-letter variables (`d`), raw magic numbers (`86400000`) |
| **Functions** | Small functions, one thing each, single level of abstraction | Massive functions mixing high-level decisions with low-level API calls |
| **Arguments** | Zero or one arg; group 3+ into an object | Long arg lists, boolean flags, output arguments, hidden side effects |
| **Control flow** | Commands (do things) or Queries (answer things), never both | Functions that mutate state and return values simultaneously |
| **Errors** | Throw exceptions; write the try-catch-finally skeleton first; keep error handling in its own function, separate from the algorithm | Return error codes forcing nested `if/else`; global error enums; bolt try/catch on as an afterthought |
| **Duplication** | Extract shared logic into a single authoritative place (DRY) | Copy-pasting switch statements or API boilerplate across files |
| **Types** | Polymorphism via interfaces/factories for type-dependent behavior | Repeated `switch(type)` blocks scattered across functions |
| **Coupling** | Ask immediate dependencies to act directly (Law of Demeter) | Chain calls (`a.getB().getC().getD()`) to navigate internal structure |
| **Objects vs. data** | Pure data structures (DTOs) hold data; behavior lives in separate objects | Hybrid classes carrying both getters/setters and business logic |
| **Paradigm choice** | Procedural when adding operations, OO when adding types (anti-symmetry) | Forcing everything into objects regardless of how the code evolves |
| **Data abstraction** | Expose abstract behavior that hides how data is stored | Getters/setters that mirror the exact stored fields |
| **Comments** | Explain *why*, warnings, specific plain-text TODOs, public API docs | Explain *what* code does, mumbling comments, HTML-formatted comments |
| **Version control** | Rely on `git log` for history and authorship; delete dead code | Commented-out code, authorship tags, journal logs, closing brace comments |
| **File structure** | Headline function at top, callers above callees, related utilities grouped | Random function order, scrolling endlessly to find implementations |
| **Vertical spacing** | Blank lines between concepts, tight grouping for related lines | Walls of text with no spacing, or blank lines between every single line |
| **Variable proximity** | Declare variables right where they are used; follow team formatting standards | Variables declared 20 lines before use; personal style over team conventions |
