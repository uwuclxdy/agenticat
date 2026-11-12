# App Loop, Events and Terminal Lifecycle

Load when structuring a ratatui app: `main`, the event loop, input handling, terminal setup and teardown, panics, async, or handing the terminal to a child process.
For ratatui 0.30.2 on crossterm 0.29. `patterns.md` has the minimal `ratatui::run` loop; this file adds what goes around it.

## Lifecycle Path

| The app is | Use |
|---|---|
| fullscreen, default backend | `ratatui::run(app)` (0.30), or `init()` + `restore()` (0.28.1) |
| inline or fixed viewport | `ratatui::init_with_options(ratatui::TerminalOptions { viewport: ratatui::Viewport::Inline(8) })` (fixed: `ratatui::Viewport::Fixed(rect)`): raw mode but no alternate screen, so never for fullscreen; every exit calls `ratatui::restore()` (0.28.1) |
| on another writer or backend | `Terminal::new(backend)` (only the backend; another viewport: `Terminal::with_options(backend, ratatui::TerminalOptions { viewport })`) and the manual path below |

- Backend writer: `stdout()`. When stdout must stay free for program output, buffer stderr: `CrosstermBackend::new(BufWriter::new(stderr()))`. That terminal is a `Terminal<CrosstermBackend<BufWriter<Stderr>>>`, not a `DefaultTerminal` (stdout).
- Send `EnterAlternateScreen`/`LeaveAlternateScreen` to the stream the backend writes to.
- Undo every extra mode set up (`ratatui::crossterm::event::{DisableMouseCapture, DisableBracketedPaste}`) in teardown, mouse capture in the panic hook too: `ratatui::restore()` undoes neither.
- Install a signal handler that restores the terminal when the app must survive a SIGTERM or SIGHUP kill: the kill skips `restore()`.

## Manual Path

`Terminal::new` and `CrosstermBackend::new` switch nothing on: no raw mode, no alternate screen, no panic hook. Do all three; undo them on every exit, error and panic included.

```rust
use std::io::{self, stdout};
use ratatui::crossterm::execute;
use ratatui::crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use ratatui::{Terminal, backend::CrosstermBackend};

fn restore_terminal() {
    // no unwrap or expect, no `?`: a panic while restoring hides the first one
    let _ = execute!(stdout(), LeaveAlternateScreen);
    let _ = disable_raw_mode();
}

fn run() -> io::Result<()> {
    enable_raw_mode()?; // setup errors get the teardown too
    execute!(stdout(), EnterAlternateScreen)?;
    let mut terminal = Terminal::new(CrosstermBackend::new(stdout()))?;
    terminal.draw(|frame| frame.render_widget("hello", frame.area()))?;
    Ok(())
}

fn main() -> io::Result<()> {
    let hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        restore_terminal(); // restore first
        hook(info); // then the original report
    }));
    let result = run(); // no `?` here: teardown must run
    restore_terminal();
    result
}
```

## Event Loop

| The app | Reads input |
|---|---|
| changes only on input | with a blocking `event::read()` in the loop |
| ticks, animates or receives background results | on a thread that polls crossterm and sends an app-level `Event` over `std::sync::mpsc` |
| runs on tokio | in a task (Async, below) |

