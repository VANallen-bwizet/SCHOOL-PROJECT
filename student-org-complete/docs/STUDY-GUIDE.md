# Study guide: from basic Python to this Electron project

Study the completed project in `student-org-complete`. Keep the starter copy for comparison. Begin with the small mathematical JavaScript functions, then follow one button through the application. You do not need to understand every file at once.

## How the application works

```text
HTML controls and tables
        ↓ a user clicks a button
renderer.js or workspace.js
        ↓ calls a named window API
preload.js
        ↓ sends a local Electron message
main.js
        ↓ validates the request
database/db.js and modules/*.js
        ↓ read SQLite or perform a calculation
the result returns to the page and is displayed as plain text
```

The **renderer** is the visible page. The **main process** manages the app and privileged actions such as database and file access. The **preload** script provides a controlled connection between them. A process is a running part of the program with its own execution environment.

These are local messages, called **IPC**: inter-process communication. An **API** is a defined collection of actions another part of a program can call. An API does not necessarily use the Internet.

## 1. Variables and data types

Start in `modules/set-operations.js`.

```javascript
const result = new Set();
let sharedCount = 0;
```

- `const` declares a name that cannot be assigned a different value later. Contents of an array, object, Set, or Map can still change.
- `let` declares a variable that can be reassigned, such as a counter.
- `new Set()` creates a collection of unique values, like Python's `set()`.

| JavaScript | Example | Python comparison |
| --- | --- | --- |
| Number | `3`, `0.25` | Ordinary numeric values |
| String | `'Arts Guild'` | `str` |
| Boolean | `true`, `false` | `True`, `False` |
| Array | `[1, 2, 3]` | Usually used like a list |
| Object | `{ student_id: 1 }` | Similar to a dictionary with named fields |
| Set | `new Set([1, 1, 2])` | `set([1, 1, 2])` |
| Map | `new Map()` | A key-to-value collection, like a dictionary |
| `null` / `undefined` | No value / value not provided | Both can represent missing data, but are different JavaScript values |
| BigInt | `120n` | Exact integer arithmetic for very large committee counts |

Python integers grow automatically. Ordinary JavaScript Number integers have a safe-size limit, so the committee calculation explicitly uses BigInt. Do not mix Number and BigInt in arithmetic; convert with `BigInt(value)` where needed. Counts are returned to the page as decimal text to preserve their exact value.

**Try:** Why does `new Set([1, 1, 2]).size` return 2?

## 2. Conditions and loops

Read `difference()` and `isSubset()` in `modules/set-operations.js`.

```javascript
for (const studentId of setA) {
  if (!setB.has(studentId)) {
    result.add(studentId);
  }
}
```

`for...of` visits values, like Python's `for student_id in set_a`. Braces `{ }` define code blocks. Indentation is still useful, but does not define the blocks as it does in Python. `!` means `not`, `&&` means `and`, and `||` means `or`.

`===` checks strict equality. Text `'1'` and number `1` are different, so `'1' === 1` is false. Dropdown values are text; the page converts IDs into numbers before requesting a calculation.

Unlike Python, **empty arrays, objects, Sets, and Maps are truthy in JavaScript**. Check `.length` for arrays or `.size` for Sets/Maps to determine emptiness. A Map lookup returning `undefined` means no matching entry exists.

The power-set function also uses a numeric loop:

```javascript
for (let index = 0; index < previousCount; index++) {
  // Use one existing subset.
}
```

This resembles `for index in range(previous_count)`. The previous count is stored before adding subsets so the loop does not keep processing its own new additions.

## 3. Functions and return values

```javascript
function difference(setA, setB) {
  // Calculate the result.
  return result;
}
```

This resembles Python's `def difference(set_a, set_b):`. Arguments supply inputs; `return` sends back a result and ends the function call.

`union(...sets)` uses rest parameters to accept several sets, like Python's `*args`. In a call such as `union(...membershipSets)`, the same `...` spelling spreads an array into separate arguments.

| Function | Input | Output |
| --- | --- | --- |
| `union()` | Membership sets | One Set containing every ID found |
| `difference()` | A and B | IDs from A missing from B |
| `isSubset()` | A and B | A Boolean |
| `powerSet()` | Small collection and size limit | An array of subset arrays |
| `combinations()` | Population and committee sizes | An exact BigInt count |

