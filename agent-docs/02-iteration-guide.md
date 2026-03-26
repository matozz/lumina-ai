# How to Iterate on Lumina AI

When you are asked to add features or fix bugs in Lumina AI, follow these guidelines to maintain project health and performance.

## 1. Frontend UI Modifications

### Component Styling
- **Always use `cn()`**: When combining Tailwind classes, especially with conditions, use the `cn` utility from `src/utils/cn.ts`.
  - *Correct*: `className={cn("base-class", condition && "active-class")}`
  - *Incorrect*: `className={\`base-class ${condition ? 'active-class' : ''}\`}`
- **Maintain Component Granularity**: If a component exceeds 200-300 lines, consider breaking it down. For example, `TimelineView` was split into several smaller components to manage complexity.

### Timeline Interactions
- **Do NOT use standard drag-and-drop libraries** (like `react-dnd` or `pragmatic-drag-and-drop`) for the timeline blocks. We use a custom native `PointerEvents` implementation to ensure original blocks move seamlessly and to bypass React's render cycle for performance.
- **Debounce / Throttle**: Any operation during a drag/resize that *must* interact with React state or the backend should be debounced.

## 2. Backend (Rust) Modifications

- **Tauri Commands**: Add new IPC endpoints in `src-tauri/src/commands.rs`. Ensure they are registered in the Tauri builder in `src/lib.rs`.
- **Concurrency**: Use `tokio` for async operations, especially in the `scheduler` or when handling continuous playback loops.
- **Error Handling**: Use Rust's `Result` type robustly. Return stringified errors to the frontend if an IPC command fails, so the user can be notified.

## 3. Workflow for Adding a Feature
1. **Plan**: Understand if the feature requires just Frontend state, or if it needs Backend support.
2. **Draft Types**: Define the TypeScript interfaces (`src/types/`) and Rust `struct`s (`src-tauri/src/...`) first.
3. **Implement Backend**: Write the Rust logic and expose the Tauri `#[command]`.
4. **Implement Frontend**: Build the React components and wire them up to the Tauri command using `@tauri-apps/api/core` `invoke`.
5. **Test**: Run `pnpm run build` to ensure types align and no compilation errors exist in the frontend, and `cargo build` for the backend.