```rust
use std::{sync::mpsc, thread, time::{Duration, Instant}};
use ratatui::crossterm::event::{
    self, Event as TermEvent, KeyCode, KeyEvent, KeyEventKind, KeyModifiers,
};
use ratatui::{DefaultTerminal, buffer::Buffer, layout::Rect, text::Line, widgets::Widget};

enum Event { Key(KeyEvent), Resize, Tick }
enum Action { Quit, Increment }

#[derive(Default)]
struct App { counter: u64, exit: bool }

impl Widget for &App { // root widget: render only reads state
    fn render(self, area: Rect, buf: &mut Buffer) {
        Line::from(format!("count: {}", self.counter)).render(area, buf);
    }
}

fn spawn_input(tick_rate: Duration) -> mpsc::Receiver<Event> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut last_tick = Instant::now();
        loop {
            let timeout = tick_rate.saturating_sub(last_tick.elapsed());
            let event = match event::poll(timeout) {
                Ok(true) => match event::read() {
                    // the Press gate lives here, once
                    Ok(TermEvent::Key(key)) if key.kind == KeyEventKind::Press => Some(Event::Key(key)),
                    Ok(TermEvent::Resize(..)) => Some(Event::Resize),
                    Ok(_) => None,
                    Err(_) => break,
                },
                Ok(false) => None,
                Err(_) => break,
            };
            // every pass: input bursts cannot starve the Tick
            let tick = if last_tick.elapsed() >= tick_rate {
                last_tick = Instant::now(); // reset: one Tick per tick_rate
                Some(Event::Tick)
            } else {
                None
            };
            for event in [event, tick].into_iter().flatten() {
                if tx.send(event).is_err() {
                    return; // receiver dropped
                }
            }
        }
    });
    rx
}

fn action_for(event: &Event) -> Option<Action> {
    let Event::Key(key) = event else { return None }; // Resize, Tick: just redraw
    match key.code {
        // raw mode: Ctrl-C is a key event, not SIGINT
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => Some(Action::Quit),
        KeyCode::Char('q') => Some(Action::Quit),
        KeyCode::Char('j') => Some(Action::Increment),
        _ => None,
    }
}

fn update(app: &mut App, action: Action) -> Option<Action> {
    match action {
        Action::Quit => app.exit = true,
        Action::Increment => app.counter += 1,
    }
    None // `Some(next)` chains a follow-up action
}

fn run_app(terminal: &mut DefaultTerminal) -> std::io::Result<()> {
    let events = spawn_input(Duration::from_millis(250));
    let mut app = App::default();
    while !app.exit {
        terminal.draw(|frame| frame.render_widget(&app, frame.area()))?;
        let Ok(event) = events.recv() else { break }; // input thread ended
        let mut next = action_for(&event);
        while let Some(action) = next {
            next = update(&mut app, action);
        }
    }
    Ok(())
}

fn main() -> std::io::Result<()> {
    ratatui::run(run_app)
}
```

- In a loop that must tick, `if event::poll(t)? { event::read()? }` inline stalls every pass for up to the timeout: read on the thread.
- One place reads events and dispatches them (`handle_key`, `handle_mouse`, an `Action`). Never an `event::read()` per screen.
- Events come from `ratatui::crossterm::event`; `ratatui::event` does not exist.
- Keys become an `Action`; one `update(&mut app, action) -> Option<Action>` applies it. No `Action::None` variant. Remappable keys: a `HashMap<KeyCode, Action>` loaded from config.
- Raw mode disables Ctrl-C: bind it and a quit key.
- `Event::Resize` needs no code in a fullscreen or inline app: the next `draw` renders at the new size. Never `draw`, `clear` or `terminal.resize(..)` in its arm, no layout from its `(w, h)` or `terminal.size()`. Exception: a `Viewport::Fixed` app is never resized for you: when its region should change, build the new `Rect` for your region (its own `x`/`y`, a width and height that fit inside `terminal.size()?`) and call `terminal.resize(rect)?` there. A narrower `rect` comes back at `y = 0` (ratatui resets `y` and clears the screen on a width shrink): call `terminal.resize(rect)?` a second time to restore its `y`.

## Draw Pass

- Call `terminal.draw` inside the loop, not once in place of it: a fullscreen or inline viewport applies its resize during a draw pass.
- A later `render_widget` overwrites the cells of an earlier one: draw order is the z-order, so render a popup after what it covers.
- One cursor path per app: `frame.set_cursor_position(..)` inside `draw` (a frame that skips it hides the cursor), or the `Terminal` cursor methods (`show_cursor`, `hide_cursor`, `set_cursor_position`) outside it. The next draw may overwrite the other path.
- Render only through `terminal.draw` / `try_draw`. A direct backend write (`terminal.backend_mut()`) bypasses the diff: follow it with `terminal.clear()?` or a full draw.

## Draw Errors

```rust
// does not compile
terminal.draw(|frame| { let text = load()?; })?; // WRONG: the closure returns `()`
```

```rust
// fragment
terminal.try_draw(|frame| -> io::Result<()> { let text = load()?; Ok(()) })?; // RIGHT (0.28)
```

- Propagate a `draw`/`try_draw` error, restore, exit. Only your own callback's error leaves the terminal untouched; a backend error may have written half a frame. Never swallow it and draw on.

## Async

```rust
// fragment
fn main() { tokio::spawn(work()); } // WRONG: panics, no runtime

#[tokio::main]
async fn main() { tokio::spawn(work()); } // RIGHT
```