**Try:** For A = `{1, 2, 3}` and B = `{3, 4}`, predict union, intersection, and both differences before running them.

## 4. Arrays, objects, Sets, and Maps

Next read `modules/analytics.js` and `modules/membership-cleanup.js`.

An object groups fields belonging to a record:

```javascript
const student = {
  student_id: 1,
  full_name: 'Sample Student'
};
```

An array contains several records. Common methods are:

| Method | Purpose | Rough Python comparison |
| --- | --- | --- |
| `.map(...)` | Transform every item | A list comprehension |
| `.filter(...)` | Keep matching items | A filtered list comprehension |
| `.every(...)` | Check that all items pass | `all(...)` |
| `.some(...)` | Check whether any item passes | `any(...)` |
| `.find(...)` | Get the first match | A search loop with an early return |
| `.sort(...)` | Order an array | Sorting with a comparison |
| `.join(', ')` | Combine values into text | `', '.join(...)` for strings |

An arrow function such as `student => student.student_id` is a short function passed to these methods. `students.map(student => student.student_id)` builds an array of IDs. A block-style arrow function needs `return` to return a value:

```javascript
students.map(student => {
  return student.student_id;
})
```

`{ ...student, membershipCount: 3 }` copies student fields into a new object and adds a count. It does not add a database column.

Sets keep membership IDs unique. Maps connect IDs to values, such as student ID → organization Set. The duplicate cleaner uses **both** student and organization IDs as its key: student 1 in club 1 differs from student 1 in club 2.

**Try:** Why could counting raw membership rows without deduplicating pairs overstate participation?

## 5. Modules: connecting JavaScript files

Read the imports and exports in `database/db.js`, `modules/analytics.js`, and `main.js`.

```javascript
const { getStudents } = require('./database/db');
```

This loads an exported function, similar to Python's `from database.db import get_students`. The project uses Node's CommonJS module format:

```javascript
module.exports = { getStudents };
```

Importing a function does not call it; `getStudents()` calls it. A missing import can cause an error even if the function exists in another file.

The report script checks `require.main === module`: running it directly generates deliverables, while importing helpers in a test does not overwrite reports. This resembles Python's `if __name__ == '__main__':`.

Separate math from storage so small calculations can be tested without opening Electron or changing records.

## 6. Browser interactions and events

Read one feature in `renderer.js`, then the navigation in `workspace.js`.

```javascript
const button = document.getElementById('calculate-union');
button.addEventListener('click', () => calculateSetOperation('union'));
```

The DOM is the browser's representation of the HTML document. `getElementById()` finds an element with that ID. An event listener runs when something happens, such as a click or selection change.

`document.createElement('tr')` creates a row. `appendChild()` attaches it to the page. `replaceChildren()` clears previous results.

`textContent` displays names and data as plain text. A name containing `<img ...>` therefore cannot become an executable HTML element. This is a security choice.

The report reader, `renderProjectReport()` in `workspace.js`, recognizes simple Markdown headings, lists, and tables. It creates the matching page elements, then fills their contents with `textContent`. This makes reports easier to read while keeping HTML-looking report text harmless; it does not support arbitrary embedded HTML.

Navigation hides pages while keeping their controls in the document. Changing a selection clears old results so they are not mistaken for results for the new choice.

**Trace:** Find an HTML ID, its JavaScript lookup, its event listener, and the function that listener calls.

## 7. Asynchronous code and API requests

Read `preload.js`, one matching `ipcMain.handle(...)` block in `main.js`, and its page function.

```javascript
const result = await window.setAPI.union(selectedIds);
```

A Promise represents a result that becomes available later. `await` waits inside an `async` function while other page work can continue. It does not move every operation into a separate thread.

```javascript
try {
  // Request and display the result.
} catch (error) {
  // Explain a failure.
} finally {
  // Restore controls after either success or failure.
}
```

This resembles Python's `try / except / finally`. Busy flags stop repeated clicks from starting overlapping operations. Controls must be restored after failures so the user can retry.

