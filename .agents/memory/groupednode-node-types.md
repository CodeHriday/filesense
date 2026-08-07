---
name: GroupedNode must cover all lineage node types
description: When a new node type is added to the lineage graph service, GroupedNode must be updated or the PropTypes failure co-occurs with a "Invalid hook call" warning that can crash the ReactFlow canvas.
---

## Rule
Whenever a new node type is returned from `lineageGraphService`, update ALL of the following in `GroupedNode.jsx`:
1. `getTypeColor(type)` switch — add a colour case
2. `getTypeName(type)` switch — add a human-readable plural name
3. `PropTypes.oneOf([...])` list in `groupType`

**Why:** `applyNodeGrouping` in `LineagePage.jsx` groups multiple same-type nodes at the same graph level into a single `grouped` node. The `groupType` field is set to the raw node type string. If that string is not in PropTypes `oneOf`, React fires a validation error in the same millisecond as an "Invalid hook call" warning inside ReactFlow's NodeWrapper renderer. In both observed crash sessions this combination produced an `unhandlederror: "An uncaught exception occurred but the error was not an error object."` that crashed the lineage graph page.

**How to apply:** After any backend change that adds new node types (e.g., `targetFile`, `workflow`), run a quick grep for `GroupedNode` and verify all three structures above include the new type. Also update the `MiniMap nodeColor` map and legend panel in `LineagePage.jsx` if the type is user-visible. The ReactFlow canvas is now wrapped in `ErrorBoundary componentName="LineageGraph"` to contain future rendering crashes at the graph level.
