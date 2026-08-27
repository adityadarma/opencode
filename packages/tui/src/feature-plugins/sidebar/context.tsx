import type { AssistantMessage } from "@opencode-ai/sdk/v2"
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
  const cost = createMemo(() => session()?.cost ?? 0)

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

  const sessionTotal = createMemo(() =>
    assistantMessages().reduce(
      (sum, item) =>
        sum + item.tokens.input + item.tokens.output + item.tokens.reasoning + item.tokens.cache.read + item.tokens.cache.write,
      0,
    ),
  )

  const requestCount = createMemo(() => assistantMessages().length)

  const cacheHitRatio = createMemo(() => {
    const totals = assistantMessages().reduce(
      (acc, item) => {
        acc.read += item.tokens.cache.read
        acc.input += item.tokens.input
        return acc
      },
      { read: 0, input: 0 },
    )
    const denom = totals.read + totals.input
    return denom > 0 ? Math.round((totals.read / denom) * 100) : null
  })

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
      <text fg={theme().textMuted}>{cacheHitRatio() ?? 0}% cache hit</text>
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