`ipcRenderer.invoke('sets:union', ids)` sends a local request. `ipcMain.handle('sets:union', ...)` receives it. Their channel names must match exactly.

Main validates the sender and values. A disabled button helps usability but cannot replace validation in main. This is a local single-user school project, so it has no login system. A shared or account-based deployment would need a separate access-control design.

The benchmark uses an actual worker thread because its repeated loops are expensive. DatabaseSync queries are synchronous; the current small queries run in main. This is not a many-user server application.

## 8. HTML: structure and accessibility

Read `index.html` after understanding one JavaScript feature.

- `<section>` groups content; headings describe it.
- `<label for='...'>` connects a label to an input ID.
- `<select>` is a dropdown; option values hold IDs.
- `<fieldset>` and `<legend>` group related controls.
- `<thead>`, `<tbody>`, `<th>`, and `<td>` structure tables.
- Status roles and live regions announce results to assistive technology.
- `hidden` controls which workspace page is visible.
- The Content Security Policy restricts loading scripts, styles, connections, and embedded content.

HTML comments use `<!-- ... -->`; JavaScript comments use `//` or `/* ... */`. Each opening tag should have the correct closing tag where required.

## 9. CSS: presentation

Read `styles.css` next. It controls layout, typography, spacing, colors, and transitions. It does not calculate memberships.

`.class-name` selects a class, `#element-id` selects an ID, and `:disabled` selects disabled controls. Grid and Flexbox arrange items. Media queries adjust narrow-window layouts. `prefers-reduced-motion` removes movement when requested.

Change one style at a time. Avoid changing an HTML ID just to restyle a control: JavaScript may depend on it.

## 10. SQL and database files

Read `database/schema.sql` → `database/seed.js` → `database/db.js`.

| File | Responsibility |
| --- | --- |
| `schema.sql` | Tables, keys, and data rules |
| `seed.js` | Initial simulated data for an empty database |
| `db.js` | SQLite connections and focused read/write functions |

`SELECT` reads records; `INSERT` adds them; `DELETE` removes matching records. A primary key identifies a record. Foreign keys require a membership to refer to existing students and organizations. The composite membership key makes each student–organization pair unique.

Prepared statements use `?` placeholders and supply values separately. Do not build SQL by joining user text into a query. A transaction groups related changes so they succeed together or roll back after failure.

The `.db` file stores actual data and is not a source script to edit manually. Electron's user data folder contains it; the app prints its location when starting.

## 11. Configuration and generated files

- `package.json` is JSON configuration: identity, dependencies, entry file, and commands. JSON does not allow JavaScript comments. This project requires Node 22.13 or newer for its SQLite-based terminal tools.
- `package-lock.json` records installed dependency versions. Let npm maintain it rather than manually editing package versions.
- `.gitignore` keeps dependencies and other excluded files out of source control.
- `node_modules/` contains installed packages. Do not edit or study it as project source.
- `dataset/` contains baseline exports; it does not automatically mirror live membership changes.
- Generated reports in `docs/` record previous measurements and tests. Do not edit numbers to make a report pass; intentionally regenerate them with the script.

In-app export captures current data. The report generator uses an in-memory seed database. This separation protects live membership edits.

## 12. Tests and a study routine

Start with the tiny set examples in `tests/set-relations.test.cjs`. Then read analytics, committee, and focused review tests. `assert.equal(actual, expected)` fails when values differ. A regression test keeps a fixed bug from returning.

Run from the folder containing `package.json`:

```powershell
npm.cmd test
```

Node discovers the test files automatically. There is no separate build command for this unbundled Electron application. Automated tests check math and communication logic, including simulated page controls; they do not certify the real Windows appearance or Save dialog.

The dependency audit was attempted during review but could not reach the npm registry. That is an unverified check, not proof of zero vulnerabilities. Run `npm.cmd audit` when registry access is available.

For each feature:

1. Predict a small result using paper or Python.
2. Read the math function and its focused test.
3. Follow page → preload → main → module/database.
4. Make one intentional change and run tests.
5. Restart the app; try success, empty results, and invalid input.

Suggested sessions: first `difference()` with tiny sets; next the Join organization flow; then participation counts, Jaccard similarity, exact committee counts, and finally the benchmark worker.
