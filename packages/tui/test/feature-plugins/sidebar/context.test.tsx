/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { AssistantMessage, Session } from "@opencode-ai/sdk/v2"
import { ThemeProvider } from "../../../src/context/theme"
import { KVProvider } from "../../../src/context/kv"
import { TuiConfigProvider } from "../../../src/config"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiPluginApi } from "../../fixture/tui-plugin"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import sidebarContextPlugin from "../../../src/feature-plugins/sidebar/context"

function session(overrides: Partial<Session> & { id: string }): Session {
  return {
    slug: overrides.id,
    projectID: "project-1",
    directory: "/repo",
    title: "Session",
    version: "1",
    time: { created: 0, updated: 0 },
    ...overrides,
  } as Session
}

function assistantMessage(overrides: Partial<AssistantMessage> & { id: string }): AssistantMessage {
  return {
    role: "assistant",
    sessionID: "session-1",
    modelID: "model-1",
    providerID: "provider-1",
    mode: "build",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    path: { cwd: "/repo", root: "/repo" },
    time: { created: 0 },
    ...overrides,
  } as AssistantMessage
}

async function renderSidebarContext(input: {
  sessionID: string
  sessions: Session[]
  messages: Record<string, AssistantMessage[]>
}) {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const sessionsByID = new Map(input.sessions.map((item) => [item.id, item]))
  const base = createTuiPluginApi({
    state: {
      session: {
        get: (id: string) => sessionsByID.get(id),
        children: (id: string) => input.sessions.filter((item) => item.parentID === id),
        messages: (id: string) => input.messages[id] ?? [],
      },
    },
  })
  let render: ((ctx: unknown, props: { session_id: string }) => unknown) | undefined
  const api = {
    ...base,
    state: { ...base.state, provider: [] },
    slots: {
      register(plugin: { slots: Record<string, unknown> }) {
        render = plugin.slots.sidebar_content as typeof render
        return "test-slot"
      },
    },
  } satisfies TuiPluginApi

  await sidebarContextPlugin.tui(api, undefined, { id: "internal:sidebar-context" } as never)
  if (!render) throw new Error("sidebar_content slot was not registered")

  const config = createTuiResolvedConfig()
  const app = await testRender(
    () => (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <TuiConfigProvider config={config}>
          <KVProvider>
            <ThemeProvider mode="dark">{render!(undefined, { session_id: input.sessionID }) as never}</ThemeProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 60, height: 20 },
  )
  let frame = ""
  for (let i = 0; i < 30; i++) {
    await app.renderOnce()
    await new Promise((r) => setTimeout(r, 20))
    frame = app.captureCharFrame()
    if (frame.includes("spent")) break
  }
  app.renderer.destroy()
  return frame
}

test("sidebar cost/tokens roll up usage from subagent (task tool) child sessions", async () => {
  const frame = await renderSidebarContext({
    sessionID: "session-1",
    sessions: [
      session({ id: "session-1", cost: 1, tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } }),
      session({
        id: "session-2",
        parentID: "session-1",
        cost: 2,
        tokens: { input: 20, output: 8, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
    ],
    messages: {
      "session-1": [
        assistantMessage({
          id: "message-1",
          tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
        }),
      ],
    },
  })

  // own (1) + child (2) = 3 total spent
  expect(frame).toContain("$3.00 spent")
  // own tokens (10+5=15) + child tokens (20+8=28) = 43
  expect(frame).toContain("43 tokens used (session)")
})

test("sidebar cost/tokens roll up recursively through nested subagents", async () => {
  const frame = await renderSidebarContext({
    sessionID: "session-1",
    sessions: [
      session({ id: "session-1", cost: 1, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }),
      session({
        id: "session-2",
        parentID: "session-1",
        cost: 2,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
      session({
        id: "session-3",
        parentID: "session-2",
        cost: 4,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
    ],
    messages: {},
  })

  // 1 (own) + 2 (child) + 4 (grandchild) = 7
  expect(frame).toContain("$7.00 spent")
})

test("sidebar cost falls back to own session when there are no child sessions", async () => {
  const frame = await renderSidebarContext({
    sessionID: "session-1",
    sessions: [session({ id: "session-1", cost: 1.5 })],
    messages: {},
  })

  expect(frame).toContain("$1.50 spent")
})
