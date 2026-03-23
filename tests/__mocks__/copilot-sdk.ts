export class CopilotClient {
  async start() {}
  async stop() {}
  async createSession() {
    return {
      on: () => () => {},
      sendAndWait: async () => ({ data: { content: '' } }),
      disconnect: async () => {},
      abort: async () => {}
    }
  }
}

export function approveAll() { return true }
