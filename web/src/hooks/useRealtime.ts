import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/auth/session';
import { apiOrigin } from '@/api/client';

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface RealtimeEvent {
  channel: string;
  payload: unknown;
  receivedAt: number;
}

interface RealtimeOptions {
  channels: string[];
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

interface RealtimeApi {
  status: RealtimeStatus;
  events: RealtimeEvent[];
  clear: () => void;
  reconnect: () => void;
}

const MAX_BUFFER = 200;

export function useRealtime(projectId: string | undefined, opts: RealtimeOptions): RealtimeApi {
  const { channels, enabled = true, onEvent } = opts;
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const closedByUs = useRef(false);

  useEffect(() => {
    closedByUs.current = false;
    if (!enabled || !projectId) {
      setStatus('idle');
      return;
    }

    const connect = () => {
      const token = useSession.getState().token;
      if (!token) {
        setStatus('closed');
        return;
      }
      const origin = apiOrigin();
      const wsScheme = origin.startsWith('https') ? 'wss' : 'ws';
      const httpOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '');
      const host = httpOrigin.replace(/^https?:\/\//, '');
      const url = `${wsScheme}://${host}/v1/projects/${projectId}/realtime/ws?access_token=${encodeURIComponent(token)}`;
      setStatus(attemptsRef.current === 0 ? 'connecting' : 'reconnecting');

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setStatus('open');
        try {
          ws.send(JSON.stringify({ op: 'subscribe', channels }));
        } catch {
          // ignore
        }
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
          const channel =
            (data && typeof data === 'object' && 'channel' in data && typeof data.channel === 'string'
              ? data.channel
              : 'event') ?? 'event';
          const payload = (data && typeof data === 'object' && 'payload' in data ? data.payload : data) as unknown;
          const next: RealtimeEvent = { channel, payload, receivedAt: Date.now() };
          setEvents((prev) => [next, ...prev].slice(0, MAX_BUFFER));
          onEvent?.(next);
        } catch {
          // ignore non-JSON frames
        }
      };
      ws.onerror = () => {
        // browser will fire onclose right after
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (closedByUs.current) {
          setStatus('closed');
          return;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 15_000);
      attemptsRef.current += 1;
      setStatus('reconnecting');
      reconnectTimer.current = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, channels.join('|')]);

  return {
    status,
    events,
    clear: () => setEvents([]),
    reconnect: () => {
      attemptsRef.current = 0;
      wsRef.current?.close();
    },
  };
}