- Input: a task reading `crossterm::event::EventStream::new()`, sending over `tokio::sync::mpsc::unbounded_channel()`. A `std::sync::mpsc` `recv()` blocks the runtime.
- Async `Cargo.toml`: `crossterm = { version = "0.29", features = ["event-stream"] }` (ratatui has no such feature), `futures = "0.3"` (`use futures::{FutureExt, StreamExt};`), `tokio = { version = "1", features = ["full"] }`, `tokio-util = "0.7"` (`tokio_util::sync::CancellationToken`).
- A failed `send` means the receiver is gone: `break`, never `.unwrap()` or `.expect(..)`.
- Race input against the tick: `tokio::select! { e = reader.next().fuse() => .., _ = interval.tick() => .. }` (`interval`: `tokio::time::interval(..)`). Sequential awaits stall every key until the next tick.
- Frame rate: send an `Event::Render` on its own interval and call `terminal.draw` for it, not per key.
- Slow work: `tokio::spawn` a task that sends the resulting `Action` back over the channel. Never `.await` a sleep or long call in `update`: the UI freezes.

## App Structure

- Modules, declared in `main.rs`: `app` (state), `event`, `tui` (terminal), `ui` (render), `update`.
- One `App` struct holds the state; pass `&App`/`&mut App` to what needs it. Split it once chains like `app.a.b.c.items[..]` spread or threads queue on its `Mutex`.
- Text kept in state is built from `String`s: `Line::from(name.to_string())` owns its content (`Line::from(&str)` borrows), a `.clone()` of a borrowed `Span`/`Line`/`Text` keeps the borrow.
- State changes go through `App` methods or `update`, so a test needs no `Terminal`: `update(&mut app, Action::Increment); assert_eq!(app.counter, 1);`.
- Modes are one enum field, never `editing: bool, viewing_list: bool`: both true is an invalid state.
- Root widget: `impl Widget for &App`; its `render` lays out the children. A section becomes its own widget struct with explicit fields, not a helper taking `&App`.
- Rendering borrows state immutably (`ui(frame, &app)`); `&mut` only for a stateful widget's state.
- One error crate per app (`anyhow`, `eyre` or `color-eyre`). `color-eyre`: `main` returns `color_eyre::Result<()>` and starts with `color_eyre::install()?`, before `ratatui::run`/`init`; context is `.wrap_err("failed to load config")?` (`use color_eyre::eyre::WrapErr`). `eyre`: the same `.wrap_err` (`use eyre::WrapErr`), no `install()`. `anyhow`: no `install()`; context is `.context(..)?` (`use anyhow::Context`). Early return: `anyhow::bail!`, `eyre::bail!`, `color_eyre::eyre::bail!`; messages lowercase, no trailing punctuation.
- Import by name: `use ratatui::prelude::*` lacks `Styled` (`ratatui::style::Styled`) and `CompletedFrame`, `TerminalOptions`, `Viewport` (crate root, `ratatui::Viewport`; there is no `ratatui::terminal`) (0.27), and its `Position`/`Size` collide with local names.

## Output and Child Processes

- Print program output after `run` returns or after `restore()`: on the alternate screen it vanishes.
- No `println!`/`eprintln!`/`dbg!` while the TUI is up: they corrupt the frame. Log to a file with `tracing` (`tracing_subscriber::fmt().with_writer(file).init()`; `fmt::layer()` alone installs nothing), or render a toggleable debug overlay in its own area. `clippy::dbg_macro`; `clippy::print_stdout`, `clippy::print_stderr` only on modules that run while the TUI is up (`#[warn(clippy::print_stdout, clippy::print_stderr)] mod ui;`): crate-wide they also flag the output printed after teardown.
- Editor or pager, out: stop the input reader, or it reads the child's input (tokio: `token.cancel()`, with `_ = token.cancelled() => break` in its `select!`); undo the extra modes; `LeaveAlternateScreen` on the backend's writer; `disable_raw_mode()?`; run the child (`std::process::Command`). Back in: `enable_raw_mode()?`, `EnterAlternateScreen`, the extra modes again, restart the reader (a new `CancellationToken`, a re-spawned task), `terminal.clear()?`, draw.
- After changing modes or screens run a full `draw`, never `terminal.flush()`: it may replay a diff computed for the old screen.

## Diff Checklist

- Fullscreen uses `run`/`init`; `init_with_options` ends in `restore()`; a hand-built `Terminal` has raw mode, alternate screen, a restoring panic hook and teardown on the error path.
- Ctrl-C and a quit key exit; the `Event::Resize` arm draws nothing.
- One event reader, `Press` gated there, keys mapped to `Action`s, one `update`.
- No `?` in a `draw` closure; no draw error swallowed.
- Async: `#[tokio::main]`, tokio channels, no slow `.await` in `update`, no `.unwrap()`/`.expect(..)` on a `send`.
- No `println!`/`eprintln!`/`dbg!` while the TUI is up; program output printed after teardown.
- Around a child process: reader stopped and restarted, extra modes undone and set again, `clear()` before the next draw.
