export class InterviewSocket {
  private ws: WebSocket | null = null
  private url: string

  constructor(interviewId: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = 'localhost:8000'
    this.url = `${protocol}//${host}/api/interview-stream/${interviewId}`
  }

  connect(
    onMessage: (data: any) => void,
    onAudio: (blob: Blob) => void,
    onError: (err: Event) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => resolve()
      this.ws.onerror = (err) => {
        onError(err)
        reject(err)
      }

      this.ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          onAudio(event.data)
        } else {
          try {
            const data = JSON.parse(event.data)
            onMessage(data)
          } catch {
            // ignore
          }
        }
      }

      this.ws.onclose = () => {
        this.ws = null
      }
    })
  }

  send(data: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  sendAudio(audioBlob: Blob) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioBlob)
    }
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
