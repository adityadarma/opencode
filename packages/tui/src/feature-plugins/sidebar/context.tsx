import type { AssistantMessage, Session } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo } from "solid-js"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const descendantSessions = createMemo(() => {
    const out: Session[] = []
    const queue = [props.session_id]
    while (queue.length > 0) {
      const sessionID = queue.shift()!
      const children = props.api.state.session.children(sessionID)
      for (const child of children) {
        out.push(child)
        queue.push(child.id)
      }
    }
    return out
  })

  const cost = createMemo(() => {
    const own = session()?.cost ?? 0
    return descendantSessions().reduce((sum, item) => sum + (item.cost ?? 0), own)
  })

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        percent: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })

  const assistantMessages = createMemo(() => msg().filter((item): item is AssistantMessage => item.role === "assistant"))

  const descendantAssistantMessages = createMemo(() =>
    descendantSessions().flatMap((item) =>
      props.api.state.session.messages(item.id).filter((message): message is AssistantMessage => message.role === "assistant"),
    ),
  )

  const sessionTotal = createMemo(() => {
    const own = assistantMessages().reduce(
      (sum, item) =>
        sum + item.tokens.input + item.tokens.output + item.tokens.reasoning + item.tokens.cache.read + item.tokens.cache.write,
      0,
    )
    return descendantSessions().reduce((sum, item) => {
      const tokens = item.tokens
      if (!tokens) return sum
      return sum + tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
    }, own)
  })

  const requestCount = createMemo(() => assistantMessages().length + descendantAssistantMessages().length)

  return (
    <box>
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>{state().tokens.toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>{state().percent ?? 0}% used</text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>
      <text fg={theme().textMuted}>{sessionTotal().toLocaleString()} tokens used (session)</text>
      <text fg={theme().textMuted}>{requestCount()} requests</text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
