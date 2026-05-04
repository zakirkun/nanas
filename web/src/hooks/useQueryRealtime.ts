import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/auth/session';
import { apiOrigin } from '@/api/client';

export type QueryMode = 'diff' | 'full';
export type QueryStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting' | 'error';

export interface QueryEvent {
  subscriptionID: string;
  type: 'insert' | 'update' | 'delete' | string;
  rows: unknown[];
  timestamp: string;
  receivedAt: number;
}

interface QueryRealtimeOptions {
  query: string | null;
  mode: QueryMode;
  enabled?: boolean;
}

interface QueryRealtimeApi {
  status: QueryStatus;
  events: QueryEvent[];
  error: string | null;
  subscriptionID: string | null;
  table: string | null;
  filter: string | null;
  clear: () => void;
  reconnect: () => void;
}

const MAX_BUFFER = 200;

export function useQueryRealtime(
  projectId: string | undefined,
  opts: QueryRealtimeOptions,
): QueryRealtimeApi {
  const { query, mode, enabled = true } = opts;
  const [status, setStatus] = useState<QueryStatus>('idle');
  const [events, setEvents] = useState<QueryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionID, setSubID] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const closedByUs = useRef(false);
  const attempts = useRef(0);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    closedByUs.current = false;
    if (!enabled || !projectId || !query?.trim()) {
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
      setStatus(attempts.current === 0 ? 'connecting' : 'reconnecting');

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempts.current = 0;
        setStatus('open');
        try {
          ws.send(JSON.stringify({ op: 'subscribe', query, mode }));
        } catch (e) {
          setError(String(e));
        }
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
          if (!data || typeof data !== 'object') return;
          if (data.op === 'error') {
            setError(String(data.error ?? 'subscription error'));
            setStatus('error');
            return;
          }
          if (data.op === 'subscribed' && typeof data.subscription_id === 'string') {
            setSubID(data.subscription_id);
            setTableName((data.table as string) ?? null);
            setFilter((data.filter as string) ?? null);
            setError(null);
            return;
          }
          if (data.op === 'event') {
            const evt: QueryEvent = {
              subscriptionID: String(data.subscription_id ?? ''),
              type: String(data.type ?? 'event'),
              rows: Array.isArray(data.rows) ? (data.rows as unknown[]) : [],
              timestamp: String(data.timestamp ?? ''),
              receivedAt: Date.now(),
            };
            setEvents((prev) => [evt, ...prev].slice(0, MAX_BUFFER));
          }
        } catch {
          // ignore non-JSON
        }
      };

      ws.onerror = () => {
        setStatus('error');
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
      const delay = Math.min(1000 * 2 ** attempts.current, 15_000);
      attempts.current += 1;
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
  }, [projectId, enabled, query, mode]);

  return {
    status,
    events,
    error,
    subscriptionID,
    table: tableName,
    filter,
    clear: () => setEvents([]),
    reconnect: () => {
      attempts.current = 0;
      wsRef.current?.close();
    },
  };
}
